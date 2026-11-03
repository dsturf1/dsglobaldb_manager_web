# 글로벌 DB — 안전한 추가 API 구현 지시서

> 이 문서는 **`dsglobaldb_manager` 저장소에서 Claude Code가 읽고 구현**하기 위한 문서다.
> 작성: 2026-10-02, `quotation mg`(견적·결재 시스템) 쪽에서 글로벌 DB 코드를 읽기 전용으로 조사한 결과를 바탕으로 했다.
> 라인 번호는 조사 시점 기준이다. 작업 전에 실제 파일을 다시 확인할 것.

---

## 0. Claude Code에게 — 먼저 할 일

1. 아래 2장의 파일을 직접 읽고, 조사 내용이 지금 코드와 맞는지 확인한다.
2. **기존 동작을 깨지 않는다.** 지금의 `GET/POST/PUT/DELETE /dschemical`, `/dscustomer`는 웹과 외부 앱이 쓰고 있다. 새 기능은 **새 경로로 추가**한다.
3. 6장의 "결정 필요" 항목은 구현 전에 사용자에게 묻는다. 특히 **인증 방식**과 **AWS 배포 변경**(API Gateway 경로·Lambda 추가)은 승인을 받은 뒤 진행한다.
4. 단계별로 진행하고, 단계마다 완료 조건을 확인한 뒤 멈추고 보고한다.

---

## 1. 왜 필요한가

### 1.1 배경
- 약품·거래처의 원본은 글로벌 DB다. 견적 시스템(`quotation mg`)은 [EXTERNAL_API_GUIDE.md](EXTERNAL_API_GUIDE.md)대로 **읽기만** 한다.
- 사용자는 견적을 쓰다가 **견적 앱에서도 새 품목·새 거래처를 추가**하고 싶어 한다. 나중에 만들 **글로벌 DB 텔레그램 봇**에서도 추가가 필요하다.
- 웹, 견적 앱, 봇이 각자 코드 규칙을 복사해서 쓰면 규칙이 갈라지고, 동시에 추가할 때 **같은 코드가 나와 기존 데이터를 덮어쓴다.**

### 1.2 지금 구조의 문제 (조사 결과)

| 문제 | 위치 | 결과 |
|---|---|---|
| 품목코드(`dsids`)를 **브라우저가** 정한다 | `src/DSChemical/AddChemicalDialog.jsx` `getPreviewCode` (약 24-64행) | 규칙이 웹에만 있다. 다른 앱은 복사해야 한다 |
| 품목코드 **중복 검사가 없다**. 사용자가 미리보기를 더블클릭해 코드를 직접 칠 수도 있다 (약 87-98, 224-241행) | 같은 파일 | 이미 있는 코드를 넣으면 **기존 약품이 통째로 덮어써진다** |
| 약품 Lambda가 조건 없이 `put_item` | `AWS/Lambda/Downloaded/lambda20260930/dschemicalDynamoDB/lambda_function.py` (`add_chemicals`, 약 77행). POST·PUT 구분 없음 (약 23-26행) | 서버도 덮어쓰기를 막지 않는다 |
| 거래처 중복 검사가 **화면에 불러온 목록 기준**뿐이다 | `src/DSCustomer/AddCustomerDialog.jsx` 약 35행 | 다른 사람이 방금 추가한 거래처는 못 잡는다 |
| 거래처 Lambda도 조건 없이 `put_item` / `batch_writer(overwrite_by_pkeys)` | `AWS/Lambda/dscustomerDynamoDB/lambda_function.py` (약 50-62행) | 같은 코드면 덮어쓴다 |
| 개인 거래처 코드 `P#####`를 브라우저에서 "최대값 + 1"로 정한다 | `src/DSCustomer/customerExcel.js` `nextPersonCode` (약 196-202행) | 두 곳에서 동시에 추가하면 같은 코드가 나온다 |
| **인증이 없다** | 모든 axios 클라이언트 (`src/context/GlobalComponentContext.jsx` 7-10행, `src/DSCustomer/customerApi.js` 4-7행) | URL만 알면 누구나 쓰고 지울 수 있다 |
| 수정에 동시성 검사가 없다 (마지막 저장이 이김). 약품 수정은 `updatedAt`도 안 남긴다 | `EditChemicalDialog.jsx`, `DSChemicalsTable.jsx` 169-180행, `EditCustomerDialog.jsx` 20행 | 두 사람이 동시에 고치면 한쪽 수정이 사라진다 |
| (작은 버그) `decimal_default`가 `decimal.Decimal`을 쓰는데 `Decimal`만 import | 약품 Lambda 3·114행 근처 | 해당 경로를 타면 NameError. `simplejson` 덕에 지금은 안 터질 수 있음 — 확인 후 수정 |

