# Lambda BaseInfo 함수 비교 분석 및 개선안

이 문서는 3개의 유사한 Lambda 함수를 비교 분석하고 코드 개선안을 제시합니다.

---

## 1. 함수 개요

| 파일명 | 용도 | S3 경로 |
|--------|------|---------|
| `DSWorkBaseInfo.py` | 방제 작업 기본정보 | `dsbaseinfo/work/`, `dsbaseinfo/common/` |
| `DSGEOBaseInfoLambda.py` | GEO 시스템 기본정보 | `dsbaseinfo/geo/`, `dsbaseinfo/common/` |
| `dsOutBaseinfo.py` | Out Record 기본정보 | `dsbaseinfo/outrecord/`, `dsbaseinfo/common/` |

---

## 2. 코드 비교

### 2.1 공통 함수 (거의 동일)

#### `load_all_json_from_prefix()` - 100% 동일
```python
def load_all_json_from_prefix(bucket_name: str, prefix: str):
    s3 = boto3.client('s3')
    result_dict = {}
    response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
    # ... 동일한 로직
```

#### `save_json_by_key_to_s3()` - 99% 동일 (경로만 다름)
| 파일 | 저장 경로 |
|------|----------|
| DSWorkBaseInfo | `work/{key}.json` |
| DSGEOBaseInfoLambda | `geo/{key}.json` |
| dsOutBaseinfo | `outrecord/{key}.json` |

### 2.2 핸들러 구조 비교

| 항목 | DSWorkBaseInfo | DSGEOBaseInfo | dsOutBaseinfo |
|------|----------------|---------------|---------------|
| HTTP 메서드 분기 | 별도 함수로 분리 | 인라인 처리 | 별도 함수로 분리 |
| GET 처리 | `get_data()` | 인라인 | `get_data()` |
| PUT/POST 처리 | `replace_data()` | 인라인 | `replace_data()` |
| DELETE 지원 | 선언만 있음 | 없음 | 선언만 있음 |
| 사용자 구분 | 없음 | user 파라미터 | mapdscourseid |
| 백업 기능 | 있음 (dsworkbase) | 있음 (dsgeousergrp) | 없음 |

### 2.3 데이터 읽기 로직 비교

```
DSWorkBaseInfo:
  common/ + work/ → 병합 반환

DSGEOBaseInfoLambda:
  - user != 'dsgeoadmin': 개별 사용자 파일 (dsgeousergrp/{user}/base.json)
  - user == 'dsgeoadmin': common/ + geo/ → 병합 반환

dsOutBaseinfo:
  - outrecord/ + dsOrgList.json + course_names 매핑 → 병합 반환
```

---

## 3. 문제점 분석

### 3.1 코드 중복 (Critical)
- `load_all_json_from_prefix()`: 3개 파일에 **완전 동일** 코드
- `save_json_by_key_to_s3()`: 3개 파일에 **거의 동일** (경로만 다름)
- 중복률: **약 60-70%**

### 3.2 일관성 부재
| 문제 | 상세 |
|------|------|
| JSON 라이브러리 | `json` vs `simplejson` 혼용 |
| 에러 응답 형식 | 문자열 vs JSON 객체 혼용 |
| 메서드 분기 방식 | 함수 분리 vs 인라인 혼용 |
| 백업 로직 | 일부만 구현 |

### 3.3 미사용/데드 코드
- `delete_data()` 함수 호출되지만 정의 없음
- 주석 처리된 레거시 코드 다수
- `flg`, `outflg` 파라미터 받지만 사용 안함

### 3.4 보안/안정성
- 에러 처리 불완전
- 입력값 검증 없음
- S3 클라이언트 중복 생성

---

## 4. 개선안

### 4.1 공통 유틸리티 모듈 분리

