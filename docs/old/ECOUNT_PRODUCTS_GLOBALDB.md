# 이카운트 품목 → 글로벌 DB 연동 구현 지시서

> 이 문서는 **`dsglobaldb_manager` 저장소에서 Claude Code가 읽고 구현**하기 위한 문서다.
> 출처: `quotation mg` 프로젝트(로컬)에서 2026-09-30에 이카운트 OpenAPI 품목 조회를 실제로 검증한 결과.
> 여기 적힌 API 동작은 **실서버에서 확인한 사실**이고, "확인 필요"라고 표시한 것만 추측이다.

---

## 0. Claude Code에게 — 먼저 할 일

1. **이 저장소의 구조를 먼저 읽고 기존 방식을 따른다.** 아래 설계(저장 위치, API 경로, 화면)는 제안일 뿐이다.
   - 백엔드 배포 방식(SAM/CDK/Serverless, Lambda 구성), 데이터 저장소(S3/DynamoDB 등), 인증(Cognito 그룹), 프론트 라우팅·API 모듈·표(Handsontable) 사용 방식을 확인한다.
   - 이미 "품목"에 해당하는 데이터(테이블, S3 파일, 화면)가 있는지 확인한다. **있으면 새로 만들지 말고 거기에 이카운트 데이터를 연결하는 방안**을 제안한다.
2. 확인한 구조를 바탕으로 **구현 계획을 짧게 사용자에게 보여주고 승인받은 뒤** 코드를 쓴다. 특히 6장의 "결정 필요" 항목은 반드시 물어본다.
3. 단계별로 진행하고, 각 단계의 완료 조건을 확인한 뒤 멈추고 보고한다.

---

## 1. 목표

이카운트 ERP의 **품목 전체**를 글로벌 DB로 가져와(동기화) 웹에서 조회·검색할 수 있게 한다.

- 동기화: 웹의 버튼으로 수동 실행 (+ 나중에 야간 자동 실행)
- 조회: 품목 목록(검색), 품목 상세(이카운트 원본 필드 전체)
- 거래처는 **이번 범위가 아니다.** 이카운트 OpenAPI에 거래처 *목록 조회* API가 보이지 않는다(등록 API만 확인됨).

---

## 2. 이카운트 OpenAPI — 검증된 사실

### 2.1 인증 흐름

| 순서 | 호출 | 요청 본문 | 응답에서 쓸 값 |
|---|---|---|---|
| 1 | `POST https://oapi.ecount.com/OAPI/V2/Zone` | `{"COM_CODE"}` | `Data.ZONE` (우리 회사: `BC`) |
| 2 | `POST https://oapi{ZONE}.ecount.com/OAPI/V2/OAPILogin` | `{"COM_CODE","USER_ID","API_CERT_KEY","LAN_TYPE":"ko-KR","ZONE"}` | `Data.Datas.SESSION_ID` |
| 3 | `POST https://oapi{ZONE}.ecount.com/OAPI/V2/InventoryBasic/GetBasicProductsList?SESSION_ID={id}` | `{}` | `Data.Result` (품목 배열) |

- 도메인: 실서버 키는 `oapi`, 테스트 키는 `sboapi`. **지금 가진 키는 실서버 키**다.
- 로그인 성공 시 `Status=200`, `Data.Code="00"`.
- 오류 판정: 최상위 `Status != 200` 이거나 `Error`가 있으면 실패. 로그인 응답의 `Data.Code`도 확인한다.
- 세션 만료 시 오류 코드는 **아직 확인 못 함** → 지금은 오류 메시지에 "세션"/"session"이 있으면 다시 로그인해서 1회 재시도한다.

### 2.2 품목 조회 응답

- **본문 `{}` 한 번 호출로 전체가 온다.** 페이지 처리 불필요. 2026-09-30 기준 **1,376건**, `Data.TotalCnt`와 일치.
- `Data.QUANTITY_INFO`: 호출 한도 사용량 문자열. 예: `"시간당 연속 오류 제한 건수 : 0/30건, 1일 허용량 : 5/5000건"`
  - **하루 5,000회, 시간당 연속 오류 30회 제한.** 오류가 반복되면 막히므로 재시도는 짧게, 실패 시 바로 멈춘다.
- 모든 값은 대부분 **문자열**이다. 금액은 `"0.0000000000"` 같은 소수 문자열 → `Decimal`로 변환한다(float 금지).
- 품목마다 86개 필드. 주요 필드:

