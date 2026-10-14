"""글로벌 DB 안전한 추가 API (docs/GLOBALDB_SAFE_CREATE_API.md).

API Gateway jyipsj28s9 (패스스루 매핑 템플릿, 인증 없음)
    POST /dschemical/create      약품 새로 추가. 코드는 서버가 정한다
    GET  /dschemical/next-code   다음 약품 코드 미리보기 (?infoL1=&name=). 확정 아님
    POST /dscustomer/create      거래처 새로 추가. 법인=사업자번호(중복 409), 개인=P##### 순번
    POST /dswarehouse/create     창고 새로 추가. 창고코드는 요청값(중복 409), 같은 창고명도 409
    POST /dscustomer/update      거래처 부분 수정 (허용 필드만, expectedUpdatedAt 동시 수정 확인, 이력)
    POST /dscustomer/alias       거래처 별칭 추가·삭제 (다른 거래처와 겹치면 409, 재시도, 이력)
    GET  /dscustomer/history     거래처 변경 이력 (?id=, 최근 50건)
    POST /dschemical/update      약품 부분 수정 (위와 같은 규칙)
    POST /dschemical/alias       약품 별칭 추가·삭제 (문자열 별칭)
    GET  /dschemical/history     약품 변경 이력
    update/alias 는 API 키(x-api-key) 필요 — API Gateway 사용량 계획 'globaldb-write'
    (docs/gdb-update-api-request.md)

등록 요청 (docs/gdb-request-registration-queue.md 4장)
    create 는 등록 요청이다: regStatus · ecountStatus · regRequest(app 은 API 키로 정함) 를 붙인다.
    거래처는 증빙(evidence)이 조건을 모두 채우면 바로 등록(regStatus=approved), 아니면 requested.
    POST /dscustomer/evidence-upload   증빙 파일 올릴 주소 (S3 presigned PUT, 10분)          — 키 필요
    GET  /regrequests                  등록 요청 목록 (?pending=&kind=&app=&changedSince=)  — 키 필요
    POST /dschemical/review            (닫힘) 외부 앱 키는 모두 403 — 승인은 글로벌 DB 봇·웹에서만
    POST /dscustomer/review
    GET  /regreview                    웹 로그인 사람이 승인자인지 (Cognito 권한 부여자)
    POST /regreview                    웹 승인 — 글로벌 DB 슈퍼관리자(GDB_OWNER_EMAILS)만     (Cognito 권한 부여자)
    (4차) 글로벌 DB 웹(app=web)에서 만든 것은 승인 없이 확정. 승인 대기가 생기거나 결정이 나면 봇 Lambda
    (GDB_BOT_FUNCTION)를 비동기로 불러 슈퍼관리자 카드를 보내거나 고친다.
    /internal/*  봇 Lambda 가 이 Lambda 를 직접 호출할 때만 (API Gateway 에 없는 경로라 밖에서는 못 부름)

기존 /dschemical, /dscustomer 의 GET/POST/PUT/DELETE 는 그대로 두고, 추가만 이 Lambda 가 맡는다.
모든 쓰기는 attribute_not_exists 조건부 put 이라 기존 레코드를 덮어쓰지 않는다.

약품은 비슷한 이름(오타·띄어쓰기 차이·포함·별칭)이나 같은 이름·같은 용량이 있으면 409(reason=similar)로
후보를 돌려주고, 사용자가 확인한 뒤 confirmSimilar: true 로 다시 보내야 만든다.
"""
import difflib
import hashlib
import json
import os
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.config import Config
from botocore.exceptions import ClientError

CHEMICAL_TABLE = 'dschemicals'
CUSTOMER_TABLE = 'dscustomers'
WAREHOUSE_TABLE = 'dswarehouses'
CUSTOMER_HISTORY_TABLE = 'dscustomer_history'   # 키 custcd + at
CHEMICAL_HISTORY_TABLE = 'dschemical_history'   # 키 dsids + at
ALIAS_MAX_LEN = 40
ALIAS_MAX_ITEMS = 20
ALIAS_RETRY = 3
HISTORY_LIMIT = 50
WAREHOUSE_TYPES = ('창고', '공장', '외주')
WAREHOUSE_TEXT_FIELDS = ('process', 'outCust', 'site', 'memo', 'createdBy')
ECOUNT_BUCKET = 'dsbaseinfo'
ECOUNT_KEY = 'ecount/products_latest.json'   # AWS/Ecount/fetch_products.py 가 올리는 파일 (all_codes)
MAX_RETRY = 5
SIMILAR_THRESHOLD = 0.8      # 한글 자모 단위 유사도 (신승/선승 = 0.83)
SIMILAR_LIMIT = 10           # 돌려주는 비슷한 제품 수

# 중분류 → (코드 앞 두 글자, 대분류). AddChemicalDialog 의 규칙과 같다
CHEMICAL_CLASSES = {
    '살균제': ('A1', '농약'),
    '살충제': ('A2', '농약'),
    '제초제': ('A3', '농약'),
    '비료': ('B0', '비료'),
    '기타약재': ('C0', '기타약재'),
    '잔디': ('G0', '잔디'),
    '기타물품': ('D0', '기타물품'),
}
CUSTOMER_CATEGORIES = ('골프장', '매입처', '매출처', '잔디농장', '기타')
YN_FIELDS = ('active', 'flgWork', 'flgOut')
PRICE_FIELDS = ('IN_PRICE', 'OUT_PRICE', 'OUT_PRICE1')
CHEMICAL_TEXT_FIELDS = ('unit', 'infoL3', 'vendors', 'type', 'createdBy')
CUSTOMER_TEXT_FIELDS = ('ceo', 'bizType', 'bizItem', 'tel', 'email', 'memo', 'createdBy')

# 등록 요청
EVIDENCE_BUCKET = 'dsbaseinfo'
EVIDENCE_PREFIX = 'evidence/customers/'          # + fileKey (<yyyy>/<32자리>.<확장자>), 수명주기 5년
EVIDENCE_DOC_TYPES = ('사업자등록증', '세금계산서', '영수증', '견적서', '거래명세서')
EVIDENCE_CONTENT_TYPES = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp',
                          'application/pdf': 'pdf'}
EVIDENCE_EXTRACTED_FIELDS = ('bizNo', 'name', 'ceo', 'bizType', 'bizItem', 'address', 'tel', 'email')
FILE_KEY_RE = re.compile(r'\d{4}/[0-9a-f]{32}\.(?:' + '|'.join(EVIDENCE_CONTENT_TYPES.values()) + ')')
UPLOAD_URL_SECONDS = 600
VIEW_URL_SECONDS = 3600
REQUEST_FIELDS = ('channel', 'by', 'byId', 'note', 'ref')
REQUEST_CHANNELS = ('telegram', 'web')
REQUEST_TEXT_MAX = 300
WEB_DECISION_BY = '글로벌 DB 웹'                 # 웹에서 만든 것은 승인 없이 확정 (4차)
REVIEW_DECISIONS = ('approve', 'reject', 'exclude')

_resources = {}


def _table(name):
    if name not in _resources:
        _resources[name] = boto3.resource('dynamodb').Table(name)
    return _resources[name]


class ApiError(Exception):
    def __init__(self, status, message, **extra):
        super().__init__(message)
        self.status = status
        self.body = {'message': message, **extra}


def respond(status, body):
    return {"statusCode": status, "body": json.dumps(body, default=_json_default, ensure_ascii=False)}


def _json_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    raise TypeError


def _now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def lambda_handler(event, context):
    method = event['context']['http-method']
    path = event['context'].get('resource-path', '')
    try:
        if method == 'POST' and path == '/dschemical/create':
            return respond(201, create_chemical(event.get('body-json') or {}, app_of(event)))
        if method == 'GET' and path == '/dschemical/next-code':
            query = event.get('params', {}).get('querystring', {})
            return respond(200, preview_chemical_code(query))
        if method == 'POST' and path == '/dscustomer/create':
            return respond(201, create_customer(event.get('body-json') or {}, app_of(event)))
        if method == 'POST' and path == '/dscustomer/evidence-upload':
            return respond(200, evidence_upload(event.get('body-json') or {}, _required_app(event)))
        if method == 'GET' and path == '/regrequests':
            _required_app(event)
            return respond(200, list_requests(event.get('params', {}).get('querystring', {})))
        if method == 'POST' and path == '/dswarehouse/create':
            return respond(201, create_warehouse(event.get('body-json') or {}))
        prefix, _, action = path.strip('/').partition('/')
        ent = ENTITIES.get(prefix)
        if ent and method == 'POST' and action == 'update':
            return respond(200, update_record(ent, event.get('body-json') or {}))
        if ent and method == 'POST' and action == 'alias':
            return respond(200, update_aliases(ent, event.get('body-json') or {}))
        if ent and method == 'POST' and action == 'review':
            return respond(200, review_record(ent, event.get('body-json') or {}, _required_app(event)))
        if path == '/regreview':
            return respond(200, web_review(method, event))
        if path == '/gdbsettings':
            return respond(200, web_settings(method, event))
        if path.startswith('/internal/'):
            return respond(200, internal(path, event.get('body-json') or {}))
        if ent and method == 'GET' and action == 'history':
            query = event.get('params', {}).get('querystring', {})
            return respond(200, record_history(ent, query.get('id') or ''))
        return respond(405, {'message': f'Method not allowed: {method} {path}'})
    except ApiError as e:
        return respond(e.status, e.body)
    except Exception as e:  # noqa: BLE001 — 기존 Lambda 와 같은 오류 응답 형식
        return respond(500, {'message': str(e)})


