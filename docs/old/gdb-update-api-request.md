# 글로벌 DB 작업 요청 — 거래처 정보 수정 · 별칭 추가 API

> 요청: 재고 관리(inv mg) 프로젝트 · 2026-10-06
> 대상: 글로벌 DB 프로젝트 (dsglobaldb_manager / API `jyipsj28s9…/dev`)
> 관련 문서: `EXTERNAL_API_GUIDE.md` 6장(create API), 6.3(수정·삭제 API)

## 1. 왜 필요한가

재고 봇은 거래처를 글로벌 DB에서 찾는다. 현장 직원은 거래처를 정식 이름이 아닌 **현장 이름**으로 쓴다.
예를 들어 '월송리'는 아이파크리조트(주), '설해원'은 (주)새서울레저다.
봇이 이걸 알려면 거래처의 `aliases`(별칭)에 현장 이름이 있어야 한다.
그 밖에 업태·메모·분류 같은 거래처 정보도 재고 앱에서 바로 고칠 수 있으면 좋겠다.

그런데 지금 수정 API(`PUT /dscustomer`)는 외부 앱이 쓰기에 위험하다.
- **레코드 전체 덮어쓰기**: 일부 필드만 보내면 나머지가 지워진다.
- **동시 수정 확인 없음**: 재고 앱이 10분 캐시한 오래된 사본으로 저장하면, 그 사이 웹에서 고친 내용이 사라진다.
- **누가 무엇을 바꿨는지 기록이 없다.**

그래서 **바꿀 필드만 보내는 부분 수정 API**와 **별칭만 더하고 빼는 API**를 요청한다.
둘 다 동시 수정 확인과 변경 이력을 갖춰야 한다.
웹(dsglobaldb_manager)도 이 API를 쓰도록 바꾸면 웹과 외부 앱이 같은 규칙을 따르게 된다.

## 2. 요청하는 API

응답 형식은 기존과 같다: HTTP 200 + `{statusCode, body}`. `body`는 JSON 문자열이다 (가이드 2장).

### 2.1 거래처 정보 부분 수정 — `POST /dscustomer/update`