| 필드 | 의미 | 비고 |
|---|---|---|
| `PROD_CD` | 품목코드 | **고유키** (1,376건 모두 고유) |
| `PROD_DES` | 품목명 | |
| `SIZE_DES` | 규격 | |
| `UNIT` | 단위 | 비어 있는 경우 많음 |
| `PROD_TYPE` | 품목구분 코드 | 0 원재료, 1 제품, 2 반제품, 3 상품, 4 부재료, 7 무형상품 (**매핑 확인 필요**). 분포: 1=825, 3=400, 0=132, 7=19 |
| `CLASS_CD`, `CLASS_CD2`, `CLASS_CD3` | 그룹1~3 | |
| `IN_PRICE` | 입고단가 | 0보다 큰 품목 273건 |
| `OUT_PRICE`, `OUT_PRICE1`~`10` | 출고단가 / 단가1~10 | **현재 OUT_PRICE는 전부 0** — 판가는 이카운트에 관리되지 않는 것으로 보임 |
| `CUST` | 구매처 | |
| `REMARKS`, `REMARKS_WIN` | 적요, 검색창내용 | |
| `BAR_CODE`, `VAT_YN`, `TAX`, `SAFE_QTY`, `MIN_QTY` … | 기타 | 원본(raw)으로 보관 |

- 전체 필드 목록: `PROD_CD, PROD_DES, SIZE_FLAG, SIZE_DES, UNIT, PROD_TYPE, SET_FLAG, BAL_FLAG, WH_CD, IN_PRICE, SIZE_CD, IN_PRICE_VAT, REMARKS_WIN, CLASS_CD, CLASS_CD2, CLASS_CD3, BAR_CODE, VAT_YN, TAX, VAT_RATE_BY_BASE_YN, VAT_RATE_BY, CS_FLAG, REMARKS, INSPECT_TYPE_CD, INSPECT_STATUS, SAMPLE_PERCENT, IN_TERM, MIN_QTY, CUST, EXCH_RATE, DENO_RATE, OUT_PRICE, OUT_PRICE1~10, OUT_PRICE_VAT, OUT_PRICE1~10_VAT_YN, OUTSIDE_PRICE, OUTSIDE_PRICE_VAT, LABOR_WEIGHT, EXPENSES_WEIGHT, MATERIAL_COST, EXPENSE_COST, LABOR_COST, OUT_COST, CONT1~6, NO_USER1~10, SERIAL_TYPE, PROD_SELL_TYPE, PROD_WHMOVE_TYPE, QC_BUY_TYPE, QC_YN, SAFE_QTY, CSORD_C0001, CSORD_TEXT, CSORD_C0003`
- **사용중단 여부 필드가 없다.** 응답에서 사라진 품목을 "비활성"으로 처리하는 방식으로 판단한다(이카운트에서 사용중단 품목이 응답에 빠지는지는 **확인 필요**).

### 2.3 반드시 알아야 할 제약 — IP 제한 (가장 중요)

- 실서버 키는 **이카운트에 등록된 공인 IP에서만 로그인**된다. 미등록 IP면 로그인 실패(Code=205).
- **AWS Lambda는 기본적으로 나가는 IP가 고정되지 않는다.** 글로벌 DB 백엔드가 Lambda라면 그대로는 동기화가 안 된다. 방안:

| 방안 | 내용 | 비용·장단점 |
|---|---|---|
| A. VPC + NAT Gateway + Elastic IP | 동기화 Lambda만 VPC에 넣고 고정 IP로 나감. 그 IP를 이카운트에 등록 | NAT Gateway 월 약 $35 + 트래픽. 구조는 깔끔 |
| B. 고정 IP 서버에서 동기화 | Lightsail/EC2(고정 IP)나 사무실 PC에서 동기화 스크립트를 돌려 결과를 S3/DB에 올림. 웹은 그 결과만 읽음 | 저렴. 웹의 "동기화 버튼"은 서버에 작업 요청하는 식으로 바꿔야 함 |
| C. 1차 임시: 로컬에서 동기화 → 업로드 | 사무실 PC에서 스크립트 실행 → S3/DB로 업로드. 웹은 조회만 | 가장 빠름. 자동화 없음 |

→ **결정 필요(6장).** 결정 전에는 C로 시작해 조회 화면부터 만들고, 동기화 실행 위치만 나중에 바꿀 수 있게 "가져오기"와 "저장"을 분리한다.