# ---------------------------------------------------------------- 공통

def _scan_all(table, projection, names):
    items, kwargs = [], {'ProjectionExpression': projection, 'ExpressionAttributeNames': names}
    while True:
        response = table.scan(**kwargs)
        items.extend(response.get('Items', []))
        if 'LastEvaluatedKey' not in response:
            return items
        kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']


def _text(body, field):
    value = body.get(field, '')
    return value.strip() if isinstance(value, str) else str(value)


def _put_new(table, key, item):
    """조건부 put. 같은 키가 있으면 False (덮어쓰지 않음)."""
    try:
        table.put_item(Item=item, ConditionExpression='attribute_not_exists(#k)', ExpressionAttributeNames={'#k': key})
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return False
        raise


# ---------------------------------------------------------------- 약품

def _ecount_codes():
    """이카운트 전체 품목코드. 파일이 없거나 못 읽으면 빈 집합 (DB 코드만으로 계산)."""
    try:
        obj = boto3.client('s3').get_object(Bucket=ECOUNT_BUCKET, Key=ECOUNT_KEY)
        return set(json.loads(obj['Body'].read()).get('all_codes', {}))
    except Exception as e:  # noqa: BLE001
        print(f'이카운트 코드 파일을 읽지 못함 ({e}) — DB 코드만으로 계산')
        return set()


def _seq(code):
    """코드의 제품 일련번호 (끝에서 4~2번째 자리). 형식이 다르면 None."""
    return int(code[-4:-1]) if re.search(r'\d{4}$', code) else None


def next_chemical_code(infoL1, name, chemicals, taken=frozenset()):
    """웹 AddChemicalDialog.getPreviewCode 와 같은 규칙으로 다음 코드를 정한다.

    - 같은 이름(앞뒤 공백 제거 후 일치)이 있으면: 그 이름 코드들의 뒤 4자리 최대값 + 1 (끝자리 = 용량 순번).
      앞 두 글자는 이번에 고른 중분류를 따른다. 끝자리가 9를 넘어가면 새 이름처럼 새 일련번호를 받는다.
    - 새 이름이면: 전체 코드의 일련번호 최대값 + 1, 끝자리 0.
    - taken(이카운트 코드 등)과 겹치면 다음 번호로 넘어간다.
    chemicals: [{'dsids', 'name'}], taken: DB 에 없지만 쓰면 안 되는 코드
    """
    prefix = CHEMICAL_CLASSES[infoL1][0]
    existing = {c['dsids'] for c in chemicals} | set(taken)

    same = [int(c['dsids'][2:]) for c in chemicals
            if c.get('name', '').strip() == name.strip() and re.fullmatch(r'\d{4}', c['dsids'][2:])]
    if same:
        number = max(same) + 1
        while number % 10 != 0:                       # 끝자리 9 다음은 다른 제품 번호라 쓰지 않음
            code = f'{prefix}{number:04d}'
            if code not in existing:
                return code
            number += 1

    seqs = [s for s in map(_seq, existing) if s is not None]
    seq = max(seqs, default=0) + 1
    while f'{prefix}{seq:03d}0' in existing:
        seq += 1
    return f'{prefix}{seq:03d}0'


def _norm(text):
    """비교용: 전각·호환 문자 정리(㎖→ml, ｇ→g), 소문자, 띄어쓰기·기호 제거."""
    return re.sub(r'[\s()\[\]{}\-_.,/·+]', '', unicodedata.normalize('NFKC', text or '')).lower()