```http
POST /dscustomer/update
{
  "custcd": "2248106308",
  "expectedUpdatedAt": "2026-10-01T06:57:56.951Z",
  "set": { "category": "골프장", "memo": "월송리 잔디 납품처" },
  "updatedBy": "inv:yc463cor@gmail.com"
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `custcd` | ✔ | 고칠 거래처 코드 |
| `expectedUpdatedAt` | ✔ | 클라이언트가 읽은 레코드의 `updatedAt`. 서버의 값과 다르면 저장하지 않는다 (409). `updatedAt`이 없는 옛 레코드는 `null`을 보낸다 |
| `set` | ✔ | 바꿀 필드와 값. **여기 있는 필드만** 바뀌고 나머지는 그대로 |
| `updatedBy` | ✔ | 누가 바꿨는지. 예: `inv:<이메일>`, `web:<이메일>` |

**`set`에 쓸 수 있는 필드 (허용 목록)**

| 필드 | 검사 |
|---|---|
| `name` | 빈 문자열 금지, 앞뒤 공백 제거 |
| `ceo` `bizType` `bizItem` `tel` `memo` | 문자열 |
| `email` | 빈 문자열 또는 이메일 형식 |
| `category` | `골프장` `매입처` `매출처` `기타` |
| `active` | `Y` / `N` |

- **허용 목록 밖의 필드는 거부한다 (400).** `custcd`, `origin`, `createdAt`, `ecountSyncedAt`, `custType`, `aliases`, `updatedAt`이 해당한다. 별칭은 2.2로 고친다. 코드는 바꾸지 않는다.
- 저장은 DynamoDB `UpdateItem` 하나로 한다.
  - `SET`으로 바꿀 필드 + `updatedAt` + `updatedBy`를 쓴다.
  - `ConditionExpression`은 `attribute_exists(custcd) AND updatedAt = :expected`이다. 옛 레코드는 `attribute_not_exists(updatedAt)`로 확인한다.
- 값이 지금과 같은 필드는 바꾸지 않는다. 모두 같으면 저장 없이 200으로 지금 레코드를 돌려준다.
- **이카운트 연동 표시**: `origin = ecount`인 거래처의 `name`·`ceo`·`bizType`·`bizItem`을 바꾸면 `ecountDirtyFields`(문자열 배열)에 그 필드명을 더한다. 이카운트 거래처 정보도 고쳐야 한다는 표시다. 이카운트에 반영했는지 확인하는 방식은 기존 `ecountSyncedAt` 흐름에 맞춰 정한다.

| statusCode | 의미 | body |
|---|---|---|
| `200` | 저장됨 (또는 바뀐 것 없음) | 저장된 레코드 전체 |
| `400` | 허용 안 되는 필드, 값 오류 | `message`, `field` |
| `404` | 없는 거래처 코드 | `message` |
| `409` | **다른 곳에서 먼저 고침** — 저장 안 함 | `message`, `reason: "conflict"`, `current`(지금 레코드 전체) |

409를 받은 클라이언트는 `current`를 사용자에게 보여 주고, 다시 고칠지 묻는다.

### 2.2 별칭 추가·삭제 — `POST /dscustomer/alias`

```http
POST /dscustomer/alias
{
  "custcd": "2248106308",
  "add": [ { "name": "월송리" }, { "name": "월송리cc", "code": "GC0xx" } ],
  "remove": [ { "name": "오크밸리" } ],
  "updatedBy": "inv:yc463cor@gmail.com"
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `custcd` | ✔ | 거래처 코드 |
| `add` | | 더할 별칭 `{name, code?}` 목록. `code`가 없으면 빈 문자열 |
| `remove` | | 뺄 별칭. `name`으로 찾는다 |
| `force` | | 아래 `aliasTaken` 409를 사용자가 확인했을 때 `true` |
| `updatedBy` | ✔ | 누가 |

- `expectedUpdatedAt`은 받지 않는다. 별칭은 서로 독립된 항목이라 **서버가 지금 목록을 읽어 더하고 빼서 저장**한다. 이 읽기·쓰기 사이에 다른 수정이 끼면 조건부 쓰기(`updatedAt` 비교)가 실패하므로, 서버가 다시 읽어 최대 3번 재시도한다.
- **같은 별칭 판단**: 공백·대소문자·기호를 뺀 이름으로 비교한다 (`월송리 CC` = `월송리cc`). 이미 있는 별칭을 더하면 그냥 무시한다 (오류 아님).
- **다른 거래처가 이미 같은 별칭을 쓰면** 409 `reason: "aliasTaken"`과 그 거래처 `{custcd, name}`을 돌려준다. 봇이 엉뚱한 거래처로 연결되는 것을 막기 위해서다. 사용자가 확인하면 `force: true`로 다시 보낸다.
- 별칭 이름은 1~40자, 한 번에 최대 20개까지 받는다.

| statusCode | 의미 | body |
|---|---|---|
| `200` | 저장됨 | 레코드 전체 (`aliases` 포함) |
| `400` | 입력 오류 | `message` |
| `404` | 없는 거래처 | `message` |
| `409` | 다른 거래처가 같은 별칭을 씀 | `reason: "aliasTaken"`, `taken: [{alias, custcd, name}]` |
| `503` | 동시 수정이 몰려 3번 모두 실패 | 잠시 후 다시 |

### 2.3 변경 이력 — `GET /dscustomer/history?id={custcd}`

- 2.1, 2.2로 바뀔 때마다 한 줄씩 남긴다: `{at, by, action: "update"|"alias", changes: {필드: [이전,이후]}}`.
  - 저장 위치는 별도 테이블(`dscustomer_history`, 키 `custcd` + `at`)을 권한다. 레코드 안에 계속 쌓으면 커진다.
- 최근 50건을 새것부터 돌려준다.
- 웹 거래처 화면에 '변경 이력'으로 보여 주면 좋다.

## 3. 보안·개인정보

- **쓰기 API에 최소한의 인증을 붙이길 권한다.** 지금은 URL만 알면 누구나 쓸 수 있다. 예: `x-api-key` 헤더(API Gateway 사용량 계획 키). 앱마다 키를 따로 주고, 재고 서버는 키를 `.env`에만 둔다. 읽기(GET)는 지금처럼 두어도 된다.
- 대표자·전화·이메일은 개인정보다. **Lambda 로그(CloudWatch)에 요청 본문·레코드 전체를 찍지 않는다.** 로그에는 `custcd`·바뀐 필드 이름·`updatedBy`만 남긴다.
- 변경 이력에도 `tel`·`email` 값은 `"(변경됨)"`으로만 남기는 것을 권한다.

## 4. 약품도 같은 방식으로 (선택, 2단계)

재고 봇의 품목 별칭(현장에서 부르는 이름, 예: '데브리놀' → 뉴데브리놀)은 지금 재고 프로젝트의 `config/item_aliases.yaml`에 따로 있다.
약품에도 같은 API가 있으면 이 별칭을 글로벌 DB `aliases`로 옮겨 모든 앱이 같이 쓸 수 있다.

- `POST /dschemical/update`: 2.1과 같다. 허용 필드는 `name` `unit` `infoL3` `IN_PRICE` `OUT_PRICE` `OUT_PRICE1` `vendors` `active` `flgWork` `flgOut`이다. `dsids`·`infoL1`·`infoL2`는 코드 체계와 묶여 있어 제외한다.
- `POST /dschemical/alias`: 2.2와 같다. 약품 `aliases`는 문자열 배열이므로 `add: ["데브리놀"]` 형식으로 받는다.

## 5. 다 됐는지 확인할 것

1. `set`에 `memo`만 보내면 `memo`·`updatedAt`·`updatedBy`만 바뀌고 다른 필드(전화·별칭 등)는 그대로다.
2. 오래된 `expectedUpdatedAt`으로 보내면 409 `conflict`와 지금 레코드가 오고, DB는 바뀌지 않는다.
3. `set`에 `custcd`·`aliases`·`origin`을 넣으면 400이다.
4. 별칭 추가를 두 클라이언트가 동시에 보내도 둘 다 들어간다 (하나가 다른 하나를 지우지 않음).
5. 다른 거래처에 이미 있는 별칭을 더하면 409 `aliasTaken`, `force: true`면 들어간다.
6. 같은 별칭을 표기만 달리해 다시 더하면 중복으로 들어가지 않는다.
7. `origin = ecount` 거래처의 `name`을 바꾸면 `ecountDirtyFields`에 `name`이 생긴다.
8. 변경 이력에 1~7의 변경이 남고, 로그에 전화·이메일 값이 없다.
9. `EXTERNAL_API_GUIDE.md`에 6.4(부분 수정·별칭)를 추가한다. "외부 앱은 읽기와 create만" 문장을 "읽기, create, update/alias만 (전체 덮어쓰기 PUT은 웹 전용)"으로 바꾼다.

## 6. 재고 프로젝트에서 쓸 곳 (참고)

API가 생기면 재고 프로젝트에서 다음을 만든다.

- **봇:** 판매처 질문에 관리자가 거래처를 고르면 **[‘월송리’를 이 거래처 별칭으로 저장]** 버튼을 보여 준다 → `/dscustomer/alias`.
- **웹 '거래처' 메뉴(관리자):** 거래처 검색 → 정보 수정(2.1) · 별칭 추가·삭제(2.2) · 변경 이력(2.3). 409 conflict면 최신 내용을 다시 보여 준다.
- **처음 한 번:** 이카운트 기록에서 뽑은 현장 → 판매 거래처 29곳(`config/turf.yaml`)을 관리자가 검토한 뒤 별칭으로 일괄 등록한다.
- 저장하면 재고 앱의 글로벌 DB 캐시(10분)를 바로 비워 다음 메시지부터 반영한다.

---

## 7. 처리 결과 (2026-10-06, dsglobaldb_manager)

**거래처 1단계(2장) 완료 · 운영 반영.** 사용법은 `EXTERNAL_API_GUIDE.md` 6.4장.

| 요청 | 상태 |
|---|---|
| 2.1 `POST /dscustomer/update` | 완료. 요청대로 허용 목록, `expectedUpdatedAt` 조건부 `UpdateItem`, 같은 값 무시, `ecountDirtyFields` |
| 2.2 `POST /dscustomer/alias` | 완료. 읽기→조건부 쓰기 3회 재시도, 표기만 다른 중복 무시, `aliasTaken` 409 + `force` |
| 2.3 `GET /dscustomer/history` | 완료. DynamoDB `dscustomer_history`(키 `custcd` + `at`), 최근 50건, 전화·이메일은 `(변경됨)` |
| 3장 로그 | 로그에는 `custcd`·바뀐 필드 이름·`updatedBy`만 남긴다 (운영 로그로 확인) |
| 3장 인증 | **완료** — update·alias 4개 경로(거래처·약품)에 `x-api-key` 필요. 사용량 계획 `globaldb-write`, 앱별 키 `globaldb-inv`·`globaldb-quote`·`globaldb-web`. GET과 create는 아직 키 없음 |
| 4장 약품 | **완료** — `/dschemical/update`·`alias`·`history` (가이드 6.5) |
| 5장 확인 1~8 | 서버 테스트(pytest + moto) 77건, 운영 API에서 확인용 거래처로 1~8 모두 확인 후 삭제 |
| 5장 확인 9 | `EXTERNAL_API_GUIDE.md` 6.4 추가, 원칙 문장 변경 |

**요청서와 다르거나 더한 것**
- `aliasTaken`은 다른 거래처의 **별칭뿐 아니라 거래처명도** 본다. 봇이 이름으로도 찾기 때문이다. 거래처명은 `(주)`·`주식회사` 같은 법인 표기를 빼고 비교한다(`(주)새서울레저` = `새서울레저(주)`).
- API로 더한 별칭에는 `source: "local"`을 붙인다. 웹의 이카운트 엑셀 비교가 이 별칭과 `ecountDirtyFields` 항목을 이카운트 값으로 **되돌리지 않게** 고쳤다. 고치기 전에는 다음 엑셀 비교에서 지워졌을 것이다.
- `ecountDirtyFields` 확인 흐름: 웹 거래처 → [이카운트 엑셀 비교] → **[이카운트 반영 필요]** 탭. 이카운트도 같게 고쳐졌으면 [반영 완료로 표시]로 지운다(`ecountSyncedAt` 흐름과 같은 방식).
- 웹 거래처 편집 화면도 이 API를 쓴다(`updatedBy: web:<로그인 이메일>`). 별칭 추가·삭제와 변경 이력을 같은 화면에서 본다.

**재고 프로젝트에 알려둘 것**
- 거래처 1,486곳 중 **39개 이름은 서로 다른 거래처가 같은 이름을 쓴다**(예: `나은` 2곳, `(주)그린월드`/`그린월드`). 이카운트에 원래 그렇게 등록된 것이다. 봇이 이름으로 찾을 때는 여러 개가 나올 수 있으니 고르게 해야 한다.
- 이 API를 쓰기 전의 수정은 이력에 없다. `updatedAt`은 모든 거래처에 있으므로 `expectedUpdatedAt`에 `null`을 보낼 일은 지금 없다.

**추가 (2026-10-06): API 키 · 약품**
- 재고 서버에 넣을 키는 `globaldb-inv`이다. 값은 글로벌 DB 관리자에게 받아 재고 프로젝트 `.env`에 둔다(예: `GDB_API_KEY=...`). update·alias 요청에 `x-api-key` 헤더로 붙인다. 키가 없으면 HTTP 403이고, 이때는 `statusCode` 래핑이 없다.
- 약품 별칭은 문자열 목록이다(`"add": ["데브리놀"]`). `config/item_aliases.yaml`을 옮길 때 같은 이름의 다른 용량은 겹침으로 보지 않는다. 다른 제품과 겹치면 409 `aliasTaken`이다.
- 약품은 대부분 `updatedAt`이 없으므로, 처음 고칠 때는 받은 레코드 그대로 `expectedUpdatedAt: null`을 보낸다.
- 확인: 서버 테스트 95건. 운영에서 확인용 약품으로 키 없음 403, 수정, 동시 수정 409, 코드 필드 400, 별칭 겹침 409, 이력을 확인한 뒤 삭제했다.