### 2.4 기타 환경 이슈

- 사용자 PC는 Norton이 HTTPS를 가로챈다. 로컬에서 Python 실행 시 SSL 오류가 나면 `truststore.inject_into_ssl()`을 앱 시작 시 호출한다(Lambda에서는 불필요하지만 넣어도 무해).
- 인증 정보(`ECOUNT_COM_CODE`, `ECOUNT_USER_ID`, `ECOUNT_API_CERT_KEY`)는 **코드·채팅·커밋에 남기지 않는다.** 로컬은 `.env`, AWS는 SSM Parameter Store(SecureString) 또는 Secrets Manager. 이 저장소가 이미 쓰는 방식이 있으면 그걸 따른다.

---

## 3. 검증된 클라이언트 코드 (그대로 옮겨 쓸 것)

`quotation mg/backend/app/services/ecount/client.py`에서 동작 확인한 코드다. 설정 객체만 이 저장소 방식에 맞춘다.

```python
"""이카운트 OpenAPI 클라이언트. Zone → 로그인 → SESSION_ID 재사용, 세션 오류 시 1회 재로그인."""
import time
from dataclasses import dataclass

import requests

ZONE_PATH = "OAPI/V2/Zone"
LOGIN_PATH = "OAPI/V2/OAPILogin"
PRODUCTS_PATH = "OAPI/V2/InventoryBasic/GetBasicProductsList"


@dataclass(frozen=True)
class EcountSettings:
    env: str           # test = sboapi (테스트 키) / prod = oapi (실서버 키)
    com_code: str
    user_id: str
    api_cert_key: str
    lan_type: str = "ko-KR"


class EcountError(Exception):
    def __init__(self, message: str, response: dict | None = None):
        super().__init__(message)
        self.response = response


def _error_message(body: dict) -> str | None:
    status = str(body.get("Status", ""))
    err = body.get("Error")
    if status and status != "200":
        msg = (err or {}).get("Message") if isinstance(err, dict) else err
        return f"Status={status} {msg or ''}".strip()
    if err:
        return err.get("Message") if isinstance(err, dict) else str(err)
    return None


class EcountClient:
    def __init__(self, settings: EcountSettings, *, timeout: float = 30, max_retries: int = 3,
                 min_interval: float = 1.0, http: requests.Session | None = None):
        self.s = settings
        self.timeout = timeout
        self.max_retries = max_retries
        self.min_interval = min_interval
        self.http = http or requests.Session()
        self.zone: str | None = None
        self.session_id: str | None = None
        self._last_call = 0.0

    @property
    def _prefix(self) -> str:
        return "sboapi" if self.s.env == "test" else "oapi"

    def _post(self, url: str, body: dict, step: str) -> dict:
        """POST + 지수 backoff 재시도 (네트워크 오류, 5xx, 429)."""
        for attempt in range(self.max_retries + 1):
            wait = self.min_interval - (time.monotonic() - self._last_call)
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()
            try:
                r = self.http.post(url, json=body, timeout=self.timeout)
                if r.status_code == 429 or r.status_code >= 500:
                    raise requests.HTTPError(f"HTTP {r.status_code}", response=r)
                r.raise_for_status()
                return r.json()
            except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as e:
                retryable = not isinstance(e, requests.HTTPError) or (
                    e.response is not None and (e.response.status_code == 429 or e.response.status_code >= 500))
                if not retryable or attempt == self.max_retries:
                    raise EcountError(f"{step} 호출 실패: {e}") from e
                time.sleep(2 ** attempt)
        raise AssertionError("unreachable")

    def fetch_zone(self) -> str:
        body = self._post(f"https://{self._prefix}.ecount.com/{ZONE_PATH}", {"COM_CODE": self.s.com_code}, "zone")
        if msg := _error_message(body):
            raise EcountError(f"Zone 조회 실패: {msg}", body)
        zone = (body.get("Data") or {}).get("ZONE")
        if not zone:
            raise EcountError("Zone 응답에 ZONE 이 없습니다", body)
        self.zone = zone
        return zone

    def login(self) -> str:
        if not self.zone:
            self.fetch_zone()
        body = self._post(
            f"https://{self._prefix}{self.zone}.ecount.com/{LOGIN_PATH}",
            {"COM_CODE": self.s.com_code, "USER_ID": self.s.user_id, "API_CERT_KEY": self.s.api_cert_key,
             "LAN_TYPE": self.s.lan_type, "ZONE": self.zone},
            "login",
        )
        if msg := _error_message(body):
            raise EcountError(f"로그인 실패: {msg}", body)
        data = body.get("Data") or {}
        session_id = (data.get("Datas") or {}).get("SESSION_ID")
        if not session_id:
            raise EcountError(f"로그인 응답에 SESSION_ID 가 없습니다 (Code={data.get('Code')} {data.get('Message', '')})", body)
        self.session_id = session_id
        return session_id

    def call(self, path: str, body: dict, step: str) -> dict:
        for attempt in range(2):
            if not self.session_id:
                self.login()
            url = f"https://{self._prefix}{self.zone}.ecount.com/{path}?SESSION_ID={self.session_id}"
            resp = self._post(url, body, step)
            msg = _error_message(resp)
            if not msg:
                return resp
            if attempt == 0 and ("세션" in msg or "session" in msg.lower()):  # TODO: 실제 만료 코드로 좁히기
                self.session_id = None
                continue
            raise EcountError(f"{step} 실패: {msg}", resp)
        raise AssertionError("unreachable")

    def get_products(self, body: dict | None = None) -> tuple[list[dict], dict]:
        """품목 조회. (품목 목록, 원본 응답)."""
        resp = self.call(PRODUCTS_PATH, body or {}, "products")
        data = resp.get("Data") or {}
        rows = data.get("Result")
        if rows is None:
            rows = data.get("Datas")
        if not isinstance(rows, list):
            raise EcountError("품목 응답에서 목록(Data.Result)을 찾지 못했습니다", resp)
        return rows, resp
```