def _jamo(text):
    """한글 음절을 초·중·종성으로 풀어 글자 하나 차이(신/선)를 부분 유사로 본다."""
    out = []
    for ch in text:
        code = ord(ch) - 0xAC00
        if 0 <= code < 11172:
            out += [code // 588, 100 + (code % 588) // 28, 200 + code % 28]
        else:
            out.append(ch)
    return out


def name_similarity(a, b, allow_contains=True):
    """(점수, 이유). 1.0 띄어쓰기·기호만 다름 / 0.9 포함 / 그 외 자모 유사도."""
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return 0.0, ''
    if a == b:
        return 1.0, '띄어쓰기·기호만 다름'
    if allow_contains and len(min(a, b, key=len)) >= 2 and (a in b or b in a):
        return 0.9, '이름 포함'
    return difflib.SequenceMatcher(None, _jamo(a), _jamo(b)).ratio(), '비슷한 이름'


def check_similar(name, unit, chemicals):
    """새 약품 이름·용량을 기존 약품과 비교한다.

    returns {
      'sameName': [{dsids, unit}]  같은 이름(앞뒤 공백 제거 후 일치) — 다른 용량 추가면 정상
      'sameUnit': bool             같은 이름에 같은 용량까지 있음 → 확인 필요
      'similar': [{name, score, reason, codes: [{dsids, unit}]}]  비슷한 다른 이름 → 확인 필요
    }
    별칭은 OCR 오인식 표기가 많아 포함 관계는 보지 않는다.
    """
    name = name.strip()
    same = [c for c in chemicals if c.get('name', '').strip() == name]
    unit_key = _norm(unit)
    groups = {}
    for c in chemicals:
        other = c.get('name', '').strip()
        if other == name:
            continue
        score, reason = name_similarity(name, other)
        for alias in c.get('aliases') or []:
            alias_score, _ = name_similarity(name, alias, allow_contains=False)
            if alias_score > score:
                score, reason = alias_score, f"별칭 '{alias}'"
        if score < SIMILAR_THRESHOLD:
            continue
        group = groups.setdefault(other, {'name': other, 'score': 0.0, 'reason': '', 'codes': []})
        group['codes'].append({'dsids': c['dsids'], 'unit': c.get('unit', '')})
        if score > group['score']:
            group['score'], group['reason'] = round(score, 2), reason
    similar = sorted(groups.values(), key=lambda g: (-g['score'], g['name']))[:SIMILAR_LIMIT]
    for group in similar:
        group['codes'].sort(key=lambda x: x['dsids'])
    return {
        'sameName': sorted(({'dsids': c['dsids'], 'unit': c.get('unit', '')} for c in same), key=lambda x: x['dsids']),
        'sameUnit': bool(unit_key) and any(_norm(c.get('unit', '')) == unit_key for c in same),
        'similar': similar,
    }


def _scan_chemicals(table):
    return _scan_all(table, '#k, #n, #u, #a', {'#k': 'dsids', '#n': 'name', '#u': 'unit', '#a': 'aliases'})


def _validate_chemical(body):
    name = _text(body, 'name')
    if not name:
        raise ApiError(400, 'name 은 필수입니다')
    infoL1 = _text(body, 'infoL1')
    if infoL1 not in CHEMICAL_CLASSES:
        raise ApiError(400, f'infoL1 은 {", ".join(CHEMICAL_CLASSES)} 중 하나여야 합니다')
    infoL2 = CHEMICAL_CLASSES[infoL1][1]
    if _text(body, 'infoL2') not in ('', infoL2):
        raise ApiError(400, f"infoL1 '{infoL1}' 의 대분류는 '{infoL2}' 입니다")

    item = {'name': name, 'infoL1': infoL1, 'infoL2': infoL2}
    for field in CHEMICAL_TEXT_FIELDS:
        if _text(body, field):
            item[field] = _text(body, field)
    item.setdefault('unit', '')
    item.setdefault('infoL3', '중요도1')
    for field in PRICE_FIELDS:
        raw = body.get(field, 0)
        try:
            price = Decimal(str(raw if raw not in (None, '') else 0))
        except InvalidOperation:
            raise ApiError(400, f'{field} 는 숫자여야 합니다') from None
        if not price.is_finite() or price < 0:
            raise ApiError(400, f'{field} 는 0 이상이어야 합니다')
        item[field] = price
    for field in YN_FIELDS:
        value = _text(body, field) or 'Y'
        if value not in ('Y', 'N'):
            raise ApiError(400, f'{field} 는 Y 또는 N 이어야 합니다')
        item[field] = value
    aliases = body.get('aliases', [])
    if not isinstance(aliases, list) or not all(isinstance(a, str) for a in aliases):
        raise ApiError(400, 'aliases 는 문자열 목록이어야 합니다')
    if aliases:
        item['aliases'] = [a.strip() for a in aliases if a.strip()]
    return item


def preview_chemical_code(query):
    """다음 코드 + 비슷한 이름 확인 결과 (?infoL1=&name=&unit=). 저장하지 않는다."""
    infoL1, name = (query.get('infoL1') or '').strip(), (query.get('name') or '').strip()
    if infoL1 not in CHEMICAL_CLASSES:
        raise ApiError(400, f'infoL1 은 {", ".join(CHEMICAL_CLASSES)} 중 하나여야 합니다')
    chemicals = _scan_chemicals(_table(CHEMICAL_TABLE))
    result = {'dsids': next_chemical_code(infoL1, name, chemicals, _ecount_codes()), 'final': False}
    if name:
        result.update(check_similar(name, query.get('unit') or '', chemicals))
    return result


def create_chemical(body, app='unknown'):
    now = _now()
    request = request_block(body, app, now)              # 키·request 먼저 (없으면 내용과 상관없이 403/400)
    item = _validate_chemical(body)
    item.update({'origin': 'local', 'createdAt': now, 'updatedAt': now,
                 'regStatus': 'requested', 'ecountStatus': 'pending', 'regRequest': request})
    if body.get('confirmSimilar') is True:
        item['regRequest']['confirmSimilar'] = True     # 승인 카드에 ⚠️ 한 줄
    web = _approve_if_web(item, app, now)
    table, taken = _table(CHEMICAL_TABLE), _ecount_codes()

    chemicals = _scan_chemicals(table)
    if body.get('confirmSimilar') is not True:
        check = check_similar(item['name'], item['unit'], chemicals)
        if check['similar'] or check['sameUnit']:
            message = ('같은 이름·같은 용량의 약품이 이미 있습니다' if check['sameUnit']
                       else '비슷한 이름의 약품이 있습니다')
            raise ApiError(409, f'{message}. 새 약품이 맞으면 confirmSimilar: true 로 다시 보내세요',
                           reason='similar', **check)

    for attempt in range(MAX_RETRY):
        if attempt:
            chemicals = _scan_chemicals(table)
        item['dsids'] = next_chemical_code(item['infoL1'], item['name'], chemicals, taken)
        if _put_new(table, 'dsids', item):
            _log_created(ENTITIES['dschemical'], item)
            notify_bot('card', 'item', item)
            return {**item, 'autoApproved': web, 'autoReason': WEB_DECISION_BY if web else '품목은 승인이 필요합니다'}
    raise ApiError(503, '동시에 추가하는 요청이 많아 코드를 정하지 못했습니다. 잠시 후 다시 시도하세요')


# ---------------------------------------------------------------- 거래처

def is_valid_biz_no(digits):
    """사업자등록번호 10자리 검증 (국세청 검증번호 규칙). customerExcel.js isValidBizNo 와 같다."""
    if not re.fullmatch(r'\d{10}', digits):
        return False
    d = [int(ch) for ch in digits]
    weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
    total = sum(x * w for x, w in zip(d, weights)) + (d[8] * 5) // 10
    return (10 - total % 10) % 10 == d[9]


def next_person_code(codes):
    numbers = [int(c[1:]) for c in codes if re.fullmatch(r'P\d{5}', c)]
    return f'P{max(numbers, default=0) + 1:05d}'


def _validate_customer(body):
    cust_type = _text(body, 'custType')
    if cust_type not in ('corp', 'person'):
        raise ApiError(400, "custType 은 'corp'(법인) 또는 'person'(개인) 이어야 합니다")
    name = _text(body, 'name')
    if not name:
        raise ApiError(400, 'name 은 필수입니다')
    category = _text(body, 'category') or '기타'
    if category not in CUSTOMER_CATEGORIES:
        raise ApiError(400, f'category 는 {", ".join(CUSTOMER_CATEGORIES)} 중 하나여야 합니다')

    item = {'custType': cust_type, 'name': name, 'category': category}
    for field in CUSTOMER_TEXT_FIELDS:
        item[field] = _text(body, field)
    if not item['createdBy']:
        del item['createdBy']
    if cust_type == 'person':
        item.update({'ceo': name, 'bizType': '', 'bizItem': ''})
    else:
        digits = re.sub(r'\D', '', _text(body, 'bizNo'))
        if len(digits) != 10:
            raise ApiError(400, '법인은 사업자등록번호 10자리(bizNo)가 필요합니다')
        if not is_valid_biz_no(digits) and body.get('allowInvalidBizNo') is not True:
            raise ApiError(422, '사업자등록번호 검증번호가 맞지 않습니다. 맞는 번호면 allowInvalidBizNo: true 로 다시 보내세요')
        item['custcd'] = digits
    item.update({'aliases': [], 'active': 'Y'})
    return item


def create_customer(body, app='unknown'):
    now = _now()
    request = request_block(body, app, now)              # 키·request 먼저 (없으면 내용과 상관없이 403/400)
    item = _validate_customer(body)
    item.update({'origin': 'local', 'createdAt': now, 'updatedAt': now,
                 'regStatus': 'requested', 'ecountStatus': 'pending', 'regRequest': request})
    if item['custType'] == 'corp' and not is_valid_biz_no(item['custcd']):
        item['regRequest']['allowInvalidBizNo'] = True  # 검증번호가 틀린 채로 등록 (승인 카드에 ⚠️ 한 줄)
    evidence, reason = check_evidence(body, item)
    if evidence:
        item.update({'regStatus': 'approved', 'regEvidence': evidence,
                     'regDecision': {'by': '증빙 자동', 'byId': '', 'at': now, 'comment': '', 'target': 'registration',
                                     'decision': 'approve'}})
    web = _approve_if_web(item, app, now)
    table = _table(CUSTOMER_TABLE)

    def created(saved):
        _log_created(ENTITIES['dscustomer'], saved)
        notify_bot('card', 'customer', saved)
        if web:
            return {**saved, 'autoApproved': True, 'autoReason': WEB_DECISION_BY}
        return {**saved, 'autoApproved': bool(evidence), 'autoReason': reason}

    if item['custType'] == 'corp':
        if _put_new(table, 'custcd', item):
            return created(item)
        existing = table.get_item(Key={'custcd': item['custcd']}).get('Item', {})
        raise ApiError(409, '이미 있는 거래처코드입니다',
                       existing={'custcd': item['custcd'], 'name': existing.get('name', '')})

    for _ in range(MAX_RETRY):
        codes = [c['custcd'] for c in _scan_all(table, '#k', {'#k': 'custcd'})]
        item['custcd'] = next_person_code(codes)
        if _put_new(table, 'custcd', item):
            return created(item)
    raise ApiError(503, '동시에 추가하는 요청이 많아 코드를 정하지 못했습니다. 잠시 후 다시 시도하세요')


# ---------------------------------------------------------------- 창고

def _validate_warehouse(body):
    whcd = _text(body, 'whcd')
    if not re.fullmatch(r'[0-9A-Za-z]{1,10}', whcd):
        raise ApiError(400, '창고코드(whcd)는 영문·숫자 1~10자여야 합니다')
    name = _text(body, 'name')
    if not name:
        raise ApiError(400, 'name 은 필수입니다')
    wh_type = _text(body, 'whType') or '창고'
    if wh_type not in WAREHOUSE_TYPES:
        raise ApiError(400, f'whType 은 {", ".join(WAREHOUSE_TYPES)} 중 하나여야 합니다')
    item = {'whcd': whcd, 'name': name, 'whType': wh_type, 'active': 'Y'}
    for field in WAREHOUSE_TEXT_FIELDS:
        item[field] = _text(body, field)
    if not item['createdBy']:
        del item['createdBy']
    return item


def create_warehouse(body):
    """창고 추가. 다른 데이터(약품 warehouse, 방제 기본정보)가 창고를 이름으로 가리키므로 같은 이름도 막는다."""
    item = _validate_warehouse(body)
    table = _table(WAREHOUSE_TABLE)
    existing = _scan_all(table, '#k, #n', {'#k': 'whcd', '#n': 'name'})
    same_name = next((w for w in existing if _norm(w.get('name')) == _norm(item['name'])), None)
    if same_name:
        raise ApiError(409, '같은 이름의 창고가 이미 있습니다', reason='name',
                       existing={'whcd': same_name['whcd'], 'name': same_name.get('name', '')})

    now = _now()
    item.update({'origin': 'local', 'createdAt': now, 'updatedAt': now})
    if _put_new(table, 'whcd', item):
        return item
    found = table.get_item(Key={'whcd': item['whcd']}).get('Item', {})
    raise ApiError(409, '이미 있는 창고코드입니다', reason='code',
                   existing={'whcd': item['whcd'], 'name': found.get('name', '')})


# ---------------------------------------------------------------- 부분 수정 · 별칭 · 이력 (거래처 · 약품)
# docs/gdb-update-api-request.md. 로그에는 키 · 바뀐 필드 이름 · updatedBy 만 남긴다 (대표자·전화·이메일 값은 남기지 않음)

EMAIL_RE = re.compile(r'[^@\s]+@[^@\s]+\.[^@\s]+')
COMPANY_MARKS = re.compile(r'\(주\)|㈜|주식회사|\(유\)|유한회사|\(사\)|사단법인|\(재\)|재단법인')


def _norm_company(text):
    """거래처 이름 비교용: 법인 표기((주)·주식회사 등) 위치가 달라도 같게 본다. (주)새서울레저 = 새서울레저(주)"""
    return _norm(COMPANY_MARKS.sub('', text or ''))


def _str_value(field, value):
    if not isinstance(value, str):
        raise ApiError(400, f'{field} 는 문자열이어야 합니다', field=field)
    return value.strip()


def _name_value(field, value):
    value = _str_value(field, value)
    if not value:
        raise ApiError(400, f'{field} 는 비울 수 없습니다', field=field)
    return value


def _email_value(field, value):
    value = _str_value(field, value)
    if value and not EMAIL_RE.fullmatch(value):
        raise ApiError(400, 'email 형식이 아닙니다', field=field)
    return value


def _choice(options):
    def check(field, value):
        value = _str_value(field, value)
        if value not in options:
            raise ApiError(400, f'{field} 는 {", ".join(options)} 중 하나여야 합니다', field=field)
        return value
    return check


def _price_value(field, value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        raise ApiError(400, f'{field} 는 숫자여야 합니다', field=field)
    try:
        price = Decimal(str(value).strip() or 'x')
    except InvalidOperation:
        raise ApiError(400, f'{field} 는 숫자여야 합니다', field=field) from None
    if not price.is_finite() or price < 0:
        raise ApiError(400, f'{field} 는 0 이상이어야 합니다', field=field)
    return price


YN = _choice(('Y', 'N'))

# 경로 접두어 → 대상 설정
ENTITIES = {
    'dscustomer': {
        'label': '거래처', 'table': CUSTOMER_TABLE, 'key': 'custcd', 'history': CUSTOMER_HISTORY_TABLE,
        'fields': {'name': _name_value, 'ceo': _str_value, 'bizType': _str_value, 'bizItem': _str_value,
                   'tel': _str_value, 'email': _email_value, 'memo': _str_value,
                   'category': _choice(CUSTOMER_CATEGORIES), 'active': YN},
        'dirty': ('name', 'ceo', 'bizType', 'bizItem'),   # 이카운트 거래처 항목 → ecountDirtyFields
        'private': ('tel', 'email'),                       # 이력에 값 대신 '(변경됨)'
        'alias_objects': True,                             # [{name, code, source}]
        'owner_norm': _norm_company,
    },
    'dschemical': {
        'label': '약품', 'table': CHEMICAL_TABLE, 'key': 'dsids', 'history': CHEMICAL_HISTORY_TABLE,
        'fields': {'name': _name_value, 'unit': _str_value, 'infoL3': _str_value, 'vendors': _str_value,
                   'IN_PRICE': _price_value, 'OUT_PRICE': _price_value, 'OUT_PRICE1': _price_value,
                   'active': YN, 'flgWork': YN, 'flgOut': YN},   # dsids·infoL1·infoL2 는 코드 체계와 묶여 제외
        'dirty': (),
        'private': (),
        'alias_objects': False,                            # ["데브리놀", ...]
        'owner_norm': _norm,
    },
}


def _required_by(body):
    by = _text(body, 'updatedBy')
    if not by or len(by) > 100:
        raise ApiError(400, 'updatedBy 는 필수입니다 (예: inv:<이메일>, web:<이메일>)', field='updatedBy')
    return by


def _required_key(ent, body):
    value = _text(body, ent['key'])
    if not value:
        raise ApiError(400, f"{ent['key']} 는 필수입니다", field=ent['key'])
    return value


def _get_record(ent, key_value):
    item = _table(ent['table']).get_item(Key={ent['key']: key_value}, ConsistentRead=True).get('Item')
    if not item:
        raise ApiError(404, f"없는 {ent['label']} 코드입니다: {key_value}")
    return item


def _version_condition(ent, expected):
    """레코드가 있고, updatedAt 이 읽은 값과 같을 때만 쓴다 (옛 레코드는 updatedAt 없음)."""
    exists = f"attribute_exists({ent['key']})"
    if expected is None:
        return f'{exists} AND attribute_not_exists(updatedAt)', {}
    return f'{exists} AND updatedAt = :expected', {':expected': expected}


def _write_history(ent, key_value, by, action, changes):
    shown = {f: ['(변경됨)', '(변경됨)'] if f in ent['private'] else v for f, v in changes.items()}
    at = f'{_now()}#{uuid.uuid4().hex[:8]}'   # 같은 밀리초 겹침 방지
    try:
        _table(ent['history']).put_item(
            Item={ent['key']: key_value, 'at': at, 'by': by, 'action': action, 'changes': shown})
    except Exception as e:  # noqa: BLE001 — 이력 실패가 수정 자체를 되돌리지는 않음
        print(f"이력 저장 실패 {ent['key']}={key_value} action={action}: {type(e).__name__}")


def _conflict(ent, key_value):
    return ApiError(409, '다른 곳에서 먼저 고쳤습니다. 지금 내용을 확인하고 다시 고치세요',
                    reason='conflict', current=_get_record(ent, key_value))


def update_record(ent, body):
    """부분 수정. set 에 있는 허용 필드만 바꾸고, 읽은 뒤 다른 곳에서 고쳤으면 409."""
    key_value = _required_key(ent, body)
    if 'expectedUpdatedAt' not in body:
        raise ApiError(400, 'expectedUpdatedAt 은 필수입니다 (updatedAt 이 없던 레코드면 null)', field='expectedUpdatedAt')
    expected = body.get('expectedUpdatedAt')
    values = body.get('set')
    if not isinstance(values, dict) or not values:
        raise ApiError(400, 'set 에 바꿀 필드를 넣으세요', field='set')
    for field in values:
        if field not in ent['fields']:
            alias_hint = f" / 별칭은 /{'dscustomer' if ent['alias_objects'] else 'dschemical'}/alias"
            raise ApiError(400, f"{field} 는 이 API로 바꿀 수 없습니다 (허용: {', '.join(ent['fields'])}{alias_hint})", field=field)
    values = {f: ent['fields'][f](f, v) for f, v in values.items()}
    by = _required_by(body)

    current = _get_record(ent, key_value)
    if current.get('updatedAt') != expected:
        raise _conflict(ent, key_value)
    changes = {f: [current.get(f, ''), v] for f, v in values.items() if current.get(f, '') != v}
    if not changes:
        return current

    names = {f'#f{i}': f for i, f in enumerate(changes)}
    expr_values = {f':v{i}': changes[f][1] for i, f in enumerate(changes)}
    sets = [f'#f{i} = :v{i}' for i in range(len(changes))] + ['updatedAt = :now', 'updatedBy = :by']
    expr_values.update({':now': _now(), ':by': by})
    dirty = [f for f in changes if f in ent['dirty']] if current.get('origin') == 'ecount' else []
    if dirty:
        sets.append('ecountDirtyFields = :dirty')
        expr_values[':dirty'] = sorted(set(current.get('ecountDirtyFields') or []) | set(dirty))
    condition, condition_values = _version_condition(ent, expected)
    expr_values.update(condition_values)
    try:
        saved = _table(ent['table']).update_item(
            Key={ent['key']: key_value}, UpdateExpression='SET ' + ', '.join(sets), ConditionExpression=condition,
            ExpressionAttributeNames=names, ExpressionAttributeValues=expr_values, ReturnValues='ALL_NEW')['Attributes']
    except ClientError as e:
        if e.response['Error']['Code'] != 'ConditionalCheckFailedException':
            raise
        raise _conflict(ent, key_value) from None

    print(f"update {ent['key']}={key_value} fields={sorted(changes)} by={by}")
    _write_history(ent, key_value, by, 'update', changes)
    return saved


def _alias_name(alias):
    return alias.get('name', '') if isinstance(alias, dict) else str(alias)


def _parse_aliases(ent, items, field):
    """거래처: [{name, code?}] / 약품: ["이름"] (또는 [{name}]) → [{name, code}]"""
    if items is None:
        return []
    if not isinstance(items, list):
        raise ApiError(400, f'{field} 는 목록이어야 합니다', field=field)
    result = []
    for entry in items:
        name = entry if isinstance(entry, str) else entry.get('name') if isinstance(entry, dict) else None
        code = entry.get('code', '') if isinstance(entry, dict) else ''
        if not isinstance(name, str) or not (1 <= len(name.strip()) <= ALIAS_MAX_LEN) or not _norm(name):
            raise ApiError(400, f'{field} 의 별칭 이름은 1~{ALIAS_MAX_LEN}자여야 합니다', field=field)
        result.append({'name': name.strip(), 'code': code.strip() if isinstance(code, str) else ''})
    return result


def _alias_owners(ent, record):
    """다른 레코드의 별칭·이름 → {정규화 이름: {key, name}}. 봇이 이름으로도 찾으므로 이름도 본다.
    약품은 같은 이름(다른 용량)은 같은 제품이라 빼고 본다."""
    key, norm = ent['key'], ent['owner_norm']
    own_name = _norm(record.get('name'))
    owners = {}
    for other in _scan_all(_table(ent['table']), '#k, #n, #a', {'#k': key, '#n': 'name', '#a': 'aliases'}):
        if other[key] == record[key] or (not ent['alias_objects'] and _norm(other.get('name')) == own_name):
            continue
        for label in [other.get('name', '')] + [_alias_name(a) for a in other.get('aliases') or []]:
            if norm(label):
                owners.setdefault(norm(label), {key: other[key], 'name': other.get('name', '')})
    return owners


def update_aliases(ent, body):
    """별칭 추가·삭제. 지금 목록을 읽어 더하고 빼서 조건부로 저장하고, 동시 수정이면 다시 읽어 최대 3번."""
    key_value = _required_key(ent, body)
    add, remove = _parse_aliases(ent, body.get('add'), 'add'), _parse_aliases(ent, body.get('remove'), 'remove')
    if not add and not remove:
        raise ApiError(400, 'add 나 remove 에 별칭을 넣으세요')
    if len(add) + len(remove) > ALIAS_MAX_ITEMS:
        raise ApiError(400, f'별칭은 한 번에 {ALIAS_MAX_ITEMS}개까지입니다')
    by = _required_by(body)
    record = _get_record(ent, key_value)

    if add and body.get('force') is not True:
        owners = _alias_owners(ent, record)
        norm = ent['owner_norm']
        taken = [{'alias': a['name'], **owners[norm(a['name'])]} for a in add if norm(a['name']) in owners]
        if taken:
            raise ApiError(409, '다른 곳이 같은 별칭(또는 이름)을 쓰고 있습니다. 맞으면 force: true 로 다시 보내세요',
                           reason='aliasTaken', taken=taken)

    remove_keys = {_norm(r['name']) for r in remove}
    for _ in range(ALIAS_RETRY):
        current = _get_record(ent, key_value)
        before = list(current.get('aliases') or [])
        after = [a for a in before if _norm(_alias_name(a)) not in remove_keys]
        have = {_norm(_alias_name(a)) for a in after}
        for a in add:
            if _norm(a['name']) not in have:              # 표기만 다른 같은 별칭은 무시
                after.append({'name': a['name'], 'code': a['code'], 'source': 'local'} if ent['alias_objects'] else a['name'])
                have.add(_norm(a['name']))
        if after == before:
            return current
        condition, condition_values = _version_condition(ent, current.get('updatedAt'))
        try:
            saved = _table(ent['table']).update_item(
                Key={ent['key']: key_value}, UpdateExpression='SET aliases = :aliases, updatedAt = :now, updatedBy = :by',
                ConditionExpression=condition,
                ExpressionAttributeValues={':aliases': after, ':now': _now(), ':by': by, **condition_values},
                ReturnValues='ALL_NEW')['Attributes']
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                continue
            raise
        print(f"alias {ent['key']}={key_value} add={len(add)} remove={len(remove)} by={by}")
        _write_history(ent, key_value, by, 'alias', {'aliases': [[_alias_name(a) for a in before],
                                                                [_alias_name(a) for a in after]]})
        return saved
    raise ApiError(503, '동시에 고치는 요청이 많아 저장하지 못했습니다. 잠시 후 다시 시도하세요')


def record_history(ent, key_value):
    """최근 변경 이력 50건, 새것부터."""
    key_value = (key_value or '').strip()
    if not key_value:
        raise ApiError(400, f"id({ent['label']} 코드)가 필요합니다", field='id')
    response = _table(ent['history']).query(
        KeyConditionExpression=Key(ent['key']).eq(key_value), ScanIndexForward=False, Limit=HISTORY_LIMIT)
    return [{'at': item['at'].split('#')[0], 'by': item.get('by', ''), 'action': item.get('action', ''),
             'changes': item.get('changes', {})} for item in response.get('Items', [])]


# ---------------------------------------------------------------- 등록 요청 (docs/gdb-request-registration-queue.md)
# 앱은 API 키로 정한다. KEY_APPS 환경 변수 = {sha256(키 값): "inv"|"quote"|"web"} (배포 노트북 (L1-6) 이 넣음, 키 값은 두지 않음)

def _key_apps():
    try:
        return json.loads(os.environ.get('KEY_APPS') or '{}')
    except ValueError:
        print('KEY_APPS 환경 변수 형식 오류')
        return {}


def app_of(event):
    """요청한 앱 (inv/quote/web). 키가 없거나 모르는 키면 'unknown' (약품·거래처 create 는 403)."""
    headers = {k.lower(): v for k, v in ((event.get('params') or {}).get('header') or {}).items()}
    key = headers.get('x-api-key') or (event.get('context') or {}).get('api-key') or ''
    if not key:
        return 'unknown'
    return _key_apps().get(hashlib.sha256(key.encode()).hexdigest(), 'unknown')


def _required_app(event):
    app = app_of(event)
    if app == 'unknown':
        raise ApiError(403, 'API 키(x-api-key)가 필요합니다')
    return app


def request_block(body, app, now):
    """create 본문의 request → regRequest. app·at 은 서버가 정한다.
    키와 request 는 필수다 (2026-10-13, 요청서 6단계 F1 — 전환 기간 끝)."""
    if app == 'unknown':
        print('거절: 키 없는 create')
        raise ApiError(403, 'API 키(x-api-key)가 필요합니다. 앱별 키(globaldb-inv/quote/web)로 보내세요')
    request = body.get('request')
    if not isinstance(request, dict) or request.get('channel') not in REQUEST_CHANNELS:
        print(f'거절: request 없는 create (app={app})')
        raise ApiError(400, "request 블록이 필요합니다: {channel: 'telegram'|'web', by, byId, note, ref}", field='request')
    block = {'app': app, 'at': now}
    for field in REQUEST_FIELDS:
        value = request.get(field, '')
        block[field] = value.strip()[:REQUEST_TEXT_MAX] if isinstance(value, str) else ''
    return block


def _s3():
    if 's3' not in _resources:
        _resources['s3'] = boto3.client('s3', region_name='us-east-1', config=Config(signature_version='s3v4'))
    return _resources['s3']


def _evidence_exists(file_key):
    try:
        _s3().head_object(Bucket=EVIDENCE_BUCKET, Key=EVIDENCE_PREFIX + file_key)
        return True
    except ClientError:
        return False


def check_evidence(body, item):
    """증빙 자동 등록 조건(4.1의 1~4)을 모두 채우면 (regEvidence, '') / 아니면 (None, 이유)."""
    evidence = body.get('evidence')
    if not isinstance(evidence, dict) or not evidence:
        return None, '증빙 없음'
    if item['custType'] != 'corp':
        return None, '개인 거래처는 증빙을 받지 않습니다'
    doc_type = _text(evidence, 'docType')
    if doc_type not in EVIDENCE_DOC_TYPES:
        return None, f'증빙 문서 종류는 {", ".join(EVIDENCE_DOC_TYPES)} 중 하나여야 합니다'
    if re.sub(r'\D', '', _text(evidence, 'bizNo')) != item['custcd']:
        return None, '증빙의 사업자번호와 등록할 사업자번호가 다릅니다'
    if not is_valid_biz_no(item['custcd']):
        return None, '사업자번호 검증번호가 맞지 않습니다'
    file_key = _text(evidence, 'fileKey')
    if not FILE_KEY_RE.fullmatch(file_key) or not _evidence_exists(file_key):
        return None, '증빙 파일이 올라와 있지 않습니다 (evidence-upload 로 먼저 올리세요)'
    extracted = evidence.get('extracted') if isinstance(evidence.get('extracted'), dict) else {}
    return {
        'docType': doc_type, 'bizNo': item['custcd'], 'fileKey': file_key,
        'extracted': {f: _text(extracted, f)[:REQUEST_TEXT_MAX] for f in EVIDENCE_EXTRACTED_FIELDS if _text(extracted, f)},
        'readAt': _text(evidence, 'readAt')[:40] or item['createdAt'],
        'readBy': _text(evidence, 'readBy')[:REQUEST_TEXT_MAX] or item['regRequest'].get('by', ''),
    }, ''


def evidence_upload(body, app):
    doc_type = _text(body, 'docType')
    if doc_type not in EVIDENCE_DOC_TYPES:
        raise ApiError(400, f'docType 은 {", ".join(EVIDENCE_DOC_TYPES)} 중 하나여야 합니다', field='docType')
    content_type = _text(body, 'contentType').lower()
    if content_type not in EVIDENCE_CONTENT_TYPES:
        raise ApiError(400, f'contentType 은 {", ".join(EVIDENCE_CONTENT_TYPES)} 중 하나여야 합니다', field='contentType')
    file_key = f'{datetime.now(timezone.utc).year}/{uuid.uuid4().hex}.{EVIDENCE_CONTENT_TYPES[content_type]}'
    url = _s3().generate_presigned_url(
        'put_object', Params={'Bucket': EVIDENCE_BUCKET, 'Key': EVIDENCE_PREFIX + file_key, 'ContentType': content_type},
        ExpiresIn=UPLOAD_URL_SECONDS)
    print(f'evidence-upload app={app} docType={doc_type} fileKey={file_key}')
    return {'fileKey': file_key, 'uploadUrl': url, 'contentType': content_type, 'expiresIn': UPLOAD_URL_SECONDS}


def evidence_view_url(file_key):
    return _s3().generate_presigned_url('get_object', Params={'Bucket': EVIDENCE_BUCKET, 'Key': EVIDENCE_PREFIX + file_key},
                                        ExpiresIn=VIEW_URL_SECONDS)


def effective_status(record):
    """(regStatus, ecountStatus). 필드가 없는 이전 데이터: 등록은 approved, 이카운트는 ecount 출처면 None(해당 없음)."""
    reg = record.get('regStatus') or 'approved'
    ecount = record.get('ecountStatus') or (None if record.get('origin') == 'ecount' else 'approved')
    return reg, ecount


def _log_created(ent, item):
    by = item['regRequest'].get('by') or '-'
    _write_history(ent, item[ent['key']], f"{item['regRequest']['app']}:{by}", 'create',
                   {'regStatus': ['', item['regStatus']], 'ecountStatus': ['', item['ecountStatus']]})


def _request_row(kind, record):
    reg, ecount = effective_status(record)
    row = {'kind': kind, 'name': record.get('name', ''), 'regStatus': reg, 'ecountStatus': ecount,
           'regRequest': record.get('regRequest'), 'regDecision': record.get('regDecision'),
           'updatedAt': record.get('updatedAt', ''), 'active': record.get('active', 'Y'),
           'ecountSyncedAt': record.get('ecountSyncedAt', '')}
    if kind == 'item':
        row.update({'code': record['dsids'], 'unit': record.get('unit', ''), 'infoL1': record.get('infoL1', ''),
                    'infoL2': record.get('infoL2', ''), 'infoL3': record.get('infoL3', ''),
                    'vendors': record.get('vendors', ''), **{f: record.get(f, 0) for f in PRICE_FIELDS}})
    else:
        row.update({'code': record['custcd'], 'custType': record.get('custType', ''),
                    'bizNo': record['custcd'] if record.get('custType') == 'corp' else '',
                    'category': record.get('category', ''), 'ceo': record.get('ceo', ''),
                    'bizType': record.get('bizType', ''), 'bizItem': record.get('bizItem', '')})
        if record.get('regEvidence'):
            row['regEvidence'] = {**record['regEvidence'], 'viewUrl': evidence_view_url(record['regEvidence']['fileKey'])}
    return row


def _is_pending(row, pending):
    reg_wait = row['regStatus'] == 'requested'
    ecount_wait = row['ecountStatus'] == 'pending' and row['regStatus'] != 'rejected'
    return {'registration': reg_wait, 'ecount': ecount_wait, 'any': reg_wait or ecount_wait}[pending]


def list_requests(query):
    """등록 요청 목록 (약품·거래처). regRequest 가 있는 레코드만, 요청 시각 새것부터."""
    pending = (query.get('pending') or '').strip()
    kind = (query.get('kind') or '').strip()
    app = (query.get('app') or '').strip()
    since = (query.get('changedSince') or '').strip()
    if pending and pending not in ('registration', 'ecount', 'any'):
        raise ApiError(400, 'pending 은 registration, ecount, any 중 하나입니다', field='pending')
    if kind and kind not in ('item', 'customer'):
        raise ApiError(400, 'kind 는 item 또는 customer 입니다', field='kind')

    rows = []
    for row_kind, table_name in (('item', CHEMICAL_TABLE), ('customer', CUSTOMER_TABLE)):
        if kind and kind != row_kind:
            continue
        table, kwargs = _table(table_name), {'FilterExpression': Attr('regRequest').exists()}
        while True:
            response = table.scan(**kwargs)
            rows.extend(_request_row(row_kind, r) for r in response.get('Items', []))
            if 'LastEvaluatedKey' not in response:
                break
            kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
    rows = [r for r in rows
            if (not pending or _is_pending(r, pending))
            and (not app or (r['regRequest'] or {}).get('app') == app)
            and (not since or r['updatedAt'] > since)]
    rows.sort(key=lambda r: (r['regRequest'] or {}).get('at', ''), reverse=True)
    return rows


def _decide(record, decision):
    """(target, 새 regStatus, 새 ecountStatus). 처리할 수 없으면 ApiError.
    requested: approve → 둘 다 승인 / reject → 반려·제외 / exclude → 등록은 승인, 이카운트만 제외
    증빙 등록(approved + pending): approve → 이카운트 승인 / exclude → 이카운트 제외 / reject → 400"""
    reg, ecount = effective_status(record)
    if reg == 'requested':
        return {'approve': ('registration', 'approved', 'approved'),
                'reject': ('registration', 'rejected', 'excluded'),
                'exclude': ('registration', 'approved', 'excluded')}[decision]
    if reg == 'approved' and ecount == 'pending':
        if decision == 'reject':
            raise ApiError(400, '이미 등록된 거래처(증빙 등록)는 반려할 수 없습니다. 이카운트 제외(exclude)를 쓰세요',
                           field='decision')
        return 'ecount', 'approved', 'approved' if decision == 'approve' else 'excluded'
    raise ApiError(409, '이미 처리된 요청입니다', reason='decided', regDecision=record.get('regDecision'),
                   regStatus=reg, ecountStatus=ecount)


def _stale(ent, key_value):
    return ApiError(409, '그사이 다른 곳에서 고쳤습니다. 지금 내용을 확인하고 다시 결정하세요', reason='stale',
                    current=_get_record(ent, key_value))


def review_record(ent, body, app):
    """외부 API 결정 — 닫힘 (2026-10-13). 재고 봇 승인을 끈 뒤 외부 키는 모두 403.
    승인은 글로벌 DB 봇(/internal/review)과 웹(/regreview)에서만 받는다."""
    print(f"review API 거절 app={app} {ent['key']}={_text(body, 'id')}")
    raise ApiError(403, '승인은 글로벌 DB 슈퍼관리자가 글로벌 DB 봇·웹에서 합니다')


def decide(ent, body, channel):
    """결정 (봇·웹·재고 공통). 반려·제외는 comment 필수. 반려하면 active = N (지우지 않음).
    channel 은 updatedBy 앞에 붙는다 (inv / gdb-bot / gdb-web)."""
    app = channel
    key_value = _text(body, 'id')
    if not key_value:
        raise ApiError(400, 'id 는 필수입니다', field='id')
    decision = _text(body, 'decision')
    if decision not in REVIEW_DECISIONS:
        raise ApiError(400, f'decision 은 {", ".join(REVIEW_DECISIONS)} 중 하나여야 합니다', field='decision')
    comment = _text(body, 'comment')[:REQUEST_TEXT_MAX]
    if decision != 'approve' and not comment:
        raise ApiError(422, '반려·이카운트 제외는 사유(comment)가 필요합니다', field='comment')
    by = _text(body, 'by')[:100]
    if not by:
        raise ApiError(400, 'by(결정한 사람 이름)는 필수입니다', field='by')

    record = _get_record(ent, key_value)
    target, reg, ecount = _decide(record, decision)        # 이미 처리됐으면 stale 보다 decided 를 먼저 알린다
    if 'expectedUpdatedAt' in body and body.get('expectedUpdatedAt') != record.get('updatedAt'):
        raise _stale(ent, key_value)
    before = effective_status(record)
    now = _now()
    values = {':reg': reg, ':ecount': ecount, ':now': now, ':by': f'{app}:{by}',
              ':decision': {'by': by, 'byId': _text(body, 'byId')[:100], 'at': now, 'comment': comment,
                            'target': target, 'decision': decision}}
    sets = 'SET regStatus = :reg, ecountStatus = :ecount, regDecision = :decision, updatedAt = :now, updatedBy = :by'
    changes = {'regStatus': [before[0], reg], 'ecountStatus': [before[1] or '', ecount]}
    if reg == 'rejected':
        sets += ', active = :inactive'
        values[':inactive'] = 'N'
        changes['active'] = [record.get('active', 'Y'), 'N']
    if comment:
        changes['comment'] = ['', comment]
    condition, condition_values = _version_condition(ent, record.get('updatedAt'))
    try:
        saved = _table(ent['table']).update_item(
            Key={ent['key']: key_value}, UpdateExpression=sets, ConditionExpression=condition,
            ExpressionAttributeValues={**values, **condition_values}, ReturnValues='ALL_NEW')['Attributes']
    except ClientError as e:
        if e.response['Error']['Code'] != 'ConditionalCheckFailedException':
            raise
        raise _stale(ent, key_value) from None

    print(f"review {ent['key']}={key_value} decision={decision} target={target} by={app}:{by}")
    _write_history(ent, key_value, f'{app}:{by}', 'review', changes)
    notify_bot('decided', _kind_of(ent), saved)
    return saved


# ---------------------------------------------------------------- 4차: 글로벌 DB 봇 · 웹 승인

def _approve_if_web(item, app, now):
    """글로벌 DB 웹에서 만든 것은 승인 없이 확정 (등록·이카운트 둘 다)."""
    if app != 'web':
        return False
    item.update({'regStatus': 'approved', 'ecountStatus': 'approved',
                 'regDecision': {'by': WEB_DECISION_BY, 'byId': item['regRequest'].get('byId', ''), 'at': now,
                                 'comment': '', 'target': 'registration', 'decision': 'approve'}})
    return True


def _kind_of(ent):
    return 'customer' if ent['key'] == 'custcd' else 'item'


def _entity(kind):
    if kind not in ('item', 'customer'):
        raise ApiError(400, 'kind 는 item 또는 customer 입니다', field='kind')
    return ENTITIES['dschemical' if kind == 'item' else 'dscustomer']


def _lambda():
    if 'lambda' not in _resources:
        _resources['lambda'] = boto3.client('lambda', region_name='us-east-1')
    return _resources['lambda']


def notify_bot(action, kind, record):
    """봇 Lambda 를 비동기로 부른다. card = 승인 대기면 카드 보내기, decided = 보낸 카드를 결정 문구로.
    봇이 없거나 실패해도 저장·결정은 그대로 끝난다 (로그만)."""
    function = os.environ.get('GDB_BOT_FUNCTION')
    if not function:
        return
    row = _request_row(kind, record)
    if action == 'card' and not _is_pending(row, 'any'):
        return
    try:
        _lambda().invoke(FunctionName=function, InvocationType='Event',
                         Payload=json.dumps({'action': action, 'row': row}, default=_json_default, ensure_ascii=False).encode())
    except Exception as e:  # noqa: BLE001
        print(f"봇 알림 실패 action={action} {kind}={row['code']}: {type(e).__name__} {e}")


def _owner_emails():
    return {e.strip().lower() for e in os.environ.get('GDB_OWNER_EMAILS', '').split(',') if e.strip()}


def web_review(method, event):
    """웹 승인 — API Gateway Cognito 권한 부여자가 확인한 로그인 사람(claims)이 슈퍼관리자일 때만.
    GET: {isOwner, email} / POST {kind, id, decision, comment, expectedUpdatedAt}: 결정."""
    ctx = event.get('context') or {}
    email = _claims_email(event)
    people = approvers()
    me = people.get(email)
    if method == 'GET':
        return {'isOwner': bool(me and me['role'] == 'owner'), 'isApprover': bool(me), 'email': email}
    if method != 'POST':
        raise ApiError(405, f'Method not allowed: {method}')
    if not me:
        raise ApiError(403, '승인은 글로벌 DB 승인자만 할 수 있습니다 (설정에서 슈퍼관리자가 추가)')
    body = dict(event.get('body-json') or {})
    body['by'] = me['name'] or (ctx.get('claims-name') or '').strip() or email
    body['byId'] = ctx.get('claims-sub') or ''
    return decide(_entity(_text(body, 'kind')), body, 'gdb-web')


def internal(path, body):
    """봇 Lambda 전용 (Lambda 직접 호출). request: 한 건 / pending: 승인 대기 / review: 봇에서 결정."""
    if path == '/internal/pending':
        return [r for r in list_requests({'pending': 'any'})]
    if path == '/internal/approvers':
        return approver_telegrams()
    if path == '/internal/redeem':
        return redeem_link_code(body)
    ent = _entity(_text(body, 'kind'))
    if path == '/internal/request':
        return _request_row(_kind_of(ent), _get_record(ent, _text(body, 'id')))
    if path == '/internal/review':
        return _request_row(_kind_of(ent), decide(ent, body, 'gdb-bot'))
    raise ApiError(404, f'없는 내부 경로: {path}')


# ---------------------------------------------------------------- 설정: 승인자 · 텔레그램 연결 (웹 "설정")
# 슈퍼관리자 = GDB_OWNER_EMAILS (웹에서 못 바꿈, 설정을 고칠 수 있는 사람). 승인자 = 슈퍼관리자가 웹에서 추가.
# 텔레그램은 번호를 치지 않고, 웹에서 만든 한 번만 쓰는 링크(t.me/<봇>?start=<코드>)로 연결한다 (재고 앱과 같은 방식).
# 저장: 봇 테이블 (BOT_TABLE, pk/sk, ttl)
#   approver / <email>           {name, addedBy, addedAt}
#   tglink   / <email>#<tg id>   {email, telegramId, username, tgName, linkedAt}
#   tgcode   / <sha256(코드)>     {codeId, email, kind(self|invite), createdBy, expiresAt, usedAt, cancelledAt, ttl}

LINK_CODE_MINUTES = 10        # 본인 연결 링크
INVITE_HOURS = 48             # 슈퍼관리자가 만든 초대 링크
EMAIL_ONLY_RE = re.compile(r'[^@\s]+@[^@\s]+\.[^@\s]+')


def _settings_table():
    return _table(os.environ.get('BOT_TABLE', 'dsglobaldb-bot'))


def _query_pk(pk):
    items, kwargs = [], {'KeyConditionExpression': Key('pk').eq(pk)}
    while True:
        r = _settings_table().query(**kwargs)
        items.extend(r.get('Items', []))
        if 'LastEvaluatedKey' not in r:
            return items
        kwargs['ExclusiveStartKey'] = r['LastEvaluatedKey']


def approvers():
    """{email: {email, name, role(owner|approver), addedBy, addedAt}} — 슈퍼관리자 + 웹에서 추가한 승인자."""
    out = {e: {'email': e, 'name': '', 'role': 'owner', 'addedBy': '', 'addedAt': ''} for e in _owner_emails()}
    for it in _query_pk('approver'):
        email = it['sk']
        rec = out.get(email) or {'email': email, 'role': 'approver'}
        rec.update({'name': it.get('name', ''), 'addedBy': it.get('addedBy', ''), 'addedAt': it.get('addedAt', '')})
        out[email] = rec
    return out


def _links():
    return [{'email': it['email'], 'telegramId': int(it['telegramId']), 'username': it.get('username', ''),
             'tgName': it.get('tgName', ''), 'linkedAt': it.get('linkedAt', '')} for it in _query_pk('tglink')]


def approver_telegrams():
    """봇용 {텔레그램 번호(문자열): 이름} — 승인자에게 연결된 텔레그램만."""
    people = approvers()
    return {str(l['telegramId']): people[l['email']]['name'] or l['tgName'] or l['email']
            for l in _links() if l['email'] in people}


def _claims_email(event):
    email = ((event.get('context') or {}).get('claims-email') or '').strip().lower()
    if not email:
        raise ApiError(401, '로그인이 필요합니다')
    return email


def _code_hash(code):
    return hashlib.sha256(code.encode()).hexdigest()


def _new_link_code(email, kind, created_by):
    code = ('i_' if kind == 'invite' else 'l_') + uuid.uuid4().hex + uuid.uuid4().hex[:8]   # 텔레그램 start 값: 64자 안, [A-Za-z0-9_-]
    now = datetime.now(timezone.utc)
    expires = now + (timedelta(hours=INVITE_HOURS) if kind == 'invite' else timedelta(minutes=LINK_CODE_MINUTES))
    code_id = uuid.uuid4().hex[:10]
    _settings_table().put_item(Item={
        'pk': 'tgcode', 'sk': _code_hash(code), 'codeId': code_id, 'email': email, 'kind': kind, 'createdBy': created_by,
        'createdAt': now.isoformat(timespec='seconds'), 'expiresAt': expires.isoformat(timespec='seconds'),
        'ttl': int(expires.timestamp()) + 86400})
    bot = os.environ.get('GDB_BOT_USERNAME', '')
    return {'codeId': code_id, 'url': f'https://t.me/{bot}?start={code}' if bot else '', 'code': code,
            'expiresAt': expires.isoformat(timespec='seconds'), 'kind': kind}


def _open_invites(people):
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    return sorted(({'codeId': it['codeId'], 'email': it['email'], 'name': people.get(it['email'], {}).get('name', ''),
                    'createdBy': it.get('createdBy', ''), 'expiresAt': it['expiresAt']}
                   for it in _query_pk('tgcode')
                   if it.get('kind') == 'invite' and not it.get('usedAt') and not it.get('cancelledAt')
                   and it['expiresAt'] > now), key=lambda x: x['expiresAt'])


def settings_view(email):
    people = approvers()
    links = _links()
    me = people.get(email)
    rows = []
    for p in sorted(people.values(), key=lambda p: (p['role'] != 'owner', p['name'] or p['email'])):
        rows.append({**p, 'telegram': [l for l in links if l['email'] == p['email']]})
    return {'me': {'email': email, 'role': me['role'] if me else None,
                   'telegram': [l for l in links if l['email'] == email]},
            'approvers': rows if me else [],                      # 승인자가 아니면 목록을 보여 주지 않음
            'invites': _open_invites(people) if me and me['role'] == 'owner' else [],
            'botUsername': os.environ.get('GDB_BOT_USERNAME', ''),
            'linkMinutes': LINK_CODE_MINUTES, 'inviteHours': INVITE_HOURS}


def web_settings(method, event):
    """웹 "설정" — GET: 화면 내용 / POST {action, ...}: 승인자 추가·이름 바꾸기·빼기, 연결 링크, 초대 취소, 연결 끊기."""
    email = _claims_email(event)
    if method == 'GET':
        return settings_view(email)
    if method != 'POST':
        raise ApiError(405, f'Method not allowed: {method}')
    body = event.get('body-json') or {}
    action = _text(body, 'action')
    people = approvers()
    me = people.get(email)
    is_owner = bool(me and me['role'] == 'owner')
    target = _text(body, 'email').lower()

    def owner_only():
        if not is_owner:
            raise ApiError(403, '설정은 글로벌 DB 슈퍼관리자만 바꿀 수 있습니다')

    if action == 'saveApprover':                           # 추가 또는 이름 바꾸기
        owner_only()
        name = _text(body, 'name')[:50]
        if not EMAIL_ONLY_RE.fullmatch(target):
            raise ApiError(400, '이메일 형식이 아닙니다 (글로벌 DB 웹에 로그인하는 이메일)', field='email')
        if not name:
            raise ApiError(400, '이름은 필수입니다 (승인 기록에 남는 이름)', field='name')
        existing = people.get(target)
        _settings_table().put_item(Item={'pk': 'approver', 'sk': target, 'name': name,
                                         'addedBy': (existing or {}).get('addedBy') or email,
                                         'addedAt': (existing or {}).get('addedAt') or _now()})
        print(f'설정: 승인자 저장 {target} by={email}')
    elif action == 'removeApprover':
        owner_only()
        if target in _owner_emails():
            raise ApiError(400, '슈퍼관리자(GDB_OWNER_EMAILS)는 여기서 뺄 수 없습니다')
        if target not in people:
            raise ApiError(404, '없는 승인자입니다')
        _settings_table().delete_item(Key={'pk': 'approver', 'sk': target})
        for l in _links():
            if l['email'] == target:
                _settings_table().delete_item(Key={'pk': 'tglink', 'sk': f"{target}#{l['telegramId']}"})
        print(f'설정: 승인자 뺌 {target} by={email}')
    elif action == 'linkCode':                             # 본인 연결 링크 / 슈퍼관리자는 남의 초대 링크
        who = target or email
        if who != email:
            owner_only()
        if who not in people:
            raise ApiError(403, '승인자만 텔레그램을 연결할 수 있습니다')
        if not os.environ.get('GDB_BOT_USERNAME'):
            raise ApiError(503, '봇이 아직 준비되지 않아 링크를 만들 수 없습니다 (GDB_BOT_USERNAME)')
        link = _new_link_code(who, 'self' if who == email else 'invite', email)
        return {**settings_view(email), 'link': link}
    elif action == 'cancelInvite':
        owner_only()
        code_id = _text(body, 'codeId')
        found = next((it for it in _query_pk('tgcode') if it.get('codeId') == code_id), None)
        if not found:
            raise ApiError(404, '없는 초대입니다')
        _settings_table().update_item(Key={'pk': 'tgcode', 'sk': found['sk']}, UpdateExpression='SET cancelledAt = :t',
                                      ExpressionAttributeValues={':t': _now()})
    elif action == 'unlink':                               # 본인 것 또는 슈퍼관리자
        who = target or email
        if who != email:
            owner_only()
        tg = _text(body, 'telegramId')
        if not re.fullmatch(r'-?\d+', tg):
            raise ApiError(400, 'telegramId 가 필요합니다', field='telegramId')
        _settings_table().delete_item(Key={'pk': 'tglink', 'sk': f'{who}#{int(tg)}'})
        print(f'설정: 텔레그램 끊음 {who}#{tg} by={email}')
    else:
        raise ApiError(400, 'action 은 saveApprover, removeApprover, linkCode, cancelInvite, unlink 중 하나입니다',
                       field='action')
    return settings_view(email)


def redeem_link_code(body):
    """봇 /start <코드> → 연결. {email, name} / 400 이유."""
    code = _text(body, 'code')
    tg = _text(body, 'telegramId')
    if not code or not re.fullmatch(r'-?\d+', tg):
        raise ApiError(400, '코드와 텔레그램 번호가 필요합니다')
    key = {'pk': 'tgcode', 'sk': _code_hash(code)}
    it = _settings_table().get_item(Key=key).get('Item')
    if not it or it.get('cancelledAt'):
        raise ApiError(400, '없거나 취소된 링크입니다. 웹 글로벌 DB → 설정에서 새 링크를 만드세요')
    if it.get('usedAt'):
        raise ApiError(400, '이미 사용한 링크입니다. 웹 글로벌 DB → 설정에서 새 링크를 만드세요')
    if it['expiresAt'] < datetime.now(timezone.utc).isoformat(timespec='seconds'):
        raise ApiError(400, '기간이 지난 링크입니다. 웹 글로벌 DB → 설정에서 새 링크를 만드세요')
    people = approvers()
    if it['email'] not in people:
        raise ApiError(400, '승인자에서 빠진 계정입니다')
    try:
        _settings_table().update_item(Key=key, UpdateExpression='SET usedAt = :t, usedByTg = :tg',
                                      ConditionExpression='attribute_not_exists(usedAt)',
                                      ExpressionAttributeValues={':t': _now(), ':tg': int(tg)})
    except ClientError as e:
        if e.response['Error']['Code'] != 'ConditionalCheckFailedException':
            raise
        raise ApiError(400, '이미 사용한 링크입니다. 웹 글로벌 DB → 설정에서 새 링크를 만드세요') from None
    _settings_table().put_item(Item={'pk': 'tglink', 'sk': f"{it['email']}#{int(tg)}", 'email': it['email'],
                                     'telegramId': int(tg), 'username': _text(body, 'username')[:64],
                                     'tgName': _text(body, 'tgName')[:100], 'linkedAt': _now(), 'via': it['kind']})
    print(f"설정: 텔레그램 연결 {it['email']} via={it['kind']}")
    person = people[it['email']]
    return {'email': it['email'], 'name': person['name'], 'role': person['role']}
