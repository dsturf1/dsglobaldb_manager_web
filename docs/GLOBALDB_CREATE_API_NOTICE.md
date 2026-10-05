# 글로벌 DB 변경 안내 — 약품·거래처 추가 API (2026-10-02)

> **받는 곳**: 글로벌 DB를 쓰는 프로젝트 — 견적 시스템(`quotation mg`), 글로벌 DB 텔레그램 봇, 그 밖의 외부 앱
> **보낸 곳**: `dsglobaldb_manager`
> 이 문서를 각 프로젝트 저장소의 `docs/`에 복사해 두고, 그 저장소의 Claude Code가 읽고 반영 계획을 세우면 된다.
> 전체 사용법은 `dsglobaldb_manager/docs/EXTERNAL_API_GUIDE.md` 6장·7.4장. 이 문서는 무엇이 바뀌었고 무엇을 해야 하는지만 정리한다.

---

## 1. 요약

- 약품·거래처를 **새로 추가하는 API**가 생겼다. 이제 외부 앱도 추가할 수 있다. 단, **이 API로만** 추가해야 한다.
  - `POST /dschemical/create`
  - `GET /dschemical/next-code`
  - `POST /dscustomer/create`
- **코드는 서버가 정하고, 이미 있는 코드는 절대 덮어쓰지 않는다.** 여러 앱에서 동시에 추가해도 안전하다.
- 약품은 **비슷한 이름이 있으면 바로 만들지 않고 409로 후보를 돌려준다.** 사용자가 확인하면 `confirmSimilar: true`로 다시 보낸다.
  - 이 부분은 견적 시스템 지시서(`GLOBALDB_SAFE_CREATE_API.md`)에 없던 **새 동작**이다.
- **기존 API는 바뀌지 않았다.** `GET/POST/PUT/DELETE /dschemical`, `/dscustomer`, 응답 형식, Base URL 모두 그대로다.
- 인증은 없다(기존과 같음).

---

## 2. ⚠️ 먼저 확인할 것 — 201만 기대하면 깨진다

지시서 5장의 예시 요청을 2026-10-02 운영 API에 그대로 보내면 **둘 다 201이 아니다.**

| 지시서 예시 | 실제 응답 | 이유 |
|---|---|---|
| 약품 `몬카트` `1ℓ` | **409** `reason: "similar"`, `sameUnit: true` | 같은 이름·같은 용량(A11042)이 이미 있다 |
| 거래처 법인 `bizNo: "123-45-67890"` | **422** | 사업자번호 검증번호가 틀린 번호다 |

추가 기능을 붙일 때는 **201, 409, 422, 400, 503을 모두 처리**해야 한다(3장).

---

## 3. API 계약 (바뀐 점 위주)

응답은 기존 API와 같은 래핑이다. HTTP 상태는 항상 200이고, `body`는 JSON 문자열이며, 결과는 **`statusCode`**로 판단한다.

### 3.1 `POST /dschemical/create` — 약품 추가

요청은 지시서 5장과 같다.

```json
{ "name": "신승", "unit": "1ℓ", "infoL1": "살균제", "infoL3": "중요도4",
  "IN_PRICE": 11500, "OUT_PRICE": 12075, "OUT_PRICE1": 13000, "vendors": "", "aliases": [] }
```

- 필수: `name`, `infoL1`
  - `infoL1`은 `살균제` `살충제` `제초제` `비료` `기타약재` `잔디` `기타물품` 중 하나다.
  - `infoL2`(대분류)는 서버가 정한다. 보내면 `infoL1`과 맞아야 한다.
- 무시되는 값: 보낸 `dsids`, `origin`, `createdAt`, `ecountSyncedAt`
- 선택:
  - `createdBy` (문자열, 검증 없이 저장)
  - `confirmSimilar` (아래 409를 확인한 뒤 `true`)

