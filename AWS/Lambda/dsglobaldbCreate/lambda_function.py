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

기존 /dschemical, /dscustomer 의 GET/POST/PUT/DELETE 는 그대로 두고, 추가만 이 Lambda 가 맡는다.
모든 쓰기는 attribute_not_exists 조건부 put 이라 기존 레코드를 덮어쓰지 않는다.

약품은 비슷한 이름(오타·띄어쓰기 차이·포함·별칭)이나 같은 이름·같은 용량이 있으면 409(reason=similar)로
후보를 돌려주고, 사용자가 확인한 뒤 confirmSimilar: true 로 다시 보내야 만든다.
"""
import difflib
import json
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import boto3
from boto3.dynamodb.conditions import Key
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
            return respond(201, create_chemical(event.get('body-json') or {}))
        if method == 'GET' and path == '/dschemical/next-code':
            query = event.get('params', {}).get('querystring', {})
            return respond(200, preview_chemical_code(query))
        if method == 'POST' and path == '/dscustomer/create':
            return respond(201, create_customer(event.get('body-json') or {}))
        if method == 'POST' and path == '/dswarehouse/create':
            return respond(201, create_warehouse(event.get('body-json') or {}))
        prefix, _, action = path.strip('/').partition('/')
        ent = ENTITIES.get(prefix)
        if ent and method == 'POST' and action == 'update':
            return respond(200, update_record(ent, event.get('body-json') or {}))
        if ent and method == 'POST' and action == 'alias':
            return respond(200, update_aliases(ent, event.get('body-json') or {}))
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


def create_chemical(body):
    item = _validate_chemical(body)
    now = _now()
    item.update({'origin': 'local', 'createdAt': now, 'updatedAt': now})
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
            return item
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


def create_customer(body):
    item = _validate_customer(body)
    now = _now()
    item.update({'origin': 'local', 'createdAt': now, 'updatedAt': now})
    table = _table(CUSTOMER_TABLE)

    if item['custType'] == 'corp':
        if _put_new(table, 'custcd', item):
            return item
        existing = table.get_item(Key={'custcd': item['custcd']}).get('Item', {})
        raise ApiError(409, '이미 있는 거래처코드입니다',
                       existing={'custcd': item['custcd'], 'name': existing.get('name', '')})

    for _ in range(MAX_RETRY):
        codes = [c['custcd'] for c in _scan_all(table, '#k', {'#k': 'custcd'})]
        item['custcd'] = next_person_code(codes)
        if _put_new(table, 'custcd', item):
            return item
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
