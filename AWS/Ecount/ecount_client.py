"""이카운트 OpenAPI 클라이언트. Zone → 로그인 → SESSION_ID 재사용, 세션 오류 시 1회 재로그인.

출처: quotation mg/backend/app/services/ecount/client.py (2026-09-30 실서버 검증)
"""
import os
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

    @classmethod
    def from_env(cls) -> "EcountSettings":
        missing = [k for k in ("ECOUNT_COM_CODE", "ECOUNT_USER_ID", "ECOUNT_API_CERT_KEY") if not os.environ.get(k)]
        if missing:
            raise RuntimeError(f".env 에 값이 없습니다: {', '.join(missing)}")
        return cls(
            env=os.environ.get("ECOUNT_ENV", "prod"),
            com_code=os.environ["ECOUNT_COM_CODE"],
            user_id=os.environ["ECOUNT_USER_ID"],
            api_cert_key=os.environ["ECOUNT_API_CERT_KEY"],
            lan_type=os.environ.get("ECOUNT_LAN_TYPE", "ko-KR"),
        )


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