| statusCode | 의미 | 할 일 |
|---|---|---|
| **201** | 추가됨. `body`는 저장된 레코드 전체 | **`body.dsids`가 확정 코드.** 목록 캐시를 비우고 이 코드를 쓴다 |
| **409** `reason: "similar"` | 비슷한 약품이 있거나 같은 이름·같은 용량이 있다. **저장 안 됨** | 후보를 사용자에게 보여주고, 새 약품이 맞으면 같은 요청에 `"confirmSimilar": true`를 붙여 다시 보낸다 |
| 400 | 입력 오류 (`message`) | 메시지를 보여준다 |
| 503 | 동시 추가가 몰려 코드를 못 정함 | 잠시 후 다시 시도한다 |

**409 본문**

```json
{ "message": "비슷한 이름의 약품이 있습니다. 새 약품이 맞으면 confirmSimilar: true 로 다시 보내세요",
  "reason": "similar",
  "sameUnit": false,
  "sameName": [ { "dsids": "A17801", "unit": "250㎖" } ],
  "similar":  [ { "name": "선승", "score": 0.83, "reason": "비슷한 이름",
                  "codes": [ { "dsids": "A17802", "unit": "500㎖" } ] } ] }
```

- `similar`: 이름이 비슷한 *다른* 약품. 제품별로 묶여 있고 최대 10개다. `reason`은 아래 중 하나다.
  - `띄어쓰기·기호만 다름`
  - `이름 포함`
  - `비슷한 이름` (한글 자모 유사도 80% 이상)
  - `별칭 '…'`
- `sameName`: 이름이 똑같은 기존 약품(용량별). 다른 용량을 추가하는 것은 정상이라 이것만으로는 409가 나지 않는다.
- `sameUnit: true`: 같은 이름에 **같은 용량**까지 있다. 중복일 가능성이 크다.

**코드 규칙** (참고): 같은 이름이면 그 제품의 다음 용량 순번(`A11042` → `A11043`)을 받는다. 새 이름이면 새 일련번호를 받고 끝자리는 0이다(`A18040`). 앞 두 글자는 `infoL1`을 따른다.

### 3.2 `GET /dschemical/next-code?infoL1=&name=&unit=` — 미리보기

- 저장하지 않는다. 반환하는 `dsids`는 **예상값**이다. 최종 코드는 create 응답의 값을 쓴다.
- `name`이 있으면 `sameName`, `sameUnit`, `similar`도 같이 준다. 입력하는 동안 미리 경고를 띄울 때 쓴다.
- 지시서에 없던 `unit` 파라미터가 추가됐다(같은 용량 확인용).

### 3.3 `POST /dscustomer/create` — 거래처 추가

요청은 지시서 5장과 같다. **비슷한 이름 확인은 하지 않는다.**

| statusCode | 의미 | 할 일 |
|---|---|---|
| **201** | 추가됨. `body.custcd`가 거래처 코드 | 법인은 사업자번호 10자리, 개인은 서버가 정한 `P#####` |
| **409** | 같은 사업자번호의 거래처가 이미 있다. **덮어쓰지 않음** | `body.existing` `{custcd, name}`을 보여준다. 대개 그 거래처를 그대로 쓰면 된다 |
| **422** | 사업자번호 검증번호가 틀렸다 | 사용자에게 번호를 다시 확인받는다. 맞는 번호라고 하면 `"allowInvalidBizNo": true`를 붙여 다시 보낸다 |
| 400 | 입력 오류 (`custType`, `name` 누락, 10자리 아님, 없는 `category`) | 메시지를 보여준다 |

- 개인(`custType: "person"`)에는 **주민등록번호를 보내지 않는다.** 코드는 서버가 `P00001`부터 순서대로 정한다.
- `category`는 `골프장` `매입처` `매출처` `기타` 중 하나다. 기본값은 `기타`다.

### 3.4 새로 만든 항목의 상태

서버가 `origin: "local"`, `createdAt`, `updatedAt`을 붙인다. `ecountSyncedAt`은 없다.
- 이 항목은 **이카운트에는 아직 없는 코드**다. 견적 앱의 "이카운트 미등록" 경고 조건(`origin === 'local' && !ecountSyncedAt`)이 그대로 맞는다.
- 관리자가 웹에서 이카운트 엑셀로 등록을 확인하면 `ecountSyncedAt`이 생긴다.

---

## 4. 지시서(`GLOBALDB_SAFE_CREATE_API.md`)와 다른 점