---

## 2. 지금의 추가 규칙 (서버로 옮길 대상)

### 2.1 약품 `dsids`
- 앞자리는 **중분류(`infoL1`)**로 정한다:

  | 중분류 | 앞자리 |
  |---|---|
  | 살균제 | A1 |
  | 살충제 | A2 |
  | 제초제 | A3 |
  | 비료 | B0 |
  | 기타약재 | C0 |
  | 잔디 | G0 |
  | 기타물품 | D0 |
  | 그 밖 | X0 |

- **같은 이름(공백 제거 후 일치)이 이미 있으면** 같은 제품의 다른 용량이다. 그 이름의 코드 중 최대값 + 1을 쓴다. 끝자리가 용량 순번이다.
  - 예: 몬카트 `A11041`, `A11042`, `A11043`
- **새 이름이면** 전체 약품 코드의 일련번호(`dsids[-4:-1]`, 3자리) 중 최대값 + 1에 끝자리 `0`을 붙인다. 형식은 `{앞자리}{NNN}0`이다.
- 지금 웹이 넣는 값: `{...form, dsids, origin: 'local', createdAt: ISO}`
  - 기본값: `active`·`flgWork`·`flgOut` = 'Y', 가격은 0
  - `updatedAt`과 `ecountSyncedAt`은 없다

> 확인할 것: 같은 이름인데 기존 코드의 앞자리가 지금 고른 중분류와 다를 때 현재 코드는 *지금 앞자리*를 쓴다(조사 결과). 이 동작을 유지할지, 기존 코드의 앞자리를 따를지 사용자에게 묻는다.

### 2.2 거래처 `custcd`
- **법인** (`custType: 'corp'`): 사업자번호 숫자 10자리. 사업자번호 검증(`isValidBizNo`, 국세청 가중치)에 실패하면 지금은 **경고만** 하고 저장할 수 있다.
- **개인** (`custType: 'person'`): `P00001` 형식 순번. 주민등록번호는 받지 않는다.
- 지금 웹이 넣는 값:
  - `custcd`, `custType`, `name`, `ceo`(개인이면 이름과 같음)
  - `bizType`, `bizItem`, `tel`, `email`, `aliases: []`, `category`(기본 '기타')
  - `active: 'Y'`, `memo`, `origin: 'local'`, `createdAt`, `updatedAt`

---

## 3. 만들 것

### 3.1 새 API (기존 경로는 그대로 둔다)

| 요청 | 동작 |
|---|---|
| `POST /dschemical/create` | 약품 **새로 추가만**. 코드는 **서버가** 정한다. 이미 있는 코드면 덮어쓰지 않고 다음 번호로 다시 시도한다 |
| `GET /dschemical/next-code?infoL1=&name=` | 웹 미리보기용. 다음에 받을 코드를 계산만 한다. 확정이 아니며 실제 코드는 create 응답 기준 |
| `POST /dscustomer/create` | 거래처 **새로 추가만**. 법인은 사업자번호를 그대로 쓰고, 이미 있으면 **409**. 개인은 서버가 `P#####`를 정한다 |

**공통 규칙**
- DynamoDB `put_item`에 **`ConditionExpression="attribute_not_exists(<키>)"`**를 건다. 이것이 핵심이다.
- 순번으로 만드는 코드(약품, 개인 거래처)는 조건 실패 시 **번호를 다시 계산해 재시도**한다. 최대 5회까지 하고, 그래도 실패하면 503을 돌려준다.
- 순번 계산 방식: 지금처럼 전체를 읽어 최대값 + 1을 해도 된다(현재 658건, 1,486건). 다만 조건부 쓰기와 재시도로 충돌을 막는다.
  - 더 깔끔한 방법: 카운터 아이템에 `ADD seq :1`로 원자 증가. 6장에서 결정한다.
- 서버가 채우는 값:
  - `origin: 'local'`, `createdAt`, `updatedAt`(ISO 8601 UTC)
  - 품목: `active`·`flgWork`·`flgOut` 기본 'Y', 가격 기본 0
  - 거래처: `active: 'Y'`, `aliases: []`
  - 클라이언트가 보낸 `dsids`/`custcd`(개인), `origin`, `createdAt`, `ecountSyncedAt`은 **무시**한다