**`s3_utils.py` (공통 모듈)**
```python
import json
import boto3
from datetime import datetime
from typing import Dict, List, Optional

s3 = boto3.client('s3')

# 제외할 키 목록 (상수화)
EXCLUDED_KEYS = ["mapdscourseid", "dsmapcourseid", "user", "User", "users"]
COMMON_KEYS = ['dsOrgList', 'dsworkcourse_info', 'mapcourse_info']


def load_all_json_from_prefix(bucket_name: str, prefix: str) -> Dict:
    """S3 prefix 경로의 모든 JSON 파일을 로드하여 딕셔너리로 반환"""
    result_dict = {}

    try:
        response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)

        if 'Contents' not in response:
            return result_dict

        for obj in response['Contents']:
            key = obj['Key']
            if key.endswith('.json'):
                try:
                    content = s3.get_object(Bucket=bucket_name, Key=key)
                    file_content = content['Body'].read().decode('utf-8')
                    filename = key.split('/')[-1].replace('.json', '')
                    result_dict[filename] = json.loads(file_content)
                except Exception as e:
                    print(f"Error reading {key}: {e}")
    except Exception as e:
        print(f"Error listing objects: {e}")

    return result_dict


def save_json_by_key_to_s3(
    data_dict: Dict,
    bucket_name: str,
    prefix: str,  # 'work/', 'geo/', 'outrecord/'
    common_keys: List[str] = None
) -> List[str]:
    """데이터를 키별로 개별 JSON 파일로 S3에 저장"""
    if common_keys is None:
        common_keys = COMMON_KEYS

    results = []

    for key, value in data_dict.items():
        if key in EXCLUDED_KEYS:
            continue

        s3_key = f"common/{key}.json" if key in common_keys else f"{prefix}{key}.json"

        try:
            s3.put_object(
                Bucket=bucket_name,
                Key=s3_key,
                Body=json.dumps(value, ensure_ascii=False, indent=2).encode('utf-8')
            )
            results.append(f"Saved {key} to s3://{bucket_name}/{s3_key}")
        except Exception as e:
            results.append(f"Error saving {key}: {e}")

    return results


def backup_file(bucket: str, key: str) -> bool:
    """기존 파일을 타임스탬프와 함께 백업"""
    try:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_key = f"{key}.backup_{timestamp}"
        s3.copy_object(
            Bucket=bucket,
            CopySource={'Bucket': bucket, 'Key': key},
            Key=backup_key
        )
        return True
    except Exception as e:
        print(f"Backup failed: {e}")
        return False


def get_json_from_s3(bucket: str, key: str) -> Optional[Dict]:
    """S3에서 단일 JSON 파일 로드"""
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        content = response['Body'].read().decode('utf-8')
        return json.loads(content)
    except Exception as e:
        print(f"Error fetching {key}: {e}")
        return None


def create_response(status_code: int, body, headers: Dict = None) -> Dict:
    """표준화된 응답 객체 생성"""
    response = {
        'statusCode': status_code,
        'body': body
    }
    if headers:
        response['headers'] = headers
    return response


def create_error_response(status_code: int, message: str) -> Dict:
    """표준화된 에러 응답 생성"""
    return create_response(
        status_code,
        {'error': message},
        {'Content-Type': 'application/json'}
    )
```

### 4.2 통합 Lambda 핸들러

**`base_info_handler.py` (통합 핸들러)**
```python
import json
from s3_utils import (
    load_all_json_from_prefix,
    save_json_by_key_to_s3,
    backup_file,
    get_json_from_s3,
    create_response,
    create_error_response,
    COMMON_KEYS
)

# 서비스별 설정
SERVICE_CONFIG = {
    'work': {
        'bucket': 'dsbaseinfo',
        'prefix': 'work/',
        'backup_bucket': 'dsworkbase',
        'backup_key': 'baseinfo/base_total.json'
    },
    'geo': {
        'bucket': 'dsbaseinfo',
        'prefix': 'geo/',
        'user_bucket': 'dsgeousergrp',
        'admin_user': 'dsgeoadmin'
    },
    'outrecord': {
        'bucket': 'dsbaseinfo',
        'prefix': 'outrecord/'
    }
}


class BaseInfoHandler:
    """기본 정보 처리를 위한 통합 핸들러"""

    def __init__(self, service_type: str):
        self.config = SERVICE_CONFIG.get(service_type)
        if not self.config:
            raise ValueError(f"Unknown service type: {service_type}")
        self.service_type = service_type

    def handle(self, event, context):
        """메인 핸들러"""
        method = event.get('context', {}).get('http-method', '')

        handlers = {
            'GET': self.get_data,
            'PUT': self.replace_data,
            'POST': self.replace_data,
            'DELETE': self.delete_data
        }

        handler = handlers.get(method)
        if not handler:
            return create_error_response(405, 'Method Not Allowed')

        try:
            return handler(event)
        except Exception as e:
            return create_error_response(500, str(e))

    def get_data(self, event):
        """데이터 조회"""
        bucket = self.config['bucket']
        prefix = self.config['prefix']

        # 공통 데이터 + 서비스별 데이터 병합
        common = load_all_json_from_prefix(bucket, 'common/')
        service_data = load_all_json_from_prefix(bucket, prefix)

        merged = {**common, **service_data}
        return create_response(200, merged)

    def replace_data(self, event):
        """데이터 저장"""
        data = event.get('body-json', {})

        # 백업 (설정된 경우)
        if 'backup_bucket' in self.config:
            backup_file(
                self.config['backup_bucket'],
                self.config['backup_key']
            )

        # 저장
        results = save_json_by_key_to_s3(
            data,
            self.config['bucket'],
            self.config['prefix'],
            COMMON_KEYS
        )

        return create_response(200, {'results': results})

    def delete_data(self, event):
        """데이터 삭제 (미구현)"""
        return create_error_response(501, 'Delete not implemented')


# 각 서비스별 핸들러 인스턴스
work_handler = BaseInfoHandler('work')
geo_handler = BaseInfoHandler('geo')
outrecord_handler = BaseInfoHandler('outrecord')


# Lambda 진입점
def lambda_handler_work(event, context):
    return work_handler.handle(event, context)

def lambda_handler_geo(event, context):
    return geo_handler.handle(event, context)

def lambda_handler_outrecord(event, context):
    return outrecord_handler.handle(event, context)
```