| 지시서 | 실제 | 영향 |
|---|---|---|
| 새 create API에 인증(Cognito 또는 API 키) | **인증 없음** (사용자 결정) | 헤더를 붙일 필요가 없다. URL을 공개된 곳에 두지 말 것 |
| Cognito 풀 `us-east-1_95Qz7fdzw` (dsout_record) | 웹이 실제로 쓰는 풀은 `us-east-1_W0IaBru9e` (dsglobaldb_access) | 지금은 인증이 없어 영향 없음. 나중에 인증을 붙일 때 참고 |
| `createdBy`는 Cognito 사용자 | 요청 본문의 `createdBy`를 그대로 저장 (선택) | 견적 앱이 사용자 이름을 넣어 보내면 된다 |
| 약품 409 없음 | **비슷한 이름·같은 용량이면 409 `reason: "similar"`** | 확인 UI와 재전송(`confirmSimilar`)이 필요하다 |
| next-code는 `infoL1`, `name` | `unit` 추가, 비슷한 이름 결과도 반환 | 선택 사항 |
| 같은 이름 비교는 "공백 제거 후 일치" | 순번 계산은 **앞뒤 공백만 제거**해서 비교한다. 띄어쓰기만 다른 이름은 409(similar)로 잡는다 | 결과적으로 더 안전하다 |
| 3.4 수정 동시성(`expectedUpdatedAt`) | 이번에는 안 함 | 수정은 계속 웹에서만 한다 |

---

## 5. 프로젝트별 할 일

### 5.1 견적 시스템 (`quotation mg`)
1. 견적에서 "새 품목 추가"를 하면 `POST /dschemical/create`를 호출한다.
   - 409(similar)면 후보 목록과 함께 "그래도 새로 추가?" 확인을 띄운다. 확인하면 `confirmSimilar: true`로 다시 보낸다.
   - 201이면 `body.dsids`를 견적 줄에 쓰고, 품목 캐시를 새로 고친다(`/api/catalog/refresh`와 같은 동작).
2. "새 거래처 추가"는 `POST /dscustomer/create`를 호출한다.
   - 409면 기존 거래처(`existing`)를 선택하게 한다.
   - 422면 번호를 다시 확인받은 뒤 `allowInvalidBizNo: true`로 다시 보낸다.
3. 테스트 코드에 201·409(similar)·409(거래처)·422·400 경우를 넣는다. 위 2장의 예시 요청이 그대로 409·422 사례가 된다.
4. 기존 `PUT/POST /dschemical`, `/dscustomer`로 추가하는 코드가 있으면 **create API로 바꾼다.** 기존 API는 코드 중복 검사가 없어 덮어쓸 수 있다.

### 5.2 텔레그램 봇
1. 추가 명령(예: `/addchem 신승 1ℓ 살균제`)은 create API를 호출한다.
2. 409(similar)면 후보를 답장으로 보여주고, `[새로 추가]` `[취소]` 인라인 버튼을 단다. `[새로 추가]`를 누르면 `confirmSimilar: true`로 다시 보낸다.
3. 봇은 허용한 사용자만 추가할 수 있게 거른다. API에 인증이 없으니 봇이 마지막 관문이다.
4. 예제 코드: `EXTERNAL_API_GUIDE.md` 7.4 (`create_chemical(item, confirm)`).

### 5.3 그 밖의 외부 앱
- 읽기만 한다면 **할 일이 없다.** 기존 GET은 그대로다.

---

## 6. 운영 API로 시험할 때

- 시험용 데이터는 이름에 `__TEST__`처럼 표시를 붙이고, 끝나면 **만든 것만** 삭제한다(`DELETE /dschemical?id=`, `DELETE /dscustomer?id=`). 다른 데이터는 건드리지 않는다.
- 데이터를 만들지 않고 시험하려면:
  - 약품은 `next-code`로 미리보기를 하거나, 409가 나는 요청(예: 2장의 몬카트 1ℓ)을 쓴다.
  - 거래처는 422가 나는 번호를 쓴다.
- 문의: `dsglobaldb_manager` 관리자. 서버 코드는 `AWS/Lambda/dsglobaldbCreate/`(테스트 포함)에 있다.