- 입력 검증 (서버)
  - 품목:
    - `name` 필수, 앞뒤 공백 제거
    - `infoL2`·`infoL1` 허용값 검사 (2.1 표)
    - 가격은 0 이상의 숫자이고 **Decimal**로 저장
  - 거래처:
    - `name` 필수
    - 법인은 숫자 10자리 필수
    - `category`는 '골프장', '매입처', '매출처', '기타' 중 하나
    - 사업자번호 검증 실패 시 기본 422. `allowInvalidBizNo: true`를 보내면 허용(지금 웹의 "경고 후 저장"과 같은 동작)
- 응답은 기존 API와 같은 래핑(`{"statusCode", "body"}`)을 쓴다:
  - `201` + 만든 레코드 전체
  - `409` + `{"message", "existing": {"custcd", "name"}}` — 법인 사업자번호 중복
  - `400`/`422` + `{"message"}` — 입력 오류

### 3.2 인증 (6장에서 방식 결정)
- 새 create API에는 **인증을 건다.** 기존 GET은 외부 앱이 인증 없이 쓰고 있으니 이번에는 건드리지 않는다.
- 후보:
  - **(a) Cognito 권한 부여자**: 사용자 풀 `dsout_record`(`us-east-1_95Qz7fdzw`). 웹은 이미 이 풀로 로그인하므로 ID 토큰을 붙이면 된다. 견적 앱도 사용자 토큰을 그대로 전달할 수 있다.
  - **(b) API 키** (API Gateway usage plan, `x-api-key` 헤더): 서버끼리 쓰는 용도. 견적 백엔드, 봇.
  - (a)와 (b)를 둘 다 받는 구성도 가능하다. 누가 추가했는지(`createdBy`) 남기려면 (a)가 낫다.

### 3.3 웹 수정
- `AddChemicalDialog.jsx`
  - 미리보기는 `GET /dschemical/next-code`로 받는다.
  - 저장은 `POST /dschemical/create`로 하고, **응답의 `dsids`를 최종 코드로** 쓴다.
  - 코드 직접 입력(더블클릭) 기능을 없앨지는 6장에서 정한다. 남긴다면 서버가 중복 시 409로 거부해야 한다.
- `AddCustomerDialog.jsx`: 저장을 `POST /dscustomer/create`로 바꾼다. 409가 오면 "이미 있는 거래처: {name}"을 표시한다.
- 추가 후 목록을 새로 불러온다(지금 동작 유지).

### 3.4 (선택, 2단계) 수정 시 덮어쓰기 방지
- PUT/POST 수정 요청에 `expectedUpdatedAt`이 있으면 `ConditionExpression="updatedAt = :expected"`를 건다. 없으면 지금처럼 동작한다(하위 호환).
- 약품 수정에도 `updatedAt`을 남긴다.
- 웹의 수정 다이얼로그가 불러올 때의 `updatedAt`을 같이 보낸다. 충돌하면 "다른 사람이 먼저 수정했습니다. 새로 불러오세요"를 표시한다.

### 3.5 문서
- [EXTERNAL_API_GUIDE.md](EXTERNAL_API_GUIDE.md) 6장에 새 create API를 추가한다(요청·응답 예, 인증, 409 의미). "외부 앱은 쓰지 말 것" 원칙을 "추가는 create API로만"으로 바꾼다.

---

## 4. 단계와 완료 조건

### Step 1 — 서버 로직 + 테스트 (배포 없음)
- 코드 생성·검증 로직을 Lambda용 Python 모듈로 만든다.
  - 예: `AWS/Lambda/common/codes.py`, 또는 각 Lambda 안. 저장소 구조에 맞춘다.
- 테스트는 pytest + moto로 한다.
  - 새 이름 → `{앞자리}{NNN+1}0`
  - 같은 이름 → 끝자리 + 1
  - 법인 중복 → 409
  - 개인 → `P` 순번
  - **이미 있는 코드로는 절대 덮어쓰지 않음**
  - 조건 실패 시 재시도해서 다음 번호를 받음
  - 클라이언트가 보낸 `origin`·`createdAt`은 무시됨
- **완료 조건**: 지금 웹의 `getPreviewCode`와 같은 입력에 같은 코드가 나온다. 기존 데이터 샘플로 확인한다.

### Step 2 — Lambda·API Gateway 반영 (사용자 승인 후)
- 새 경로를 추가하고 인증을 붙인다(6장 결정대로). 기존 경로·동작은 그대로 둔다.
- **완료 조건**:
  - 운영 API에서 create로 약품 1건, 법인·개인 거래처 각 1건을 추가할 수 있다.
  - 같은 법인을 다시 추가하면 409가 난다.
  - 인증 없이 부르면 401/403이 난다.
  - 확인용으로 만든 데이터는 지운다.

