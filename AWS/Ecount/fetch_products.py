"""이카운트 품목 전체를 받아 약품 비교용 요약 파일을 S3에 올린다.

웹(약품목록 > 이카운트 비교)은 GET /ecountproducts (Lambda dsecountProducts) 로
이 파일(s3://dsbaseinfo/ecount/products_latest.json)을 읽어
dschemicals 와 비교한다. 이카운트 실서버 키는 등록된 IP에서만 로그인되므로 사무실 PC에서 실행한다.

    python fetch_products.py            # 받아서 S3 업로드
    python fetch_products.py --no-upload  # 받아서 로컬 저장만
"""
import argparse
import json
import os
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

# Norton 등이 HTTPS를 가로채는 PC에서 SSL 오류 방지 (OS 인증서 저장소 사용)
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

import boto3

from ecount_client import EcountClient, EcountSettings

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "data"

S3_BUCKET = "dsbaseinfo"
S3_KEY = "ecount/products_latest.json"
AWS_PROFILE = "default"

# 약품(dschemicals) 코드: A(농약)·B(비료)·C(기타약재)·G(잔디)로 시작하는 품목만 비교 대상
PREFIXES = ("A", "B", "C", "G")
SUMMARY_FIELDS = ("PROD_CD", "PROD_DES", "SIZE_DES", "UNIT", "PROD_TYPE", "CLASS_CD", "IN_PRICE")
PRICE_FIELDS = ("IN_PRICE",)


def load_dotenv(path: Path) -> None:
    """KEY=VALUE 형식 .env 를 os.environ 에 넣는다 (이미 있는 값은 유지)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def to_number(value) -> int | float:
    try:
        d = Decimal(str(value or "0"))
    except InvalidOperation:
        return 0
    return int(d) if d == d.to_integral_value() else float(d)


def summarize(items: list[dict]) -> list[dict]:
    rows = []
    for item in items:
        code = (item.get("PROD_CD") or "").strip()
        if not code.startswith(PREFIXES):
            continue
        row = {f: (item.get(f) or "").strip() for f in SUMMARY_FIELDS}
        for f in PRICE_FIELDS:
            row[f] = to_number(item.get(f))
        rows.append(row)
    return sorted(rows, key=lambda r: r["PROD_CD"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-upload", action="store_true", help="S3에 올리지 않고 로컬 저장만")
    args = parser.parse_args()

    load_dotenv(HERE / ".env")
    client = EcountClient(EcountSettings.from_env())
    items, resp = client.get_products()
    data = resp.get("Data") or {}

    fetched_at = datetime.now().astimezone().isoformat(timespec="seconds")
    rows = summarize(items)
    payload = {
        "fetched_at": fetched_at,
        "total_cnt": len(items),
        "prefixes": list(PREFIXES),
        "quantity_info": data.get("QUANTITY_INFO", ""),
        "items": rows,
        # 모든 품목코드 → 품목명 (웹에서 '여기서 만든 약품'의 이카운트 등록 여부·코드 충돌 확인용)
        "all_codes": {(i.get("PROD_CD") or "").strip(): (i.get("PROD_DES") or "").strip() for i in items},
    }
    print(f"이카운트 품목 {len(items)}건 (TotalCnt={data.get('TotalCnt')}) → 비교 대상 {len(rows)}건")
    print(f"호출 한도: {payload['quantity_info']}")

    # 원본은 로컬에만 보관 (구매처 등 포함, gitignore 대상)
    DATA_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    raw_path = DATA_DIR / f"products_raw_{stamp}.json"
    raw_path.write_text(json.dumps({"fetched_at": fetched_at, "items": items}, ensure_ascii=False), encoding="utf-8")
    (DATA_DIR / "products_latest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"로컬 저장: {raw_path.name}, products_latest.json")

    if args.no_upload:
        return
    s3 = boto3.Session(profile_name=AWS_PROFILE).client("s3")
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=S3_KEY,
        Body=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        ContentType="application/json; charset=utf-8",
        CacheControl="no-cache",
    )
    print(f"S3 업로드: s3://{S3_BUCKET}/{S3_KEY}")


if __name__ == "__main__":
    main()
