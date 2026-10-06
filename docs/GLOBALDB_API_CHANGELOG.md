# 글로벌 DB API 변경 이력 · 공유 프로젝트 안내

> **받는 곳**: 글로벌 DB API(`jyipsj28s9 … /dev`)를 쓰는 모든 프로젝트 — 견적 시스템(`quotation mg`), 재고 관리(`inv mg`), 텔레그램 봇, 그 밖의 외부 앱
> **보낸 곳**: `dsglobaldb_manager` · 최종 갱신 **2026-10-06**
> 이 문서를 각 프로젝트의 `docs/`에 복사해 두고, 그 저장소의 Claude Code가 읽고 반영할 것을 정하면 된다. 새로 바뀌면 이 문서의 맨 위에 추가한다.
> 자세한 요청·응답 형식은 `EXTERNAL_API_GUIDE.md`(같이 복사할 것). 그 문서에만 Base URL이 있다.

---

## 1. 먼저 확인할 것 (프로젝트별)

| 프로젝트 | 해야 할 일 |
|---|---|
| **읽기만 하는 앱** | 깨지는 변경은 없다. 다만 3장의 **새 필드**를 무시하도록 되어 있는지 확인한다. 특히 거래처 별칭의 `code`가 빈 문자열일 수 있다 |
| **견적 시스템** | create API를 쓴다면 409(`similar`)·422 처리가 있는지 확인한다(2026-10-02 항목). 거래처·약품 수정·별칭이 필요하면 키 `globaldb-quote`를 관리자에게 받는다 |
| **재고 관리** | 요청한 수정·별칭·이력 API가 준비됐다(2026-10-06 항목). 키 `globaldb-inv`를 관리자에게 받아 `.env`에 둔다 |
| **텔레그램 봇** | 별칭으로 찾을 때 거래처 별칭(`{name, code, source}`)과 약품 별칭(문자열)의 형식이 다르다. 같은 이름의 거래처가 여럿일 수 있다(39개 이름) |

**미리 알림**: 지금은 create API(`/…/create`)에 키가 필요 없다. 하지만 **나중에 create에도 API 키를 걸 예정**이다. 날짜는 쓰는 프로젝트와 맞춘 뒤 정한다. create를 쓰는 프로젝트는 지금 받는 키를 create 요청에도 미리 붙여 두면 그때 바꿀 것이 없다(지금 붙여도 무시되고 문제없다).

---

## 2. 지금의 API 한눈에 보기 (2026-10-06)

모든 응답은 HTTP 200 + `{statusCode, body}`이고 `body`는 JSON 문자열이다. 예외는 **API 키가 없거나 틀린 경우의 HTTP 403**뿐이다(이때는 래핑이 없다).

| 대상 | 조회 (키 없음) | 새로 추가 (키 없음) | 부분 수정 · 별칭 (**키 필요**) | 이력 (키 없음) | 전체 덮어쓰기·삭제 |
|---|---|---|---|---|---|
| 약품 | `GET /dschemical` | `POST /dschemical/create` (+ `GET /dschemical/next-code`) | `POST /dschemical/update`, `/dschemical/alias` | `GET /dschemical/history?id=` | 웹 전용 |
| 거래처 | `GET /dscustomer` | `POST /dscustomer/create` | `POST /dscustomer/update`, `/dscustomer/alias` | `GET /dscustomer/history?id=` | 웹 전용 |
| 창고 | `GET /dswarehouse` | `POST /dswarehouse/create` | (없음) | (없음) | 웹 전용 |

- **외부 앱이 쓸 수 있는 것**: 조회, create, update/alias.
- **웹 전용**: 전체 덮어쓰기 `PUT/POST /dschemical`·`/dscustomer`·`/dswarehouse`와 `DELETE`. 외부 앱은 쓰지 않는다. 덮어쓰기라 다른 수정을 지울 수 있다.
- **API 키**: `x-api-key` 헤더에 넣는다. 앱마다 따로 발급하고(`globaldb-inv`·`globaldb-quote`·`globaldb-web`), 관리자에게 받아 서버 `.env`에만 둔다. 코드·문서·커밋에 넣지 않는다. 키가 새어 나가면 관리자가 그 키만 끈다.

---

## 3. 변경 이력

### 2026-10-06 — 부분 수정 · 별칭 · 변경 이력 API, API 키

**새 API** (가이드 6.4 거래처, 6.5 약품)
- `POST /dscustomer/update`, `POST /dschemical/update`: 바꿀 필드만 보낸다.
  - `expectedUpdatedAt`(읽은 레코드의 `updatedAt`, 없으면 `null`)이 서버 값과 다르면 **409 `conflict`**와 지금 레코드(`current`)를 돌려준다.
  - 허용 목록 밖의 필드는 400이다.