### Step 3 — 웹 전환
- 3.3대로 바꾼다.
- **완료 조건**: 웹에서 추가한 품목·거래처 코드가 서버가 정한 코드와 같다. 두 브라우저에서 동시에 추가해도 덮어쓰기가 없다.

### Step 4 — (선택) 수정 동시성, 문서 갱신
- 3.4와 3.5를 진행한다.

---

## 5. 견적 시스템이 기대하는 계약 (이것만 지키면 견적 앱이 붙는다)

```http
POST /dschemical/create
{ "name": "몬카트", "unit": "1ℓ", "infoL2": "농약", "infoL1": "살균제", "infoL3": "중요도4",
  "IN_PRICE": 11500, "OUT_PRICE": 12075, "OUT_PRICE1": 13000, "vendors": "", "aliases": [] }
→ 201 { ...저장된 레코드 전체, "dsids": "A11044", "origin": "local", "createdAt": "...", "updatedAt": "..." }

POST /dscustomer/create
{ "custType": "corp", "bizNo": "123-45-67890", "name": "(주)가나다", "ceo": "홍길동",
  "bizType": "서비스", "bizItem": "골프장", "tel": "", "email": "", "category": "골프장", "memo": "" }
→ 201 { ...레코드, "custcd": "1234567890" }
→ 409 { "message": "이미 있는 거래처코드입니다", "existing": { "custcd": "1234567890", "name": "..." } }

{ "custType": "person", "name": "김개인", "tel": "", "email": "", "category": "기타" }
→ 201 { ...레코드, "custcd": "P00016" }
```

- 견적 앱은 추가 직후 자기 캐시를 비우고(`/api/catalog/refresh`와 같은 동작), 응답의 코드를 바로 견적 줄에 쓴다.
- 새로 추가된 항목은 `origin: 'local'`이고 `ecountSyncedAt`이 없다. 견적 앱은 여기에 "이카운트 미등록" 경고를 이미 띄운다.

---

## 6. 결정 필요 — 구현 전에 사용자에게 물어볼 것

1. **인증 방식**: (a) Cognito 토큰 / (b) API 키 / 둘 다. `createdBy`를 남길지
2. **순번 방식**: 최대값 + 1과 조건부 재시도(간단) / 카운터 아이템 원자 증가(깔끔, 초기값 설정 필요)
3. **웹의 코드 직접 입력(더블클릭) 기능**: 없앨지, 남기고 서버가 중복을 거부하게 할지
4. **같은 이름인데 중분류가 다를 때** 앞자리 규칙 (2.1 확인할 것)
5. **사업자번호 검증 실패**: 서버에서 거부(422)할지, 지금처럼 경고 후 허용(`allowInvalidBizNo`)할지
6. 3.4 수정 동시성 방지를 이번에 같이 할지
7. AWS 변경(새 경로, 권한 부여자, Lambda 배포)을 누가 언제 할지

---

## 7. 하지 말 것
- 기존 `POST/PUT /dschemical`, `/dscustomer`의 동작을 바꾸지 않는다. 지금 웹과 엑셀 비교 기능이 쓰고 있다. 3.4는 하위 호환으로만 한다.
- 기존 GET에 인증을 걸지 않는다. 견적 시스템 등 외부 앱이 깨진다(별도 논의).
- 운영 데이터를 테스트로 바꾸거나 지우지 않는다. 확인용 데이터는 만든 것만 지운다.
- API URL, 키, 토큰을 코드·커밋·문서에 넣지 않는다.

---

## 8. 결정 및 진행 상황 (2026-10-02, dsglobaldb_manager)

### 8.1 6장 결정 결과

| # | 항목 | 결정 |
|---|---|---|
| 1 | 인증 | **인증 없음** (기존 API와 같음). `createdBy`는 요청 본문에 보내면 그대로 저장한다(검증 안 함) |
| 2 | 순번 방식 | 최대값 + 1과 조건부 쓰기 재시도(최대 5회). **DB 코드와 이카운트 전체 코드**(`s3://dsbaseinfo/ecount/products_latest.json`의 `all_codes`)를 합쳐서 계산한다 |
| 3 | 웹의 코드 직접 입력 | 없앤다 (3단계에서) |
| 4 | 같은 이름, 다른 중분류 | 번호는 같은 이름 그룹의 최대값 + 1, 앞 두 글자는 **이번에 고른 중분류**를 따른다(지금 웹과 같음) |
| 5 | 끝자리 9 넘김 | 같은 이름이라도 새 일련번호를 받는다 |
| 6 | 사업자번호 검증 실패 | 422. `allowInvalidBizNo: true`이면 허용 |
| 7 | AWS 반영 | 완료 (8.2) |

