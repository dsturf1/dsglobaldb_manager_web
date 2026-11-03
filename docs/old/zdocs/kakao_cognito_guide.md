# AWS Lambda를 활용한 Kakao 로그인 사용자 관리 설명서

이 문서는 AWS Lambda를 활용하여 Kakao 로그인 사용자 정보를 AWS DynamoDB 및 Cognito와 연동하는 방법을 설명합니다.

---

## 🔹 개요
이 Lambda 함수는 Kakao 로그인 사용자를 관리하는 기능을 제공합니다.
DynamoDB를 활용하여 사용자 정보를 저장하고, Cognito User Pool을 이용하여 사용자를 승인 및 등록합니다.

- **DynamoDB 테이블**: `kakaosignup`
- **Cognito User Pool ID**: `us-east-1_dT2920i8Y`
- **지원되는 HTTP 메서드**:
  - `GET`: 사용자 목록 조회
  - `POST`: 새 사용자 추가
  - `PUT`: 사용자 승인 및 Cognito 등록

---

## 🔹 Lambda 환경 설정

### 1️⃣ **필수 패키지 설치**
이 Lambda 함수는 `boto3` 패키지를 사용합니다.
AWS Lambda에서는 기본적으로 포함되어 있지만, 최신 버전이 필요하면 로컬 개발 환경에서 설치 가능합니다.

```sh
pip install boto3
```

---

## 🔹 API 기능 설명

### 1️⃣ **사용자 목록 조회 (GET)**
```http
GET /
```
#### ✅ **설명**
- `kakaosignup` 테이블에서 `status` 값에 따라 사용자 목록을 필터링하여 조회합니다.
- 전체 데이터를 가져오거나 특정 `status`를 가진 사용자만 필터링할 수 있습니다.

#### ✅ **쿼리 파라미터 예시**
```json
{
    "status": "pending"
}
```

#### ✅ **응답 예시**
```json
{
    "statusCode": 200,
    "body": [
        {"kakaoid": "user123", "status": "pending"},
        {"kakaoid": "user456", "status": "pending"}
    ]
}
```

---

### 2️⃣ **사용자 추가 (POST)**
```http
POST /
```
#### ✅ **설명**
- 새로운 Kakao ID 사용자를 DynamoDB에 추가합니다.
- 동일한 `kakaoid`가 이미 존재하면 409 오류를 반환합니다.

#### ✅ **요청 예시**
```json
{
    "kakaoid": "newuser123",
    "name": "홍길동",
    "department": "IT",
    "status": "pending"
}
```

#### ✅ **응답 예시**
```json
{
    "statusCode": 201,
    "message": "Kakao ID added successfully"
}
```

---

### 3️⃣ **사용자 승인 (PUT)**
```http
PUT /?kakaoid=user123&status=approved
```
#### ✅ **설명**
- 특정 `kakaoid` 사용자의 `status` 값을 `approved`로 변경합니다.
- 승인되면 AWS Cognito User Pool에 사용자를 추가하고 기본 비밀번호를 설정합니다.
- 동일한 `kakaoid`가 Cognito에 이미 존재하면 409 오류를 반환합니다.

#### ✅ **응답 예시**
```json
{
    "statusCode": 200,
    "message": "Kakao ID approved and added to Cognito"
}
```

---

## 🔹 AWS 설정 가이드

### 1️⃣ **DynamoDB 테이블 생성**
DynamoDB에서 `kakaosignup` 테이블을 생성합니다.

- **Primary Key**: `id` (UUID 또는 자동 생성 값)
- **GSI (Global Secondary Index)**: `kakaoid-index` (속성: `kakaoid`)

### 2️⃣ **Cognito User Pool 설정**
- AWS Cognito에서 `User Pool`을 생성하고 `Self-Registration`을 비활성화합니다.
- 기본 이메일 인증을 사용하여 가입된 사용자를 관리합니다.

---

## 🔹 보안 및 개선 사항

### ✅ 1. Cognito 비밀번호 하드코딩 방지
현재 코드에서 `DEFAULT_PASSWORD = 'Dsgreen8258!'`이 하드코딩되어 있으므로, 보안 강화를 위해 환경 변수를 사용해야 합니다.
```python
import os
DEFAULT_PASSWORD = os.getenv("COGNITO_DEFAULT_PASSWORD", "DefaultSecurePassword123!")
```

### ✅ 2. 예외 처리 강화
Cognito에서 사용자가 이미 존재하는 경우를 방지하기 위해 `admin_get_user`를 활용하여 사전 검사를 수행하는 것이 좋습니다.
```python
try:
    cognito_client.admin_get_user(UserPoolId=COGNITO_USER_POOL_ID, Username=kakaoid)
    return create_response(409, {"message": f"Error: kakaoid '{kakaoid}' already exists in Cognito"})
except cognito_client.exceptions.UserNotFoundException:
    pass  # 존재하지 않으면 계속 진행
```

---

## 🔹 결론
이 문서는 AWS Lambda에서 Kakao 로그인 사용자 관리를 위한 핵심적인 기능과 API 엔드포인트를 설명합니다.
AWS Cognito 및 DynamoDB와의 연동을 통해 사용자 승인 및 등록을 자동화하며, 보안 강화를 위한 개선 사항도 포함되어 있습니다.

더 나은 서비스를 위해 지속적으로 개선이 필요하며, 추가적인 질문이 있다면 언제든지 문의해주세요! 🚀
