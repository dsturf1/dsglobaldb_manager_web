# 글로벌 DB 외부 사용 안내 — 약품 · 거래처

외부 앱과 텔레그램 봇에서 글로벌 DB의 **약품**과 **거래처** 데이터를 읽어 쓰기 위한 안내입니다.
데이터는 이 저장소의 웹(dsglobaldb_manager)에서 관리하고, 외부에서는 아래 API로 읽습니다.

> 2026-10-06 기준. 약품 658건, 거래처 1,486건, 창고 19건. 새로 추가는 create API(6장), 거래처 수정·별칭은 update/alias API(6.4)로 한다.

---

## 1. 한눈에 보기

| 데이터 | API | 저장소 | 키 | 건수 · 응답 크기 |
|---|---|---|---|---|
| 약품 | `GET /dschemical` | DynamoDB `dschemicals` | `dsids` (= 이카운트 품목코드) | 658건 · 약 350KB |
| 거래처 | `GET /dscustomer` | DynamoDB `dscustomers` | `custcd` (= 이카운트 거래처코드) | 1,486건 · 약 490KB |
| 창고 | `GET /dswarehouse` | DynamoDB `dswarehouses` | `whcd` (= 이카운트 창고코드) | 19건 · 수 KB |

```
Base URL: https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev
```