### 8.2 진행 상황
- **Step 1 완료**: `AWS/Lambda/dsglobaldbCreate/lambda_function.py`, 테스트 `test_lambda_function.py` (pytest + moto 25건 통과).
  - 운영 약품 데이터의 모든 이름 × 7개 중분류 등 4,186가지 입력으로 웹 `getPreviewCode`와 비교했다. 4,183건이 같다.
  - 나머지 3건은 웹 규칙이 **이미 있는 코드**를 내놓는 경우다(예: 신승/살균제 → A17802, 이미 '선승'). 서버는 다음 빈 번호를 준다.
- **Step 2 완료**: Lambda `dsglobaldbCreate`, `POST /dschemical/create`, `GET /dschemical/next-code`, `POST /dscustomer/create` (API `jyipsj28s9` dev).
  - 배포 노트북: `AWS/Lambda/(L1-2) Deploy dsglobaldbCreate.ipynb`
  - 운영에서 확인한 것:
    - 약품 추가 201: 보낸 `dsids`와 `origin`은 무시됐다
    - 법인 추가 201, 같은 법인 다시 추가 409(`existing` 포함, 덮어쓰기 없음)
    - 개인 추가 201(`P00001`), 사업자번호 검증 실패 422
    - CORS와 OPTIONS 정상
  - 확인용 데이터는 삭제했다.
- **추가 요구 (2026-10-02): 약품의 비슷한 이름 확인** — 서버에서 강제한다.
  - 다음 경우 `create`가 409를 돌려주고, 사용자가 확인하면 `confirmSimilar: true`로 다시 보낸다.
    - 띄어쓰기·기호만 다름, 이름 포함(2글자 이상)
    - 한글 자모 유사도 80% 이상 (신승/선승 0.83)
    - 별칭 일치 (포함 관계는 보지 않음)
    - 같은 이름·같은 용량 (용량은 ㎖/ml, ℓ/L 등을 같게 봄)
  - 409 본문: `reason: "similar"`, `similar[{name, score, reason, codes[{dsids, unit}]}]`, `sameName[{dsids, unit}]`, `sameUnit`.
  - `next-code`도 같은 결과를 돌려준다(`unit` 파라미터 추가). 같은 이름의 다른 용량 추가는 확인 없이 만든다.
  - **거래처는 적용하지 않는다.** 테스트 38건 통과.
- **Step 3 완료 (웹 전환)**:
  - `AddChemicalDialog`: 미리보기는 `next-code`(입력 0.4초 후), 저장은 `create`. 409면 확인 후 다시 보낸다. 코드 직접 입력(더블클릭)은 없앴다.
  - `AddCustomerDialog`: `dscustomer/create`로 저장한다. 409와 422를 처리한다.
  - 공용 호출 함수: `src/utils/globaldbCreateApi.js`.
  - `DSChemicalsTable.jsx`의 쓰이지 않던 `createNewChemical`·`handleAddConfirm`은 삭제했다.
  - 웹 호출 함수로 운영에서 전체 흐름을 확인했다(비슷한 이름 409 → 확인 → 201, 법인 409, 422, 개인 순번). 확인용 데이터는 삭제했다.
- **Step 4 완료 (문서)**: [EXTERNAL_API_GUIDE.md](EXTERNAL_API_GUIDE.md)
  - 6장을 create API로 바꿨다(요청·응답, 409·422 의미). 원칙은 "읽기 + create API로만 추가"다.
  - 7.4에 Python 추가 예제를 넣었다.
- 남은 것(선택): 3.4 수정 동시성(`expectedUpdatedAt`).

### 8.3 조사 내용 정정
- 웹이 실제로 로그인하는 Cognito 풀은 `src/main.jsx`의 **`us-east-1_W0IaBru9e` (dsglobaldb_access)**다. 1.2와 3.2의 `us-east-1_95Qz7fdzw`(dsout_record)는 `aws-exports.js`에 있지만 쓰이지 않는다. 이번에는 인증을 걸지 않으므로 영향은 없다.
- REST API 한 메서드에 Cognito와 API 키를 함께 걸면 *둘 다* 있어야 통과한다. "둘 중 하나"로 받으려면 경로를 나누거나 Lambda 권한 부여자가 필요하다(3.2 참고).
- 웹의 같은 이름 비교는 공백 제거가 아니라 **앞뒤 공백만 자른다**(`trim`). 서버도 같은 방식을 쓴다.
- `DSChemicalsTable.jsx`의 `createNewChemical`·`handleAddConfirm`은 쓰이지 않는 코드다(`AddChemicalDialog`가 `onAdd`를 쓰지 않음). 규칙도 달라서 3단계에서 지운다.
