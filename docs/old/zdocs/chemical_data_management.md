# AWS Lambda를 활용한 화학물질 데이터 관리 설명서

이 문서는 AWS Lambda를 활용하여 화학물질 데이터를 AWS DynamoDB와 연동하여 관리하는 방법을 설명합니다.

---

## 🔹 개요
이 Lambda 함수는 화학물질 정보를 관리하는 기능을 제공합니다.
DynamoDB를 활용하여 데이터를 저장하고, CRUD(Create, Read, Update, Delete) 기능을 제공합니다.

- **DynamoDB 테이블**: `dschemicals`
- **지원되는 HTTP 메서드**:
  - `GET`: 화학물질 목록 조회
  - `POST`: 새 화학물질 추가
  - `PUT`: 화학물질 정보 업데이트
  - `DELETE`: 화학물질 정보 삭제

---

## 🔹 Lambda 환경 설정

### 1️⃣ **필수 패키지 설치**
이 Lambda 함수는 `boto3` 및 `simplejson` 패키지를 사용합니다.
AWS Lambda에서는 기본적으로 포함되어 있지만, 최신 버전이 필요하면 로컬 개발 환경에서 설치 가능합니다.

```sh
pip install boto3 simplejson
```

---

## 🔹 API 기능 설명

### 1️⃣ **화학물질 목록 조회 (GET)**
```http
GET /
```
#### ✅ **설명**
- `dschemicals` 테이블에서 특정 조건에 따라 화학물질 데이터를 조회합니다.
- `id`, `active` 상태, `flgWork` 상태를 필터링할 수 있습니다.

#### ✅ **쿼리 파라미터 예시**
```json
{
    "id": "chemical123",
    "active": "true",
    "flgWork": "false"
}
```

#### ✅ **응답 예시**
```json
{
    "statusCode": 200,
    "body": [
        {"dsids": "chemical123", "active": true, "flgWork": false}
    ]
}
```

---

### 2️⃣ **화학물질 추가 (POST)**
```http
POST /
```
#### ✅ **설명**
- 새로운 화학물질 데이터를 DynamoDB에 추가합니다.

#### ✅ **요청 예시**
```json
{
    "dsids": "newchemical123",
    "name": "Methanol",
    "active": true,
    "flgWork": false
}
```

#### ✅ **응답 예시**
```json
{
    "statusCode": 201,
    "message": "Chemical added or modified successfully"
}
```

---

### 3️⃣ **화학물질 정보 업데이트 (PUT)**
```http
PUT /
```
#### ✅ **설명**
- 특정 화학물질 데이터를 업데이트합니다.

#### ✅ **요청 예시**
```json
{
    "dsids": "chemical123",
    "active": false
}
```

#### ✅ **응답 예시**
```json
{
    "statusCode": 201,
    "message": "Chemical added or modified successfully"
}
```

---

### 4️⃣ **화학물질 삭제 (DELETE)**
```http
DELETE /?id=chemical123
```
#### ✅ **설명**
- 특정 ID를 가진 화학물질 데이터를 삭제합니다.

#### ✅ **응답 예시**
```json
{
    "statusCode": 200,
    "message": "Chemical with id 'chemical123' deleted successfully"
}
```

---

## 🔹 AWS 설정 가이드

### 1️⃣ **DynamoDB 테이블 생성**
DynamoDB에서 `dschemicals` 테이블을 생성합니다.

- **Primary Key**: `dsids` (UUID 또는 자동 생성 값)

---

## 🔹 보안 및 개선 사항

### ✅ 1. 예외 처리 강화
데이터 조회 및 추가 시 예외 발생을 방지하기 위해 try-except 블록을 활용합니다.
```python
try:
    response = table.get_item(Key={'dsids': chemical_id})
    return response['Item']
except KeyError:
    return {"message": "Chemical not found"}
```

---

## 🔹 결론
이 문서는 AWS Lambda에서 화학물질 데이터 관리를 위한 핵심적인 기능과 API 엔드포인트를 설명합니다.
AWS DynamoDB와의 연동을 통해 데이터 저장 및 검색을 자동화하며, 보안 강화를 위한 개선 사항도 포함되어 있습니다.

더 나은 서비스를 위해 지속적으로 개선이 필요하며, 추가적인 질문이 있다면 언제든지 문의해주세요! 🚀
