# 글로벌 DB 외부 사용 안내 — 약품 · 거래처

외부 앱과 텔레그램 봇에서 글로벌 DB의 **약품**과 **거래처** 데이터를 읽어 쓰기 위한 안내입니다.
데이터는 이 저장소의 웹(dsglobaldb_manager)에서 관리하고, 외부에서는 아래 API로 읽습니다.

> 2026-10-01 기준. 약품 658건, 거래처 1,486건.

---

## 1. 한눈에 보기

| 데이터 | API | 저장소 | 키 | 건수 · 응답 크기 |
|---|---|---|---|---|
| 약품 | `GET /dschemical` | DynamoDB `dschemicals` | `dsids` (= 이카운트 품목코드) | 658건 · 약 350KB |
| 거래처 | `GET /dscustomer` | DynamoDB `dscustomers` | `custcd` (= 이카운트 거래처코드) | 1,486건 · 약 490KB |

```
Base URL: https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev
```

- **인증 없음.** URL만 알면 누구나 읽고 쓸 수 있습니다. URL을 공개된 곳(공개 저장소, 공개 채널 메시지 등)에 올리지 마세요.
- **외부 앱·봇은 읽기(GET)만 하세요.** 추가·수정은 웹에서 합니다. 쓰기 API는 [6장](#6-쓰기-api-웹-전용-참고)에 참고로만 적었습니다.
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
| `aliases` | {code, name}[] | 별칭. 이카운트 '검색입력' 코드와 약칭 | `[{"code": "GC005", "name": "대호단양"}]` |
| `category` | string | 분류 | `골프장` `매입처` `매출처` `기타` |
| `active` | `Y`/`N` | 사용 여부 | |
| `memo` | string | 메모 | |
| `custType` | string | 구분. **웹에서 새로 만든 거래처에만** 있음 | `corp`(법인) / `person`(개인) |
| `updatedAt` | string | 마지막 수정 시각 (ISO 8601, UTC) | `2026-10-01T06:57:56.951Z` |

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

## 6. 쓰기 API (웹 전용, 참고)

외부 앱·봇에서는 쓰지 않는 것을 원칙으로 합니다. 꼭 필요하면 관리자와 먼저 협의하세요.

| API | 동작 |
|---|---|
| `POST` / `PUT /dschemical` | 약품 한 건 저장 |
| `DELETE /dschemical?id={dsids}` | 약품 삭제 |
| `POST` / `PUT /dscustomer` | 거래처 한 건(객체) 또는 여러 건(배열) 저장 |
| `DELETE /dscustomer?id={custcd}` | 거래처 삭제 |

- 저장은 **덮어쓰기**입니다. 일부 필드만 보내면 나머지 필드가 지워집니다. 반드시 GET으로 받은 레코드 전체에 바꿀 값만 고쳐서 보내세요.
- 키(`dsids` / `custcd`)가 없으면 거래처 API는 `statusCode: 400`을 돌려줍니다. 약품 API는 키를 검사하지 않습니다.

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