- `requests` 외 의존성 없음. Lambda 1회 실행으로 Zone+로그인+조회 3회 호출, 수 초 안에 끝난다.

---

## 4. 데이터 설계 (제안 — 저장소 방식에 맞춰 조정)

핵심 원칙: **이카운트 원본과 글로벌 DB에서 직접 관리하는 값을 분리한다.** 동기화가 사용자 입력을 덮어쓰면 안 된다.

### 4.1 DynamoDB를 쓴다면

| PK | SK | 내용 | 쓰는 주체 |
|---|---|---|---|
| `ITEM#{PROD_CD}` | `ECOUNT` | name, spec, unit, prod_type, class_cd1~3, price_in, price_out, is_active, raw(원본 전체 map), synced_at, last_seen_run | **동기화만** |
| `ITEM#{PROD_CD}` | `EXT` | 글로벌 DB에서 관리하는 값(예: 추천판가, 마진율, 메모) | **사용자만** |
| `META` | `SYNC#items` | 마지막 실행 상태, 시작/종료 시각, 생성/갱신/비활성 건수, 오류 | 동기화 |

- 금액은 `Decimal`. 시각은 ISO8601 UTC.
- 동기화는 `SK=ECOUNT`만 BatchWrite한다. `EXT`에는 절대 쓰지 않는다.

### 4.2 S3를 쓴다면

- `ecount/products/latest.json` (+ `ecount/products/{yyyymmdd_HHMMSS}.json` 이력)
- 형식(현재 로컬에서 쓰는 것과 동일):
  ```json
  {"fetched_at": "2026-09-30T23:15:47-04:00", "total_cnt": 1376,
   "quantity_info": "…1일 허용량 : 5/5000건", "items": [ {원본 품목}, … ]}
  ```
- 1,376건 원본 JSON은 약 2~3MB. 웹은 Lambda가 요약 필드만 추려서 내려주거나, gzip 응답을 쓴다.
- 사용자 관리 값은 별도 파일/테이블로 분리한다.

### 4.3 동기화 규칙 (공통)

1. 이카운트에서 전체를 받는다(`get_products()`).
2. **안전장치**: 0건이거나 기존 활성 건수보다 30%(설정값) 넘게 줄면 4번의 비활성 처리를 건너뛰고 경고를 기록한다. API 오류로 전체 품목이 비활성화되는 사고를 막기 위해서다.
3. 받은 품목은 upsert, `last_seen_run`을 이번 실행 ID로 갱신.
4. 이번에 안 보인 기존 품목은 삭제하지 말고 `is_active=false`.
5. 실행 결과(건수, 소요시간, `quantity_info`, 오류)를 기록한다.
6. 동시에 두 번 돌지 않게 잠금(조건부 쓰기 등)을 둔다.
7. 두 번 연속 실행해도 건수가 같아야 한다(멱등).