### 4.3 GEO 서비스 특화 로직 (사용자별 처리)

```python
class GeoBaseInfoHandler(BaseInfoHandler):
    """GEO 서비스 특화 핸들러 (사용자별 데이터 지원)"""

    def get_data(self, event):
        user = event.get('params', {}).get('querystring', {}).get('user')

        if not user:
            return create_error_response(400, 'user parameter required')

        # 관리자: 전체 데이터 반환
        if user == self.config['admin_user']:
            return super().get_data(event)

        # 일반 사용자: 개별 파일 반환
        user_key = f"{user}/base.json"
        data = get_json_from_s3(self.config['user_bucket'], user_key)

        if data is None:
            return create_error_response(404, f'User data not found: {user}')

        return create_response(200, data)

    def replace_data(self, event):
        user = event.get('params', {}).get('querystring', {}).get('user')

        if not user:
            return create_error_response(400, 'user parameter required')

        # 관리자: 공통 저장
        if user == self.config['admin_user']:
            return super().replace_data(event)

        # 일반 사용자: 개별 파일 저장
        user_key = f"{user}/base.json"
        backup_file(self.config['user_bucket'], user_key)

        # 저장 로직...
        return create_response(200, {'message': 'Saved'})
```

---

## 5. 개선 효과

| 항목 | Before | After |
|------|--------|-------|
| 코드 라인 수 | ~400 (3파일) | ~200 (공통+핸들러) |
| 중복 코드 | 60-70% | 0% |
| 유지보수성 | 낮음 (3곳 수정) | 높음 (1곳 수정) |
| 테스트 용이성 | 어려움 | 클래스 단위 테스트 가능 |
| 에러 처리 | 불일치 | 표준화 |

---

## 6. 마이그레이션 단계

### Phase 1: 공통 모듈 생성
1. `s3_utils.py` Lambda Layer로 배포
2. 기존 Lambda에서 import하여 사용

### Phase 2: 점진적 교체
1. 새 핸들러 테스트 환경 배포
2. API Gateway에서 A/B 테스트
3. 문제없으면 교체

### Phase 3: 레거시 제거
1. 기존 Lambda 함수 비활성화
2. 모니터링 후 삭제

---

## 7. 추가 권장 사항

### 7.1 환경 변수 사용
```python
import os

BUCKET_NAME = os.environ.get('S3_BUCKET', 'dsbaseinfo')
SERVICE_PREFIX = os.environ.get('SERVICE_PREFIX', 'work/')
```

### 7.2 로깅 표준화
```python
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def save_json_by_key_to_s3(...):
    logger.info(f"Saving {key} to {bucket_name}/{s3_key}")
```

### 7.3 입력 검증
```python
def validate_request(event):
    """요청 검증"""
    if 'body-json' not in event:
        raise ValueError("Request body required")

    if not isinstance(event['body-json'], dict):
        raise ValueError("Request body must be JSON object")
```

---

## 8. 파일 구조 제안

```
AWS/
├── layers/
│   └── common/
│       └── python/
│           ├── s3_utils.py          # 공통 S3 유틸리티
│           └── response_utils.py    # 응답 표준화
├── handlers/
│   ├── base_info_handler.py         # 통합 핸들러
│   ├── work_handler.py              # Work 전용 (필요시)
│   ├── geo_handler.py               # GEO 전용 (사용자 로직)
│   └── outrecord_handler.py         # OutRecord 전용 (필요시)
└── tests/
    ├── test_s3_utils.py
    └── test_handlers.py
```
