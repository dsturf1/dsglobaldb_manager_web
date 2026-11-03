# 방제 작업 모듈 문서

이 문서는 방제 작업 관련 3개 모듈(DSWorkBaseInfo, DSWorkCourse, DSMapCourse)에 대해 설명합니다.

---

# 목차

1. [DSWorkBaseInfo - 방제 기본 정보 관리](#1-dsworkbaseinfo---방제-기본-정보-관리)
2. [DSWorkCourse - 방제 작업 골프장 관리](#2-dsworkcourse---방제-작업-골프장-관리)
3. [DSMapCourse - MAP 시스템 골프장 관리](#3-dsmapcourse---map-시스템-골프장-관리)
4. [모듈 비교](#4-모듈-비교)

---

# 1. DSWorkBaseInfo - 방제 기본 정보 관리

방제 작업에 필요한 기본 정보(조직, 용역, 작업, 차량)를 관리하는 모듈입니다.

## 1.1 API 정보

### Base URL
```
https://e0x0fsw125.execute-api.us-east-1.amazonaws.com/dev
```

### 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/baseinfo` | 방제 기본 정보 전체 조회 |
| PUT | `/baseinfo` | 방제 기본 정보 업데이트 |
| POST | `/baseinfo` | 방제 기본 정보 업데이트 (PUT과 동일) |

## 1.2 데이터 저장소

데이터는 **AWS S3** 버킷에 JSON 파일로 저장됩니다.

### S3 버킷 구조
```
dsbaseinfo/
├── common/              # 공통 데이터
│   ├── dsOrgList.json
│   ├── dsworkcourse_info.json
│   └── mapcourse_info.json
└── work/                # 작업 관련 데이터
    ├── org_info.json
    ├── outsource_info.json
    ├── task_info.json
    └── vehicle_info.json
```

## 1.3 데이터 모델

### 조직 정보 (org_info)

간단한 문자열 배열로 조직명을 관리합니다.

```javascript
["조직1", "조직2", "조직3"]
```

### 용역 정보 (outsource_info)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `dsids` | string | 용역 ID |
| `name` | string | 용역명 |
| `unit` | string | 단위 |
| `type` | string | 타입 |
| `flgWork` | string | 작업 사용 여부 (Y/N) |
| `flgOut` | string | 외부 여부 (Y/N) |

### 작업 정보 (task_info)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `dsids` | string | 작업 ID |
| `name` | string | 작업명 |
| `unit` | string | 단위 |
| `type` | string | 타입 |
| `flgWork` | string | 작업 사용 여부 (Y/N) |
| `flgOut` | string | 외부 여부 (Y/N) |

### 차량 정보 (vehicle_info)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `dsids` | string | 차량 ID |
| `name` | string | 차량명 |
| `unit` | string | 단위 |
| `type` | string | 타입 |
| `flgWork` | string | 작업 사용 여부 (Y/N) |
| `flgOut` | string | 외부 여부 (Y/N) |

## 1.4 API 요청/응답 예시

### GET /baseinfo

**응답:**
```json
{
  "statusCode": 200,
  "body": {
    "org_info": ["조직1", "조직2"],
    "outsource_info": [
      { "dsids": "OS001", "name": "외부용역1", "unit": "회", "type": "방제", "flgWork": "Y", "flgOut": "Y" }
    ],
    "task_info": [
      { "dsids": "TK001", "name": "살균작업", "unit": "회", "type": "방제", "flgWork": "Y", "flgOut": "N" }
    ],
    "vehicle_info": [
      { "dsids": "VH001", "name": "분무차량", "unit": "대", "type": "분무", "flgWork": "Y", "flgOut": "N" }
    ]
  }
}
```

### PUT /baseinfo

**요청:**
```json
{
  "org_info": ["조직1", "조직2", "신규조직"],
  "outsource_info": [...],
  "task_info": [...],
  "vehicle_info": [...]
}
```

## 1.5 Lambda 함수 (Backend)

**파일 위치:** `AWS/lambda/DSWorkBaseInfo.py`

| 함수명 | 설명 |
|--------|------|
| `lambda_handler` | HTTP 메서드에 따라 적절한 함수 호출 |
| `get_data` | S3에서 모든 JSON 파일 로드하여 반환 |
| `replace_data` | 기존 데이터 백업 후 새 데이터로 교체 |
| `load_all_json_from_prefix` | S3 prefix 경로의 모든 JSON 파일 로드 |
| `save_json_by_key_to_s3` | 각 키별로 개별 JSON 파일로 S3에 저장 |

### 데이터 저장 로직

1. **백업**: 기존 `base_total.json` 파일을 타임스탬프와 함께 백업
2. **전체 저장**: `dsworkbase` 버킷에 `base_total.json`으로 전체 데이터 저장
3. **개별 저장**: `dsbaseinfo` 버킷에 각 키별로 개별 JSON 파일 저장

## 1.6 프론트엔드 컴포넌트

```
src/DSWorkBaseInfo/
├── DSWorkBaseInfo.jsx      # 메인 컴포넌트
└── EditableObjectList.jsx  # 편집 가능한 목록 컴포넌트
```

### 주요 기능

1. **조직 정보 관리**: 드래그 앤 드롭으로 순서 변경 가능
2. **용역/작업/차량 정보**: 테이블 형태로 CRUD 작업 지원
3. **실시간 저장**: 변경사항 발생 시 즉시 API 호출하여 저장

### UI 구성

```
┌─────────────────────────────────────────┐
│  BaseInfo 관리                           │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │ 조직 정보 (EditableObjectList)  │    │
│  │ [조직1] [조직2] [조직3] [+추가]  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 용역 정보                [추가]  │    │
│  │ ID | 이름 | 단위 | 타입 | 작업  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 작업 정보                [추가]  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 차량 정보                [추가]  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

# 2. DSWorkCourse - 방제 작업 골프장 관리

방제 작업 대상 골프장 정보를 관리하는 모듈입니다. 골프장 추가, 수정, 필터링 기능을 제공합니다.

## 2.1 API 정보

### Base URL
```
https://e0x0fsw125.execute-api.us-east-1.amazonaws.com/dev
```

### 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/dscourse_info` | 전체 골프장 목록 조회 |
| PUT | `/dscourse_info` | 골프장 정보 업데이트 (전체 목록) |

## 2.2 데이터 모델

### 골프장 정보 (WorkCourse)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `dscourseids` | string | 골프장 ID (예: GC001, 자동 생성) |
| `mapdscourseid` | string | MAP 시스템 연동 ID |
| `name` | string | 골프장명 |
| `org` | string | 소속 조직 |
| `dedicated_org` | string | 전담 조직 |
| `active` | string | 활성 상태 (Y/N) |
| `warehouse` | string | 창고 |
| `outsource` | string | 용역 정보 |
| `outorg` | string | 용역 조직 |
| `outwarehouse` | string | 용역 창고 |
| `course_names` | string[] | 코스명 목록 |
| `access_org` | string[] | 접근 가능 조직 목록 |

### 예시 데이터
```json
{
  "dscourseids": "GC001",
  "mapdscourseid": "MGC001",
  "name": "○○골프장",
  "org": "본사",
  "dedicated_org": "1팀",
  "active": "Y",
  "warehouse": "창고A",
  "outsource": "용역1",
  "outorg": "용역조직",
  "outwarehouse": "용역창고",
  "course_names": ["East", "West", "South"],
  "access_org": ["본사", "1팀", "2팀"]
}
```

## 2.3 API 요청/응답 예시

### GET /dscourse_info

**응답:**
```json
{
  "statusCode": 200,
  "body": [
    {
      "dscourseids": "GC001",
      "mapdscourseid": "MGC001",
      "name": "○○골프장",
      "org": "본사",
      "dedicated_org": "1팀",
      "active": "Y",
      "warehouse": "창고A",
      "course_names": ["East", "West"],
      "access_org": ["본사", "1팀"]
    }
  ]
}
```

### PUT /dscourse_info

**요청:** (전체 골프장 목록을 배열로 전송)
```json
[
  {
    "dscourseids": "GC001",
    "name": "○○골프장",
    "access_orgString": "본사,1팀",
    "course_namesString": "East,West"
  }
]
```

> **참고:** `access_org`와 `course_names` 배열은 API 전송 시 콤마 구분 문자열로 변환하여 전송

## 2.4 프론트엔드 컴포넌트

```
src/DSWorkCourse/
├── DSWorkCourse.jsx         # 메인 컴포넌트 (테이블 목록)
└── WorkCourseEditDialog.jsx # 골프장 수정 다이얼로그
```

### 주요 기능

1. **골프장 목록 조회**: 테이블 형태로 모든 골프장 표시
2. **필터링**: 조직별, 활성 상태별, 검색어로 필터링
3. **신규 추가**: ID 자동 생성 (GC001, GC002, ...)
4. **수정**: 다이얼로그를 통한 상세 정보 수정

### UI 구성

```
┌────────────────────────────────────────────────────────────────┐
│  골프장 목록                                                    │
├────────────────────────────────────────────────────────────────┤
│  [🔍 검색...]  [조직 ▼]  [활성상태 ▼]         [새 골프장 추가]   │
├────────────────────────────────────────────────────────────────┤
│  ID    │MAP ID│ 골프장명 │ 조직 │ 전담조직 │Active│ 창고 │...  │
│  ──────┼──────┼──────────┼──────┼──────────┼──────┼──────┼──── │
│  GC001 │MGC001│ ○○골프장 │ 본사 │   1팀   │  Y   │창고A │ 수정│
│  GC002 │MGC002│ △△골프장 │ 지사 │   2팀   │  Y   │창고B │ 수정│
└────────────────────────────────────────────────────────────────┘
```

### 필터링 옵션

| 필터 | 옵션 | 설명 |
|------|------|------|
| 검색 | 텍스트 | 골프장명, ID, 조직으로 검색 |
| 조직 | 드롭다운 | 전체 / 조직별 필터 |
| 활성상태 | 드롭다운 | 전체 / Y(활성) / N(비활성) |

## 2.5 ID 자동 생성 로직

```javascript
const generateNewCourseId = () => {
  const existingIds = courses.map(course => {
    const match = course.dscourseids.match(/GC(\d+)/);
    return match ? parseInt(match[1]) : 0;
  });
  const maxId = Math.max(...existingIds, 0);
  return `GC${String(maxId + 1).padStart(3, '0')}`;
  // 결과: GC001, GC002, GC003, ...
};
```

---

# 3. DSMapCourse - MAP 시스템 골프장 관리

MAP 시스템과 연동된 골프장 기본 정보를 관리하는 모듈입니다. 카드 형태의 UI로 골프장 정보를 표시하고 수정할 수 있습니다.

## 3.1 API 정보

### Base URL
```
https://spcxatxbph.execute-api.us-east-1.amazonaws.com/dev
```

### 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/dscourse` | 전체 골프장 목록 조회 |
| PUT | `/dscourse` | 골프장 정보 업데이트 (개별) |

## 3.2 데이터 모델

### 골프장 정보 (MapCourse)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | string | MAP 시스템 ID (예: MGC001) |
| `dscourseids` | string | DS 시스템 골프장 ID |
| `name` | string | 골프장명 |
| `org` | string | 소속 조직 |
| `address` | string | 주소 |
| `numHole` | number | 홀 수 (3, 6, 9, 12, ...) |
| `course_names` | string[] | 코스명 목록 |
| `access_org` | string[] | 접근 가능 조직 목록 |
| `access_course_ids` | string[] | 접근 가능 코스 ID 목록 |

### 예시 데이터
```json
{
  "id": "MGC001",
  "dscourseids": "GC001",
  "name": "○○골프장",
  "org": "본사",
  "address": "서울시 강남구 ...",
  "numHole": 27,
  "course_names": ["East", "West", "South"],
  "access_org": ["본사", "1팀", "2팀"],
  "access_course_ids": ["MGC002", "MGC003"]
}
```

## 3.3 API 요청/응답 예시

### GET /dscourse

**응답:**
```json
{
  "statusCode": 200,
  "body": [
    {
      "id": "MGC001",
      "dscourseids": "GC001",
      "name": "○○골프장",
      "org": "본사",
      "address": "서울시 강남구 ...",
      "numHole": 27,
      "course_names": ["East", "West", "South"],
      "access_org": ["본사", "1팀"]
    }
  ]
}
```

### PUT /dscourse

**요청:** (개별 골프장 정보)
```json
{
  "id": "MGC001",
  "dscourseids": "GC001",
  "name": "○○골프장",
  "org": "본사",
  "address": "서울시 강남구 ...",
  "numHole": 27,
  "access_orgString": "본사,1팀,2팀",
  "course_namesString": "East,West,South"
}
```

## 3.4 프론트엔드 컴포넌트

```
src/DSMapCourse/
├── DSMapCourse.jsx      # 메인 컴포넌트 (카드 그리드)
└── CourseEditDialog.jsx # 골프장 수정 다이얼로그
```

### 주요 기능

1. **골프장 카드 목록**: 그리드 형태로 골프장 카드 표시
2. **상세 정보 표시**: 주소, 홀 수, 코스명, 접근 가능 조직
3. **수정 다이얼로그**: 골프장 정보 편집

### UI 구성

```
┌────────────────────────────────────────────────────────────────┐
│  골프장 목록                                                    │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────── │
│  │ ○○골프장    [본사]│  │ △△골프장    [지사]│  │ □□골프장   ... │
│  │ [MGC001] [GC001] │  │ [MGC002] [GC002] │  │                 │
│  │ 📍 서울시 강남구  │  │ 📍 경기도 용인시  │  │                 │
│  │ 🏳️ 27홀          │  │ 🏳️ 18홀          │  │                 │
│  │ 👥 접근: 본사,1팀 │  │ 👥 접근: 지사,2팀 │  │                 │
│  │ 코스:            │  │ 코스:            │  │                 │
│  │ [East][West][S.] │  │ [North][South]   │  │                 │
│  │              [✏️] │  │              [✏️] │  │                 │
│  └──────────────────┘  └──────────────────┘  └──────────────── │
└────────────────────────────────────────────────────────────────┘
```

### 수정 다이얼로그 기능

| 필드 | 수정 방식 |
|------|----------|
| 이름 | 텍스트 입력 |
| 주소 | 텍스트 입력 |
| 홀 수 | 드롭다운 선택 (3, 6, 9, ..., 300) |
| 접근 가능 조직 | BaseContext의 `dsOrgList`에서 선택 추가/삭제 |
| 코스 이름 | 텍스트 입력으로 추가/삭제 |
| 접근 가능 코스 ID | 텍스트 입력으로 추가/삭제 |

## 3.5 Context 연동

```javascript
const { dsOrgList } = useBase();
```

수정 다이얼로그에서 "접근 가능 조직" 선택 시 `BaseContext`의 `dsOrgList`를 드롭다운 옵션으로 사용합니다.

---

# 4. 모듈 비교

## 4.1 세 모듈 비교표

| 항목 | DSWorkBaseInfo | DSWorkCourse | DSMapCourse |
|------|----------------|--------------|-------------|
| **목적** | 방제 기본 정보 관리 | 방제 작업 골프장 | MAP 시스템 골프장 |
| **API Base** | `e0x0fsw125...` | `e0x0fsw125...` | `spcxatxbph...` |
| **엔드포인트** | `/baseinfo` | `/dscourse_info` | `/dscourse` |
| **UI 형태** | 테이블 + 목록 | 테이블 목록 | 카드 그리드 |
| **신규 추가** | 가능 | 가능 | 불가능 |
| **필터링** | 없음 | 조직/활성상태/검색 | 없음 |
| **저장 방식** | 개별 키별 S3 저장 | 전체 목록 PUT | 개별 항목 PUT |
| **데이터 저장소** | S3 (dsbaseinfo) | API/DB | API/DB |

## 4.2 DSWorkCourse vs DSMapCourse

| 항목 | DSWorkCourse | DSMapCourse |
|------|--------------|-------------|
| **데이터 소스** | 방제 작업 관리용 | MAP 시스템 마스터 데이터 |
| **추가 필드** | `warehouse`, `outsource`, `outorg` 등 | `address`, `numHole` |
| **수정 범위** | 방제 작업 관련 정보 | 기본 정보만 |
| **저장 방식** | 전체 목록을 한번에 저장 | 개별 골프장 단위로 저장 |

## 4.3 공통 주의사항

1. **MGC999 제외**: 전체 관리자용 ID(`MGC999`)는 목록에서 자동으로 필터링됩니다.
2. **배열 → 문자열 변환**: `course_names`, `access_org` 등 배열 필드는 저장 시 콤마 구분 문자열(`*String`)로도 함께 전송됩니다.
3. **배열 초기화**: 배열 필드가 null/undefined인 경우 빈 배열로 초기화됩니다.

---

# 데이터 흐름 요약

```
┌─────────────────────────────────────────────────────────────────────┐
│                         방제 작업 시스템                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DSWorkBaseInfo                    DSWorkCourse                     │
│  ┌─────────────┐                  ┌─────────────┐                   │
│  │ 조직 정보   │                  │ 방제 골프장 │                   │
│  │ 용역 정보   │                  │ 목록 관리   │                   │
│  │ 작업 정보   │                  │ (테이블)    │                   │
│  │ 차량 정보   │                  └──────┬──────┘                   │
│  └──────┬──────┘                         │                          │
│         │                                │                          │
│         ▼                                ▼                          │
│  ┌─────────────┐                  ┌─────────────┐                   │
│  │  S3 Bucket  │                  │ API Gateway │                   │
│  │ dsbaseinfo/ │                  │ /dscourse_  │                   │
│  │ ├─common/   │                  │    info     │                   │
│  │ └─work/     │                  └─────────────┘                   │
│  └─────────────┘                                                    │
│                                                                     │
│  DSMapCourse                                                        │
│  ┌─────────────┐                                                    │
│  │ MAP 골프장  │                                                    │
│  │ 기본 정보   │                                                    │
│  │ (카드)      │                                                    │
│  └──────┬──────┘                                                    │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────┐                                                    │
│  │ API Gateway │                                                    │
│  │  /dscourse  │                                                    │
│  └─────────────┘                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```