---

## 5. 구현 단계

### Step 1 — 클라이언트 + 수동 실행 스크립트
- 3장 코드를 이 저장소의 백엔드 구조에 넣는다. 설정은 환경변수/SSM에서 읽는다.
- 로컬 실행 스크립트: 품목 전체를 받아 건수와 `quantity_info`를 출력하고 원본 JSON을 파일로 저장(테스트 데이터용, gitignore).
- **완료 조건**: 등록된 IP의 PC에서 실행해 1,376건 내외가 나온다.

### Step 2 — 매핑 + 저장
- 원본 → 4장 스키마 매핑 함수(금액 `Decimal`, 품목구분 코드 → 이름).
- 저장소(DynamoDB 또는 S3) 쓰기, 4.3 규칙 적용.
- **테스트**: Step 1의 원본 JSON으로 매핑 단위 테스트, 이카운트 호출은 mock. 사용자 관리 값(EXT)이 동기화 후에도 남는지 테스트.

### Step 3 — API
- 기존 API 스타일에 맞춰:
  - `POST /ecount/products/sync` — 동기화 실행 (admin 그룹만)
  - `GET  /ecount/products/sync-status` — 마지막 실행 결과
  - `GET  /products` — 활성 품목 목록 (요약 필드)
  - `GET  /products/{code}` — 상세 (raw 포함)
- 동기화를 Lambda에서 돌릴 수 없는 동안(2.3)은 sync 엔드포인트를 만들지 않거나 "업로드" 엔드포인트로 대체한다.

### Step 4 — 화면
- 기존 레이아웃·스타일(Tailwind/DaisyUI, Handsontable)을 그대로 쓴다.
- **품목 목록**: 검색(코드·품명·규격, 초성 검색이 있으면 좋음), 품목구분·그룹 필터, 열: 코드·품명·규격·단위·품목구분·입고단가. 행 클릭 → 원본 필드 전체.
- **동기화 관리**(admin): 동기화 버튼, 실행 중 표시, 마지막 성공 시각, 생성/갱신/비활성 건수, 호출 한도 사용량.
- 엑셀 다운로드가 기존 화면에 있으면 동일하게 제공.
- **완료 조건**: 브라우저에서 동기화(또는 업로드) → 목록 갱신 → 검색까지 동작.

### Step 5 — 자동 실행 (2.3 결정 후)
- EventBridge Scheduler로 야간 1회. 실패 시 알림(기존 알림 수단 확인).

---

## 6. 결정 필요 — 구현 전에 사용자에게 물어볼 것

1. **동기화 실행 위치** (2.3의 A/B/C). 고정 IP 확보 전까지 C로 시작해도 되는지.
2. **저장 위치**: 글로벌 DB의 기존 저장소(DynamoDB 테이블 / S3)에 넣을지, 기존 "품목" 데이터와 어떻게 연결할지(코드 매칭 기준).
3. **판가**: 이카운트 `OUT_PRICE`가 모두 0이다. 판가를 글로벌 DB에서 관리할지(EXT), 이카운트에 입력할지.
4. **품목구분 코드 매핑**(0/1/3/7)과 그룹(CLASS_CD) 이름 — 이카운트 화면과 대조.
5. **권한**: 동기화 버튼은 admin만? 조회는 전원?
6. `quotation mg`(견적 시스템)이 나중에 이 품목 데이터를 **글로벌 DB에서 읽어 쓰게 할지** — 그렇다면 조회 API를 다른 서비스가 호출할 수 있게 인증 방식을 정한다.

---

## 7. 참고 — 원래 프로젝트 파일 (`D:\dsoffice automation\quotation mg`)

| 파일 | 내용 |
|---|---|
| `backend/app/services/ecount/client.py` | 3장 클라이언트 원본 |
| `backend/app/services/ecount/products.py` | JSON 저장, pandas 변환, 한글 열 이름 매핑 |
| `backend/data/products/products_latest.json` | 실제 응답(1,376건) — 테스트 데이터로 복사해 쓸 수 있음 (gitignore 대상) |
| `notebooks/ecount_products.ipynb` | 설정 → Zone → 로그인 → 조회 → 저장 → 엑셀 전 과정 |
| `docs/PLAN.md` 3.1, 4장 | 품목 테이블 설계, 동기화 안전장치 원안 |