- **인증 없음.** URL만 알면 누구나 읽고 쓸 수 있습니다. URL을 공개된 곳(공개 저장소, 공개 채널 메시지 등)에 올리지 마세요.
- **외부 앱·봇은 읽기(GET), 새로 추가(create), 거래처 부분 수정·별칭(update/alias)만 하세요.** 새 항목은 [6장](#6-새로-추가--create-api)의 create API로, 거래처 수정과 별칭은 [6.4](#64-거래처-부분-수정--별칭--변경-이력)로 합니다. 레코드 전체를 덮어쓰는 PUT/POST와 삭제는 웹 전용입니다.
- CORS가 열려 있어 브라우저에서도 바로 호출할 수 있습니다.

---

## 2. 응답 형식 — 반드시 한 번 더 풀어야 합니다

API Gateway가 Lambda 응답을 그대로 돌려주기 때문에, **HTTP 상태는 오류여도 항상 200**이고 실제 결과는 본문 안에 있습니다.

```json
{
  "statusCode": 200,
  "body": "[{\"dsids\": \"A11042\", \"name\": \"몬카트\", ...}, ...]"
}
```

- `body`는 **JSON 문자열**이라 한 번 더 파싱해야 합니다.
- 성공 여부는 HTTP 상태가 아니라 **`statusCode`** 로 판단합니다. 400 이상이면 `body` 안의 `message`에 이유가 있습니다.

```python
def unwrap(res_json):
    body = res_json["body"]
    body = json.loads(body) if isinstance(body, str) else body
    if res_json.get("statusCode", 200) >= 400:
        raise RuntimeError(body.get("message", "API 오류"))
    return body
```

---

## 3. 약품 (`/dschemical`)

### 3.1 조회

| 요청 | 결과 |
|---|---|
| `GET /dschemical` | 전체 |
| `GET /dschemical?id=A11042` | 코드 하나 (결과는 길이 1인 배열) |
| `GET /dschemical?active=Y` | 사용 중인 약품만 (2026-10-01 기준 204건) |
| `GET /dschemical?flgWork=Y` | 방제팀 사용 약품만 (107건) |
| `GET /dschemical?active=Y&flgWork=Y` | 둘 다 (77건) |

다른 조건(대분류, 이름 검색 등)은 받아온 뒤 앱에서 거르세요.

### 3.2 필드

**주로 쓰는 필드**

| 필드 | 타입 | 설명 | 예 |
|---|---|---|---|
| `dsids` | string | 약품 코드. **이카운트 품목코드와 같음** | `A11042` |
| `name` | string | 제품명 | `몬카트` |
| `unit` | string | 용량(규격). 숫자와 단위가 붙은 문자열 | `1ℓ`, `500㎖`, `20㎏` |
| `infoL2` | string | 대분류 | `농약` `비료` `기타약재` `잔디` |
| `infoL1` | string | 중분류 | `살균제` `살충제` `제초제` `비료` … |
| `infoL3` | string | 중요도 | `중요도1`~`중요도5`, `신규구매`, `기타`, `물품` |
| `IN_PRICE` | number | 구입가 (원) | `11500` |
| `OUT_PRICE` | number | 용역판가 (원) | `12075` |
| `OUT_PRICE1` | number | 판가 (원) | `13000` |
| `active` | `Y`/`N` | 사용 여부 | |
| `flgWork` | `Y`/`N` | 방제팀 사용 여부 | |
| `flgOut` | `Y`/`N` | 용역팀 사용 여부 | |
| `aliases` | string[] | 별칭. **OCR 오인식 표기까지 포함**한 검색어 목록. 없는 약품도 있음(54건만 있음) | `["몬카르", "몬카트유제", …]` |
| `vendors` | string | 구매처 | `(주)에이엘그린` |
| `type` | string | 품목구분. 표기가 섞여 있음 | `상품`, `[상품]`, `[제품]` |

**동기화 관련 필드** — [5장](#5-출처와-이카운트-동기화-필드)

`origin`, `createdAt`, `ecountSyncedAt`

**그 밖의 기존 필드** — 용도가 문서화되지 않은 필드입니다. 쓰기 전에 관리자에게 확인하세요.

`category`, `warehouse`(105건만 있음), `usage`, `cost`, `history`, `IN_PRICE[2025]`, `OUT_PRICE[2025]`, `OUT_PRICE1[2025]`

- `…[2025]` 가격과 `cost`, `usage`는 **문자열**입니다(`"11500"`, `"0.75"`). 숫자로 쓰려면 변환하세요.
- 가격 0은 "미입력"인 경우가 많습니다(이카운트에서 가져온 신규 약품은 판가가 0으로 들어옴).

### 3.3 코드 체계

| 접두어 | 대분류 / 중분류 |
|---|---|
| `A1` | 농약 / 살균제 |
| `A2` | 농약 / 살충제 |
| `A3` | 농약 / 제초제 |
| `B0`, `B5` | 비료 / 비료 |
| `C0` | 기타약재 / 기타약재 |
| `G0`, `G5` | 잔디 / 잔디 |

같은 제품의 용량별 품목은 앞자리가 같고 끝자리만 다릅니다(예: 몬카트 `A11041` 500㎖, `A11042` 1ℓ, `A11043` 5ℓ).

---

## 4. 거래처 (`/dscustomer`)

### 4.1 조회

| 요청 | 결과 |
|---|---|
| `GET /dscustomer` | 전체 |

- **조회 조건을 받지 않습니다.** `?id=` 를 붙여도 전체가 옵니다. 받아온 뒤 앱에서 거르세요.

### 4.2 필드

| 필드 | 타입 | 설명 | 예 |
|---|---|---|---|
| `custcd` | string | 거래처 코드. **이카운트 거래처코드와 같음** (아래 참고) | `3048508459` |
| `name` | string | 거래처명 | `(주)대호아이알` |
| `ceo` | string | 대표자명 | `황인석` |
| `bizType` | string | 업태 | `서비스외` |
| `bizItem` | string | 종목 | `골프장외` |
| `tel` | string | 전화 (비어 있는 경우가 많음, 약 16%만 있음) | |
| `email` | string | 이메일 (약 30%만 있음) | |
| `aliases` | {code, name, source?}[] | 별칭. 이카운트 '검색입력' 코드와 약칭, 그리고 여기서 붙인 현장 이름(`source: "local"`, `code`는 보통 빈 문자열) | `[{"code": "GC005", "name": "대호단양"}, {"code": "", "name": "월송리", "source": "local"}]` |
| `category` | string | 분류 | `골프장` `매입처` `매출처` `기타` |
| `active` | `Y`/`N` | 사용 여부 | |
| `memo` | string | 메모 | |
| `custType` | string | 구분. **웹에서 새로 만든 거래처에만** 있음 | `corp`(법인) / `person`(개인) |
| `updatedAt` | string | 마지막 수정 시각 (ISO 8601, UTC). 6.4 수정 API의 `expectedUpdatedAt`에 그대로 보낸다 | `2026-10-01T06:57:56.951Z` |
| `updatedBy` | string | 마지막으로 고친 곳 (6.4 API로 고쳤을 때) | `inv:a@b.com`, `web:a@b.com` |
| `ecountDirtyFields` | string[] | 이카운트에서 온 거래처의 이카운트 항목(`name` `ceo` `bizType` `bizItem`)을 여기서 고쳤다는 표시. 이카운트에도 같게 고치고 웹 엑셀 비교에서 확인하면 지워진다 | `["name"]` |

동기화 관련 필드(`origin`, `createdAt`, `ecountSyncedAt`)는 [5장](#5-출처와-이카운트-동기화-필드)을 보세요.

### 4.3 거래처 코드 형식

| 형식 | 의미 | 예 |
|---|---|---|
| 숫자 10자리 | 사업자등록번호 (대부분) | `3048508459` |
| `######-#******` | **개인. 주민등록번호를 마스킹한 값** (15건) | `800101-1******` |
| `P#####` | 웹에서 만든 개인 거래처 | `P00001` |
| `GC###`, `DST#####`, 숫자 3~5자리, `###-##-#####` | 이카운트에서 쓰던 기타 코드 | `GC075` |

- 마스킹된 코드는 실제 번호가 아닙니다. 번호로 쓰거나 복원하려 하지 마세요.
- `GC###` 같은 골프장 약칭 코드는 대부분 거래처 본 코드가 아니라 **`aliases`** 안에 있습니다. 약칭으로 찾으려면 별칭까지 검색하세요.

### 4.4 개인정보

대표자 이름, 전화, 이메일이 들어 있습니다.

- 봇 답변에는 필요한 항목만 보여주세요. 전화·이메일은 사내 사용자에게만 보여주세요.
- 받아온 데이터를 파일이나 로그로 따로 쌓아두지 마세요. 필요하면 짧은 시간만 메모리에 캐시하세요.

---

## 4-1. 창고 (`/dswarehouse`)

`GET /dswarehouse` — 전체 목록. 조회 조건은 받지 않습니다.

| 필드 | 타입 | 설명 | 예 |
|---|---|---|---|
| `whcd` | string | 창고 코드. **이카운트 창고코드와 같음**. 앞자리 0 포함 문자열 | `100`, `00001`, `513` |
| `name` | string | 창고명 | `본사창고`, `용역 코리아` |
| `whType` | string | 구분 | `창고` `공장` `외주` |
| `active` | `Y`/`N` | 사용 여부 (이카운트 '사용') | |
| `site` | string | 추가사업장명 | `(주)동성그린` |
| `process`, `outCust` | string | 생산공정명, 외주거래처명 (지금은 모두 비어 있음) | |
| `memo` | string | 메모 (글로벌 DB에서 관리) | |

동기화 관련 필드(`origin`, `createdAt`, `updatedAt`, `ecountSyncedAt`)는 [5장](#5-출처와-이카운트-동기화-필드)과 같습니다.

- **다른 데이터는 창고를 코드가 아니라 창고명으로 가리킵니다.** 약품의 `warehouse`(예: `"본사창고"`, 여러 개면 `"본사창고,용역 코리아"`)와 방제 기본 정보의 `warehouse`·`outwarehouse`가 그렇습니다. 연결할 때는 `name`으로 맞추세요. 2026-10-05 기준 모두 정확히 일치합니다.
- 이름 규칙: `용역 {골프장}`은 용역 현장 창고, `본사창고`·`중부방제`·`남부방제`·`중부팀`·`남부팀`은 내부 창고입니다.

---

## 5. 출처와 이카운트 동기화 필드

약품과 거래처 모두 같은 규칙입니다.

| 필드 | 값 | 의미 |
|---|---|---|
| `origin` | `ecount` | 이카운트에서 가져온 데이터 (2026-10-01 이전 데이터는 전부 이 값) |
| | `local` | 웹에서 처음 만든 데이터 |
| `createdAt` | ISO 8601 | 만든 시각. 2026-10-01 이후에 들어온 데이터에만 있음 |
| `ecountSyncedAt` | ISO 8601 | `local` 데이터가 이카운트에 등록된 것을 확인한 시각. 없으면 아직 이카운트 미등록 |

**외부 앱에서 주의할 점**

- `origin = local`이고 `ecountSyncedAt`이 없으면 **이카운트에는 아직 없는 코드**입니다. 이 코드로 이카운트 전표·견적을 만들면 실패할 수 있습니다.
- 이카운트와 맞춰야 하는 작업에서는 `origin === 'ecount' || ecountSyncedAt` 인 데이터만 쓰는 게 안전합니다.

---

## 6. 새로 추가 — create API

새 약품·거래처는 **이 API로만** 추가하세요. 웹도 같은 API를 씁니다.

- **코드는 서버가 정합니다.** 보낸 `dsids`·`custcd`(개인), `origin`, `createdAt`, `ecountSyncedAt`은 무시됩니다.
- **이미 있는 코드는 절대 덮어쓰지 않습니다.** 동시에 추가해도 서로 다른 코드를 받습니다.
- 서버가 `origin: 'local'`, `createdAt`, `updatedAt`을 붙입니다. 그래서 새 항목은 [5장](#5-출처와-이카운트-동기화-필드)의 "이카운트 미등록" 상태로 시작합니다.
- 응답도 2장과 같은 형식입니다. HTTP는 200이고, 결과는 `statusCode`로 판단합니다.

| 요청 | 동작 |
|---|---|
| `POST /dschemical/create` | 약품 추가 |
| `GET /dschemical/next-code?infoL1=&name=&unit=` | 다음 코드 미리보기와 비슷한 이름 확인. **저장 안 함, 코드는 확정 아님** |
| `POST /dscustomer/create` | 거래처 추가 |
| `POST /dswarehouse/create` | 창고 추가 |

### 6.1 약품 추가

```http
POST /dschemical/create
{ "name": "몬카트", "unit": "1ℓ", "infoL1": "살균제", "infoL3": "중요도4",
  "IN_PRICE": 11500, "OUT_PRICE": 12075, "OUT_PRICE1": 13000, "vendors": "", "aliases": [] }
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `name` | ✔ | 제품명 |
| `infoL1` | ✔ | `살균제` `살충제` `제초제` `비료` `기타약재` `잔디` `기타물품` 중 하나. 대분류(`infoL2`)는 서버가 정합니다(보내면 일치해야 함) |
| `unit` | | 용량. 예: `1ℓ`, `500㎖`, `20kg` |
| `infoL3` | | 중요도. 기본 `중요도1` |
| `IN_PRICE` `OUT_PRICE` `OUT_PRICE1` | | 0 이상 숫자. 기본 0 |
| `active` `flgWork` `flgOut` | | `Y`/`N`. 기본 `Y` |
| `vendors` `type` `aliases`(문자열 배열) `createdBy` | | 선택 |
| `confirmSimilar` | | 아래 409를 사용자가 확인한 뒤 `true`로 다시 보낼 때 |

**코드 규칙** (3.3 코드 체계)
- 같은 이름이 있으면 그 제품의 다음 용량 순번을 받습니다. 예: 몬카트 `A11042` 다음은 `A11043`.
- 새 이름이면 새 일련번호를 받고 끝자리는 0입니다. 예: `A18040`.
- 앞 두 글자는 보낸 `infoL1`을 따릅니다.

**응답**

| statusCode | 의미 | body |
|---|---|---|
| `201` | 추가됨 | 저장된 레코드 전체 (`dsids` 포함) |
| `409` | **비슷한 약품이 있음 — 사용자 확인 필요** | `reason: "similar"`, `similar`, `sameName`, `sameUnit`, `message` |
| `400` | 입력 오류 | `message` |
| `503` | 동시 추가가 몰려 코드를 못 정함 | 잠시 후 다시 시도 |

**409 비슷한 이름 확인**: 아래 경우에는 바로 만들지 않고 후보를 돌려줍니다.
- 띄어쓰기·기호만 다른 이름. 예: `DryCare DS-100` ↔ `DryCareDS-100`
- 한쪽 이름이 다른 쪽에 포함됨. 예: `루트칼 액제` ↔ `루트칼`
- 글자가 80% 이상 비슷함. 예: `신승` ↔ `선승`
- 별칭과 일치함. 예: `몬카르` → 몬카트의 별칭
- 같은 이름에 **같은 용량**까지 있음 (`sameUnit: true`)

사용자에게 후보를 보여주고, 새 약품이 맞다고 하면 같은 내용에 `"confirmSimilar": true`를 붙여 다시 보내세요. 같은 이름의 *다른 용량*은 정상적인 추가라 409가 나지 않습니다.

```json
{ "message": "비슷한 이름의 약품이 있습니다. 새 약품이 맞으면 confirmSimilar: true 로 다시 보내세요",
  "reason": "similar", "sameUnit": false, "sameName": [],
  "similar": [ { "name": "선승", "score": 0.83, "reason": "비슷한 이름",
                 "codes": [ { "dsids": "A17802", "unit": "500㎖" } ] } ] }
```

### 6.2 거래처 추가

```http
POST /dscustomer/create
{ "custType": "corp", "bizNo": "123-45-67890", "name": "(주)가나다", "ceo": "홍길동",
  "bizType": "서비스", "bizItem": "골프장", "tel": "", "email": "", "category": "골프장", "memo": "" }

{ "custType": "person", "name": "김개인", "tel": "", "email": "", "category": "기타" }
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `custType` | ✔ | `corp`(법인) 또는 `person`(개인) |
| `name` | ✔ | 거래처명 (개인은 이름) |
| `bizNo` | 법인 ✔ | 사업자등록번호. 하이픈은 있어도 되고, 숫자 10자리가 그대로 거래처코드가 됩니다 |
| `allowInvalidBizNo` | | 사업자번호 검증번호가 틀려도 맞는 번호라고 사용자가 확인했을 때 `true` |
| `category` | | `골프장` `매입처` `매출처` `기타`. 기본 `기타` |
| `ceo` `bizType` `bizItem` `tel` `email` `memo` `createdBy` | | 선택. 개인은 `ceo`가 이름으로 채워지고 업태·종목은 비웁니다 |

- 개인 코드는 서버가 `P00001`부터 순서대로 정합니다. **주민등록번호는 보내지 마세요.**
- 거래처는 비슷한 이름 확인을 하지 않습니다.

| statusCode | 의미 | body |
|---|---|---|
| `201` | 추가됨 | 저장된 레코드 전체 (`custcd` 포함) |
| `409` | 같은 사업자번호의 거래처가 이미 있음 (덮어쓰지 않음) | `message`, `existing: { custcd, name }` |
| `422` | 사업자번호 검증번호가 맞지 않음 | `message`. 사용자 확인 후 `allowInvalidBizNo: true`로 다시 보내기 |
| `400` | 입력 오류 | `message` |

### 6.2-1 창고 추가 — `POST /dswarehouse/create`

```http
POST /dswarehouse/create
{ "whcd": "514", "name": "용역 신규골프장", "whType": "창고", "site": "(주)동성그린", "memo": "" }
```

- 필수: `whcd`(영문·숫자 1~10자, 이카운트처럼 **직접 정함**), `name`. `whType`은 `창고` `공장` `외주` 중 하나이고 기본값은 `창고`입니다.
- 사용 여부는 `Y`로 만들어집니다. 서버가 `origin: 'local'`, `createdAt`, `updatedAt`을 붙입니다.

| statusCode | 의미 | body |
|---|---|---|
| `201` | 추가됨 | 저장된 레코드 전체 |
| `409` `reason: "code"` | 같은 창고코드가 이미 있음 (덮어쓰지 않음) | `existing: { whcd, name }` |
| `409` `reason: "name"` | 같은 창고명이 이미 있음 (띄어쓰기 무시) — 창고는 이름으로 연결되므로 막음 | `existing: { whcd, name }` |
| `400` | 입력 오류 | `message` |

### 6.4 거래처 부분 수정 · 별칭 · 변경 이력

레코드 전체를 덮어쓰지 않고, **바꿀 것만** 보냅니다. 동시 수정을 확인하고, 바꿀 때마다 변경 이력이 남습니다. 웹도 같은 API를 씁니다.

| 요청 | 동작 | API 키 |
|---|---|---|
| `POST /dscustomer/update` | 정보 부분 수정 | **필요** |
| `POST /dscustomer/alias` | 별칭 추가·삭제 | **필요** |
| `GET /dscustomer/history?id={custcd}` | 변경 이력 (최근 50건, 새것부터) | 없음 |

**API 키**: update·alias 요청에는 `x-api-key` 헤더가 필요합니다. 키가 없거나 틀리면 API Gateway가 **HTTP 403**(`{"message":"Forbidden"}`)을 돌려줍니다. 이때는 Lambda까지 가지 않아서, 다른 오류처럼 `statusCode` 래핑이 없습니다.
- 키는 앱마다 따로 발급합니다: `globaldb-inv`(재고), `globaldb-quote`(견적), `globaldb-web`(글로벌 DB 웹). 관리자에게 받아 서버의 `.env`에만 두고, 코드·문서·커밋에는 넣지 마세요.
- 앱별로 키를 끌 수 있습니다. 키가 새어 나가면 관리자에게 알려 주세요.
- 조회(GET)와 create API에는 아직 키가 필요 없습니다.

#### 6.4.1 정보 부분 수정 — `POST /dscustomer/update`

```json
{ "custcd": "2248106308",
  "expectedUpdatedAt": "2026-10-01T06:57:56.951Z",
  "set": { "category": "골프장", "memo": "월송리 잔디 납품처" },
  "updatedBy": "inv:a@b.com" }
```

- `custcd`, `expectedUpdatedAt`, `set`, `updatedBy`는 모두 필수입니다.
- `expectedUpdatedAt`: 읽어 온 레코드의 `updatedAt`. 없던 레코드면 `null`을 보냅니다. 서버 값과 다르면 저장하지 않고 409를 돌려줍니다.
- `set`에 쓸 수 있는 필드는 아래와 같고, **여기 있는 필드만** 바뀝니다. 그 밖의 필드는 400입니다(`custcd` `aliases` `origin` `createdAt` `ecountSyncedAt` `custType` `updatedAt` 등).

  | 필드 | 검사 |
  |---|---|
  | `name` | 비울 수 없음, 앞뒤 공백 제거 |
  | `ceo` `bizType` `bizItem` `tel` `memo` | 문자열 |
  | `email` | 빈 문자열 또는 이메일 형식 |
  | `category` | `골프장` `매입처` `매출처` `기타` |
  | `active` | `Y` / `N` |

- 지금과 같은 값은 바꾸지 않습니다. 모두 같으면 저장하지 않고 200으로 지금 레코드를 돌려줍니다.
- 이카운트에서 온 거래처(`origin: "ecount"`)의 `name` `ceo` `bizType` `bizItem`을 바꾸면 `ecountDirtyFields`에 표시됩니다. 이카운트 거래처등록에도 같게 고쳐야 합니다. 웹 엑셀 비교는 이 항목을 이카운트 값으로 되돌리지 않습니다.

| statusCode | 의미 | body |
|---|---|---|
| `200` | 저장됨 (또는 바뀐 것 없음) | 저장된 레코드 전체 — 새 `updatedAt`을 다음 수정에 씁니다 |
| `400` | 허용 안 되는 필드, 값 오류 | `message`, `field` |
| `404` | 없는 거래처 코드 | `message` |
| `409` `reason: "conflict"` | **다른 곳에서 먼저 고침 — 저장 안 됨** | `message`, `current`(지금 레코드 전체). 사용자에게 보여주고 다시 고칠지 묻습니다 |

#### 6.4.2 별칭 추가·삭제 — `POST /dscustomer/alias`

```json
{ "custcd": "2248106308",
  "add": [ { "name": "월송리" }, { "name": "월송리cc", "code": "GC100" } ],
  "remove": [ { "name": "오크밸리" } ],
  "updatedBy": "inv:a@b.com" }
```

- `custcd`, `updatedBy`는 필수입니다. `add`와 `remove` 중 하나는 있어야 하고, 합쳐서 한 번에 20개까지입니다. 별칭 이름은 1~40자입니다.
- `expectedUpdatedAt`은 받지 않습니다. 서버가 지금 목록을 읽어 더하고 빼며, 동시에 다른 수정이 끼면 다시 읽어 최대 3번 시도합니다. 그래서 두 앱이 동시에 별칭을 더해도 둘 다 들어갑니다.
- 같은 별칭인지는 공백·대소문자·기호를 빼고 비교합니다(`월송리 CC` = `월송리cc`). 이미 있는 별칭을 더하면 조용히 무시하고, `remove`도 이 기준으로 찾습니다.
- 여기서 더한 별칭에는 `source: "local"`이 붙습니다. 이카운트 엑셀 비교가 이 별칭을 지우지 않습니다.
- **다른 거래처가 같은 이름을 별칭이나 거래처명으로 쓰고 있으면 409**(`aliasTaken`)입니다. 거래처명은 `(주)`·`주식회사` 같은 법인 표기를 빼고 비교합니다. 사용자가 맞다고 확인하면 `"force": true`로 다시 보냅니다.

| statusCode | 의미 | body |
|---|---|---|
| `200` | 저장됨 (또는 바뀐 것 없음) | 레코드 전체 (`aliases` 포함) |
| `400` | 입력 오류 | `message` |
| `404` | 없는 거래처 | `message` |
| `409` `reason: "aliasTaken"` | 다른 거래처가 같은 이름을 씀 — 저장 안 됨 | `taken: [{alias, custcd, name}]` |
| `503` | 동시 수정이 몰려 3번 모두 실패 | 잠시 후 다시 시도 |

#### 6.4.3 변경 이력 — `GET /dscustomer/history?id={custcd}`

```json
[ { "at": "2026-10-06T05:12:00.123Z", "by": "inv:a@b.com", "action": "alias",
    "changes": { "aliases": [["오크밸리"], ["오크밸리", "월송리"]] } },
  { "at": "2026-10-06T05:10:41.002Z", "by": "web:a@b.com", "action": "update",
    "changes": { "memo": ["", "월송리 잔디 납품처"], "tel": ["(변경됨)", "(변경됨)"] } } ]
```

- `changes`는 `{필드: [이전, 이후]}` 형식입니다. 전화·이메일은 값 대신 `(변경됨)`으로만 남깁니다.
- 이 API를 쓰기 전(2026-10-06 이전)의 수정이나, 웹 엑셀 비교로 반영한 변경은 이력에 없습니다.

#### 6.4.4 예 (Python)

```python
def update_customer(customer, changes, by):
    """customer: GET 으로 받은 레코드, changes: {'memo': '...'}"""
    status, res = _post("/dscustomer/update", {"custcd": customer["custcd"], "expectedUpdatedAt": customer.get("updatedAt"),
                                               "set": changes, "updatedBy": by})
    if status == 409:
        raise RuntimeError("다른 곳에서 먼저 고쳤습니다. 최신 내용: " + res["current"]["name"])
    if status != 200:
        raise RuntimeError(res.get("message", f"수정 실패 ({status})"))
    _cache.clear()
    return res


def add_alias(custcd, name, by, confirm):
    status, res = _post("/dscustomer/alias", {"custcd": custcd, "add": [{"name": name}], "updatedBy": by})
    if status == 409 and res.get("reason") == "aliasTaken":
        owner = res["taken"][0]
        if not confirm(f"'{name}'은 {owner['name']}({owner['custcd']})도 쓰고 있습니다. 그래도 저장할까요?"):
            return None
        status, res = _post("/dscustomer/alias", {"custcd": custcd, "add": [{"name": name}], "updatedBy": by, "force": True})
    if status != 200:
        raise RuntimeError(res.get("message", f"별칭 저장 실패 ({status})"))
    _cache.clear()
    return res
```

(`_post`, `_cache`는 7.1·7.4장 코드. update·alias 호출에는 `headers={"x-api-key": os.environ["GDB_API_KEY"]}`를 붙입니다)

### 6.5 약품 부분 수정 · 별칭 · 변경 이력

6.4와 같은 규칙입니다(API 키, `expectedUpdatedAt` 동시 수정 확인, 409 `conflict`·`aliasTaken`, 3번 재시도, 이력). 다른 점만 적습니다.

| 요청 | 동작 | API 키 |
|---|---|---|
| `POST /dschemical/update` | 정보 부분 수정 | **필요** |
| `POST /dschemical/alias` | 별칭 추가·삭제 | **필요** |
| `GET /dschemical/history?id={dsids}` | 변경 이력 | 없음 |

- 키 필드는 `dsids`입니다. 대부분의 약품은 아직 `updatedAt`이 없으니, 처음 고칠 때는 `"expectedUpdatedAt": null`을 보냅니다. 받은 레코드에 그대로 있는 값을 보내면 됩니다.
- `set`에 쓸 수 있는 필드:

  | 필드 | 검사 |
  |---|---|
  | `name` | 비울 수 없음 |
  | `unit` `infoL3` `vendors` | 문자열 |
  | `IN_PRICE` `OUT_PRICE` `OUT_PRICE1` | 0 이상 숫자 (숫자 문자열도 가능) |
  | `active` `flgWork` `flgOut` | `Y` / `N` |

  `dsids`·`infoL1`·`infoL2`는 코드 체계와 묶여 있어 바꿀 수 없습니다(400).
- 별칭은 **문자열 목록**입니다: `"add": ["데브리놀"]`, `"remove": ["데브리놀"]`.
- 별칭 겹침(`aliasTaken`)은 **이름이 다른** 약품의 이름·별칭만 봅니다. 같은 이름의 다른 용량(예: 몬카트 500㎖와 1ℓ)은 같은 제품이라 겹침으로 보지 않습니다.
- 약품은 `ecountDirtyFields` 표시를 하지 않습니다.

```json
POST /dschemical/alias
{ "dsids": "A30410", "add": ["데브리놀"], "updatedBy": "inv:a@b.com" }
```

### 6.3 수정·삭제 API (웹 전용, 참고)

외부 앱·봇에서는 쓰지 마세요. 꼭 필요하면 관리자와 먼저 협의하세요.

| API | 동작 |
|---|---|
| `POST` / `PUT /dschemical` | 약품 한 건 저장 (덮어쓰기) |
| `DELETE /dschemical?id={dsids}` | 약품 삭제 |
| `POST` / `PUT /dscustomer` | 거래처 한 건(객체) 또는 여러 건(배열) 저장 (덮어쓰기) |
| `DELETE /dscustomer?id={custcd}` | 거래처 삭제 |
| `POST` / `PUT /dswarehouse` | 창고 한 건(객체) 또는 여러 건(배열) 저장 (덮어쓰기) |
| `DELETE /dswarehouse?id={whcd}` | 창고 삭제 |

- 저장은 **덮어쓰기**입니다. 일부 필드만 보내면 나머지 필드가 지워집니다. 반드시 GET으로 받은 레코드 전체에 바꿀 값만 고쳐서 보내세요.
- **새로 추가할 때는 이 API를 쓰지 마세요.** 코드 중복 검사가 없어 기존 레코드를 덮어쓸 수 있습니다. 6.1과 6.2를 쓰세요.

---

## 7. 사용 예

### 7.1 Python — 불러오기, 캐시, 검색

```python
import json
import time

import requests

BASE = "https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev"
CACHE_SECONDS = 600   # 데이터는 자주 바뀌지 않음. 응답이 2초 안팎이라 캐시 권장

_cache = {}


def _unwrap(res_json):
    body = res_json["body"]
    body = json.loads(body) if isinstance(body, str) else body
    if res_json.get("statusCode", 200) >= 400:
        raise RuntimeError(body.get("message", "API 오류"))
    return body


def fetch(path, params=None):
    key = (path, tuple(sorted((params or {}).items())))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    r = requests.get(BASE + path, params=params, timeout=15)
    r.raise_for_status()
    data = _unwrap(r.json())
    _cache[key] = (time.time(), data)
    return data


def _norm(s):
    return "".join((s or "").split()).lower()   # 띄어쓰기·대소문자 무시


def search_chemicals(query, only_active=True):
    """제품명·코드·별칭(OCR 오인식 표기 포함)으로 약품 검색."""
    q = _norm(query)
    items = fetch("/dschemical", {"active": "Y"} if only_active else None)
    return [c for c in items
            if q in _norm(c["name"]) or q in _norm(c["dsids"])
            or any(q in _norm(a) for a in c.get("aliases", []))]


def search_customers(query):
    """거래처명·코드·대표자·별칭(GC 코드, 약칭)으로 거래처 검색."""
    q = _norm(query)
    hits = []
    for c in fetch("/dscustomer"):
        if c.get("active") != "Y":
            continue
        fields = [c["name"], c["custcd"], c.get("ceo", "")]
        fields += [f'{a["code"]} {a["name"]}' for a in c.get("aliases", [])]
        if any(q in _norm(f) for f in fields):
            hits.append(c)
    return hits


if __name__ == "__main__":
    for c in search_chemicals("몬카트"):
        print(c["dsids"], c["name"], c["unit"], f'{c["OUT_PRICE1"]:,}원')
    for c in search_customers("부산컨트리"):
        print(c["custcd"], c["name"], c["category"])
```

### 7.2 텔레그램 봇 (python-telegram-bot v20+)

위 7.1의 함수를 그대로 씁니다.

```python
import os

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

from globaldb import search_chemicals, search_customers   # 7.1 코드를 globaldb.py 로 저장


async def chem(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = " ".join(context.args)
    if not query:
        await update.message.reply_text("사용법: /chem 제품명")
        return
    hits = search_chemicals(query)[:10]
    if not hits:
        await update.message.reply_text(f"'{query}' 약품을 찾지 못했습니다.")
        return
    lines = [f'{c["dsids"]} {c["name"]} {c["unit"]} · {c["infoL1"]} · 판가 {c["OUT_PRICE1"]:,}원'
             for c in hits]
    await update.message.reply_text("\n".join(lines))


async def cust(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = " ".join(context.args)
    if not query:
        await update.message.reply_text("사용법: /cust 거래처명")
        return
    hits = search_customers(query)[:10]
    if not hits:
        await update.message.reply_text(f"'{query}' 거래처를 찾지 못했습니다.")
        return
    # 전화·이메일은 사내 사용자에게만 보여줄 것 (4.4)
    lines = [f'{c["name"]} ({c["custcd"]}) · {c["category"]}' for c in hits]
    await update.message.reply_text("\n".join(lines))


def main():
    app = Application.builder().token(os.environ["TELEGRAM_BOT_TOKEN"]).build()
    app.add_handler(CommandHandler("chem", chem))
    app.add_handler(CommandHandler("cust", cust))
    app.run_polling()


if __name__ == "__main__":
    main()
```

- `requests`는 동기 호출이라, 캐시가 비어 있을 때 한 번 2초 정도 봇이 멈춥니다. 사용자가 많아지면 `httpx.AsyncClient`로 바꾸거나, 봇 시작 시와 주기적으로 미리 불러오세요.
- 봇 토큰(`TELEGRAM_BOT_TOKEN`)은 환경변수나 비밀 저장소에 두고 코드에 적지 마세요.
- 봇을 아무나 쓸 수 없게, 허용한 채팅 ID나 사용자 ID만 응답하도록 거르세요.

### 7.3 JavaScript (브라우저 · Node 18+)

```js
const BASE = 'https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev';

async function fetchGlobalDB(path, params) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  const json = await res.json();
  const body = typeof json.body === 'string' ? JSON.parse(json.body) : json.body;
  if (json.statusCode >= 400) throw new Error(body?.message || 'API 오류');
  return body;
}

const chemicals = await fetchGlobalDB('/dschemical', { active: 'Y', flgWork: 'Y' });
const customers = await fetchGlobalDB('/dscustomer');
const golfCourses = customers.filter(c => c.category === '골프장' && c.active === 'Y');
```

### 7.4 Python — 새로 추가 (비슷한 이름 확인 포함)

7.1의 `BASE`, `_cache`를 그대로 씁니다.

```python
def _post(path, body):
    r = requests.post(BASE + path, json=body, timeout=30)
    r.raise_for_status()
    res = r.json()
    body = res["body"]
    return res["statusCode"], (json.loads(body) if isinstance(body, str) else body)


def describe_similar(res):
    lines = []
    if res.get("sameUnit"):
        lines.append("같은 이름·같은 용량: " + ", ".join(f'{c["dsids"]} {c["unit"]}' for c in res["sameName"]))
    for s in res.get("similar", []):
        units = ", ".join(f'{c["dsids"]} {c["unit"]}' for c in s["codes"])
        lines.append(f'비슷한 약품 {s["name"]} ({s["reason"]}, {round(s["score"] * 100)}%): {units}')
    return "\n".join(lines)


def create_chemical(item, confirm):
    """confirm(message) -> bool : 비슷한 약품이 있을 때 사용자에게 물어보는 함수."""
    status, res = _post("/dschemical/create", item)
    if status == 409 and res.get("reason") == "similar":
        if not confirm(describe_similar(res)):
            return None                                    # 사용자가 취소
        status, res = _post("/dschemical/create", {**item, "confirmSimilar": True})
    if status != 201:
        raise RuntimeError(res.get("message", f"추가 실패 ({status})"))
    _cache.clear()                                         # 목록 캐시 비우기
    return res                                             # res["dsids"] 가 확정 코드


def create_customer(item):
    status, res = _post("/dscustomer/create", item)
    if status == 409:
        raise RuntimeError(f'이미 있는 거래처: {res["existing"]["name"]} ({res["existing"]["custcd"]})')
    if status != 201:
        raise RuntimeError(res.get("message", f"추가 실패 ({status})"))   # 422 는 사업자번호 확인 필요
    _cache.clear()
    return res                                             # res["custcd"] 가 거래처 코드


# 예: 콘솔에서 확인
new = create_chemical({"name": "신승", "infoL1": "살균제", "unit": "1ℓ"},
                      confirm=lambda msg: input(msg + "\n그래도 추가할까요? (y/n) ") == "y")
```

텔레그램 봇에서는 `confirm` 대신 409 후보를 답장으로 보여주고, 사용자가 확인 버튼(InlineKeyboard)을 누르면 `confirmSimilar: True`로 다시 보내면 됩니다.

---

## 8. 데이터 갱신 주기와 출처

| 데이터 | 언제 바뀌나 |
|---|---|
| 약품 | 웹에서 추가·수정할 때. 이카운트 신규 품목은 웹의 [이카운트 비교]로 사람이 확인해서 추가 |
| 거래처 | 웹에서 추가·수정할 때. 이카운트 거래처등록 엑셀을 웹에 올려 신규·변경을 반영할 때 |

- 실시간으로 이카운트와 연결된 데이터가 아닙니다. 이카운트에만 있고 아직 반영 안 된 품목·거래처가 있을 수 있습니다.
- 캐시는 수 분~1시간이면 충분합니다.

---

## 9. 문의 · 관련 문서

- 데이터 관리 화면: dsglobaldb_manager 웹 → 약품정보 / 거래처정보
- 다른 API(인력, 장비, 유지보수 등): [DATA_AND_API.md](DATA_AND_API.md)
- Lambda 소스: `AWS/Lambda/dscustomerDynamoDB/`, AWS의 `dschemicalDynamoDB` (다운로드: `AWS/Lambda/(L0-0) Download Lambda functions.ipynb`)