- `POST /dscustomer/alias`, `POST /dschemical/alias`: 별칭을 더하고 뺀다.
  - 서버가 읽고 쓰며, 동시 수정이면 3번까지 다시 시도한다.
  - 표기만 다른 중복은 무시한다. 다른 곳과 겹치면 **409 `aliasTaken`**이고, 사용자가 확인하면 `force: true`로 다시 보낸다.
- `GET /dscustomer/history?id=`, `GET /dschemical/history?id=`: 최근 50건이다. 전화·이메일은 값 대신 `(변경됨)`으로 남는다.
- update·alias는 **API 키 필수**다. 키가 없으면 HTTP 403이다.

**데이터에 생긴 필드**
| 필드 | 대상 | 의미 |
|---|---|---|
| `updatedBy` | 거래처·약품 | update/alias로 마지막에 고친 곳. 예: `inv:a@b.com`, `web:a@b.com`, `web:엑셀비교` |
| `ecountDirtyFields` | 거래처 | 이카운트에서 온 거래처의 `name`·`ceo`·`bizType`·`bizItem`을 여기서 고쳤다는 표시. 이카운트에도 고쳐야 하는 항목이다 |
| `aliases[].source` | 거래처 | `"local"`이면 여기서(앱·웹) 붙인 별칭이다. 이런 별칭은 **`code`가 빈 문자열**일 수 있다 |
| `updatedAt` | 약품 | 수정 API로 고친 약품부터 생긴다. 대부분은 아직 없다 |

**읽는 앱이 주의할 것**
- 거래처 별칭을 `GC###` 코드로 쓰는 코드는 `code`가 비어 있는 별칭을 건너뛰어야 한다.
- 약품 별칭은 이제 앱에서도 더해진다. 현장에서 부르는 이름이 들어올 수 있다(예: 재고 봇의 `데브리놀`).

### 2026-10-05 — 창고

- `GET /dswarehouse`: 이카운트 창고 19곳. 키는 `whcd`(창고코드, `00001`처럼 앞자리 0 포함 문자열)이다.
- `POST /dswarehouse/create`: 코드는 요청에 넣는다. 코드가 겹치거나 **창고명이 겹치면 409**다.
- 약품의 `warehouse`와 방제 기본정보의 `warehouse`·`outwarehouse`는 창고를 **코드가 아니라 창고명으로** 가리킨다. 연결은 `name`으로 한다.

### 2026-10-02 — create API, 비슷한 이름 확인

- `POST /dschemical/create`, `POST /dscustomer/create`: **코드는 서버가 정하고, 이미 있는 코드는 덮어쓰지 않는다.**
  - 새로 추가할 때 기존 PUT/POST를 쓰면 덮어쓸 수 있으니 반드시 create를 쓴다.
- 약품은 비슷한 이름(띄어쓰기·포함·글자 80% 이상·별칭)이나 같은 이름+같은 용량이 있으면 **409 `similar`**와 후보를 돌려준다. 사용자가 확인하면 `confirmSimilar: true`로 다시 보낸다.
- 거래처 법인은 사업자번호가 코드다. 이미 있으면 **409 `existing`**, 검증번호가 틀리면 **422**(확인 후 `allowInvalidBizNo: true`)다. 개인은 서버가 `P#####`를 정한다.
- 새로 만든 항목은 `origin: "local"`이고 `ecountSyncedAt`이 없다. 즉 **이카운트에는 아직 없는 코드**다.

### 2026-10-01 — 거래처, 출처 필드

- `GET /dscustomer`: 이카운트 거래처 1,486곳. 개인 거래처 15곳의 코드는 주민번호를 마스킹한 값(`######-#******`)이다.
- 약품·거래처에 `origin`(`ecount`/`local`), `createdAt`, `ecountSyncedAt` 필드가 생겼다(가이드 5장).

---

## 4. 알려진 데이터 사항

- 거래처 1,486곳 중 **39개 이름은 서로 다른 거래처가 같은 이름을 쓴다**(예: `나은` 2곳, `(주)그린월드`/`그린월드`). 이름으로 찾으면 여러 개가 나올 수 있다.
- 약품 코드는 앞 두 글자가 분류다(A1 살균제 … G0 잔디). 같은 제품의 다른 용량은 끝자리만 다르다.
- 데이터는 이카운트와 실시간 연동이 아니다. 관리자가 웹에서 엑셀로 비교·반영한다.

## 5. 문의

- `dsglobaldb_manager` 관리자. 서버 코드와 테스트는 `AWS/Lambda/dsglobaldbCreate/`에 있다.
- 요청은 이 저장소 `docs/`에 요청 문서로 보내면 된다(예: `gdb-update-api-request.md`). 처리 결과는 그 문서 끝에 적는다.
