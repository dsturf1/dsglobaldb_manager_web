"""dsglobaldbCreate 테스트 (pytest + moto). 실제 AWS 는 쓰지 않는다.

    pip install "moto[dynamodb,s3]" pytest boto3
    pytest AWS/Lambda/dsglobaldbCreate
"""
import json
import os
from decimal import Decimal

import boto3
import pytest
from moto import mock_aws

os.environ.setdefault('AWS_DEFAULT_REGION', 'us-east-1')

import lambda_function as lf  # noqa: E402


def event(method, path, body=None, query=None):
    return {'context': {'http-method': method, 'resource-path': path},
            'body-json': body or {}, 'params': {'querystring': query or {}}}


def call(method, path, body=None, query=None):
    res = lf.lambda_handler(event(method, path, body, query), None)
    return res['statusCode'], json.loads(res['body'])


@pytest.fixture
def aws():
    with mock_aws():
        lf._resources.clear()
        ddb = boto3.resource('dynamodb', region_name='us-east-1')
        for name, key in [(lf.CHEMICAL_TABLE, 'dsids'), (lf.CUSTOMER_TABLE, 'custcd')]:
            ddb.create_table(TableName=name, KeySchema=[{'AttributeName': key, 'KeyType': 'HASH'}],
                             AttributeDefinitions=[{'AttributeName': key, 'AttributeType': 'S'}],
                             BillingMode='PAY_PER_REQUEST')
        boto3.client('s3', region_name='us-east-1').create_bucket(Bucket=lf.ECOUNT_BUCKET)
        yield ddb


def seed_chemicals(ddb, items):
    table = ddb.Table(lf.CHEMICAL_TABLE)
    for dsids, name in items:
        table.put_item(Item={'dsids': dsids, 'name': name, 'IN_PRICE': Decimal(100), 'memo': '원본'})


def seed_ecount(codes):
    boto3.client('s3', region_name='us-east-1').put_object(
        Bucket=lf.ECOUNT_BUCKET, Key=lf.ECOUNT_KEY,
        Body=json.dumps({'all_codes': {c: '' for c in codes}}).encode())


BASE = [('A11041', '몬카트'), ('A11042', '몬카트'), ('B07991', '크리스탈그린'), ('C04721', '라이더'), ('B04721', '라이더')]


# ---------------------------------------------------------------- 약품 코드 규칙

def test_new_name_gets_next_sequence_with_zero(aws):
    seed_chemicals(aws, BASE)
    status, body = call('POST', '/dschemical/create', {'name': '새약', 'infoL1': '살충제'})
    assert status == 201
    assert body['dsids'] == 'A28000'          # 최대 일련번호 799 + 1, 끝자리 0
    assert body['infoL2'] == '농약'


def test_same_name_increments_last_digit(aws):
    seed_chemicals(aws, BASE)
    status, body = call('POST', '/dschemical/create', {'name': ' 몬카트 ', 'infoL1': '살균제', 'unit': '5ℓ'})
    assert status == 201 and body['dsids'] == 'A11043'


def test_same_name_uses_chosen_prefix(aws):
    seed_chemicals(aws, BASE)
    _, body = call('POST', '/dschemical/create', {'name': '라이더', 'infoL1': '살균제'})
    assert body['dsids'] == 'A14722'          # 번호는 같은 이름 그룹, 앞자리는 고른 중분류


def test_same_name_after_9_takes_new_sequence(aws):
    seed_chemicals(aws, BASE + [('A11049', '몬카트')])
    _, body = call('POST', '/dschemical/create', {'name': '몬카트', 'infoL1': '살균제'})
    assert body['dsids'] == 'A18000'          # A11050 은 다른 제품 번호라 쓰지 않음


def test_skips_codes_that_exist_in_ecount(aws):
    seed_chemicals(aws, BASE)
    seed_ecount(['B08031', 'A11043'])          # 이카운트에만 있는 코드
    _, new = call('POST', '/dschemical/create', {'name': '새약', 'infoL1': '비료'})
    assert new['dsids'] == 'B08040'           # 이카운트 일련번호 803 다음
    _, same = call('POST', '/dschemical/create', {'name': '몬카트', 'infoL1': '살균제'})
    assert same['dsids'] == 'A11044'          # A11043 은 이카운트에 있음


def test_never_overwrites_existing_code(aws):
    seed_chemicals(aws, BASE)
    table = aws.Table(lf.CHEMICAL_TABLE)
    assert lf._put_new(table, 'dsids', {'dsids': 'A11041', 'name': '덮어쓰기 시도'}) is False
    assert table.get_item(Key={'dsids': 'A11041'})['Item']['memo'] == '원본'


def test_retries_when_code_taken_concurrently(aws, monkeypatch):
    seed_chemicals(aws, BASE)
    real_scan = lf._scan_all
    calls = {'n': 0}

    def racing_scan(table, projection, names):
        items = real_scan(table, projection, names)
        calls['n'] += 1
        if calls['n'] == 1:                    # 첫 계산 직후 다른 요청이 같은 코드를 가져감
            aws.Table(lf.CHEMICAL_TABLE).put_item(Item={'dsids': 'A18000', 'name': '다른 사람이 추가'})
        return items

    monkeypatch.setattr(lf, '_scan_all', racing_scan)
    status, body = call('POST', '/dschemical/create', {'name': '새약', 'infoL1': '살균제'})
    assert status == 201 and body['dsids'] == 'A18010'
    assert aws.Table(lf.CHEMICAL_TABLE).get_item(Key={'dsids': 'A18000'})['Item']['name'] == '다른 사람이 추가'


def test_gives_up_after_max_retry(aws, monkeypatch):
    monkeypatch.setattr(lf, '_put_new', lambda *a: False)
    status, body = call('POST', '/dschemical/create', {'name': '새약', 'infoL1': '살균제'})
    assert status == 503


def test_server_fields_ignore_client_values(aws):
    status, body = call('POST', '/dschemical/create', {
        'name': '새약', 'infoL1': '제초제', 'dsids': 'ZZ9999', 'origin': 'ecount',
        'createdAt': '2000-01-01', 'ecountSyncedAt': '2000-01-01', 'IN_PRICE': '1500', 'OUT_PRICE1': 2000.5})
    assert status == 201
    assert body['dsids'] == 'A30010' and body['origin'] == 'local'
    assert body['createdAt'] != '2000-01-01' and 'ecountSyncedAt' not in body
    assert body['active'] == body['flgWork'] == body['flgOut'] == 'Y'
    stored = aws.Table(lf.CHEMICAL_TABLE).get_item(Key={'dsids': 'A30010'})['Item']
    assert stored['IN_PRICE'] == Decimal('1500') and stored['OUT_PRICE1'] == Decimal('2000.5') and stored['OUT_PRICE'] == 0


@pytest.mark.parametrize('body, message', [
    ({'infoL1': '살균제'}, 'name'),
    ({'name': 'x', 'infoL1': '없는분류'}, 'infoL1'),
    ({'name': 'x', 'infoL1': '살균제', 'infoL2': '비료'}, '대분류'),
    ({'name': 'x', 'infoL1': '살균제', 'IN_PRICE': -1}, 'IN_PRICE'),
    ({'name': 'x', 'infoL1': '살균제', 'IN_PRICE': 'abc'}, 'IN_PRICE'),
    ({'name': 'x', 'infoL1': '살균제', 'active': 'yes'}, 'active'),
])
def test_chemical_validation(aws, body, message):
    status, res = call('POST', '/dschemical/create', body)
    assert status == 400 and message in res['message']


def test_next_code_preview_does_not_write(aws):
    seed_chemicals(aws, BASE)
    status, body = call('GET', '/dschemical/next-code', query={'infoL1': '살균제', 'name': '몬카트'})
    assert status == 200 and body['dsids'] == 'A11043' and body['final'] is False
    assert body['similar'] == [] and body['sameUnit'] is False and len(body['sameName']) == 2
    assert 'Item' not in aws.Table(lf.CHEMICAL_TABLE).get_item(Key={'dsids': 'A11043'})


def test_works_without_ecount_file(aws):
    status, body = call('POST', '/dschemical/create', {'name': '첫약', 'infoL1': '잔디'})
    assert status == 201 and body['dsids'] == 'G00010'


# ---------------------------------------------------------------- 거래처

def test_corp_uses_biz_no_and_rejects_duplicate(aws):
    body = {'custType': 'corp', 'bizNo': '220-81-62517', 'name': '(주)가나다', 'category': '골프장'}
    status, created = call('POST', '/dscustomer/create', body)
    assert status == 201 and created['custcd'] == '2208162517' and created['origin'] == 'local'
    status, res = call('POST', '/dscustomer/create', {**body, 'name': '다른이름'})
    assert status == 409 and res['existing'] == {'custcd': '2208162517', 'name': '(주)가나다'}
    stored = aws.Table(lf.CUSTOMER_TABLE).get_item(Key={'custcd': '2208162517'})['Item']
    assert stored['name'] == '(주)가나다'      # 덮어쓰지 않음


def test_corp_invalid_biz_no_needs_flag(aws):
    body = {'custType': 'corp', 'bizNo': '1234567890', 'name': '검증실패'}
    status, _ = call('POST', '/dscustomer/create', body)
    assert status == 422
    status, created = call('POST', '/dscustomer/create', {**body, 'allowInvalidBizNo': True})
    assert status == 201 and created['custcd'] == '1234567890'


def test_person_gets_sequential_code(aws):
    aws.Table(lf.CUSTOMER_TABLE).put_item(Item={'custcd': 'P00007', 'name': '기존'})
    status, created = call('POST', '/dscustomer/create', {'custType': 'person', 'name': '김개인', 'custcd': 'P99999'})
    assert status == 201 and created['custcd'] == 'P00008'
    assert created['ceo'] == '김개인' and created['bizType'] == '' and created['aliases'] == []


@pytest.mark.parametrize('body, status', [
    ({'name': 'x'}, 400),                                            # custType 없음
    ({'custType': 'person'}, 400),                                   # name 없음
    ({'custType': 'corp', 'name': 'x', 'bizNo': '12345'}, 400),      # 10자리 아님
    ({'custType': 'person', 'name': 'x', 'category': '협력사'}, 400),  # 없는 분류
])
def test_customer_validation(aws, body, status):
    assert call('POST', '/dscustomer/create', body)[0] == status


def test_unknown_route(aws):
    assert call('DELETE', '/dschemical/create')[0] == 405


# ---------------------------------------------------------------- 비슷한 이름 확인

def seed_named(ddb, items):
    table = ddb.Table(lf.CHEMICAL_TABLE)
    for dsids, name, unit, aliases in items:
        item = {'dsids': dsids, 'name': name, 'unit': unit}
        if aliases:
            item['aliases'] = aliases
        table.put_item(Item=item)


NAMED = [('A17802', '선승', '500㎖', None), ('C06592', 'DryCareDS-100', '5ℓ', None),
         ('A11041', '몬카트', '500㎖', ['몬카르', '몬카트유제']), ('A11042', '몬카트', '1ℓ', None),
         ('B07940', '루트칼', '1kg', None)]


@pytest.mark.parametrize('name, expected, reason', [
    ('신승', '선승', '비슷한 이름'),                       # 글자 하나 차이 (자모 유사도 0.83)
    ('DryCare DS-100', 'DryCareDS-100', '띄어쓰기·기호만 다름'),
    ('루트칼 액제', '루트칼', '이름 포함'),
    ('몬카르', '몬카트', "별칭 '몬카르'"),
])
def test_similar_name_needs_confirm(aws, name, expected, reason):
    seed_named(aws, NAMED)
    status, res = call('POST', '/dschemical/create', {'name': name, 'infoL1': '살균제'})
    assert status == 409 and res['reason'] == 'similar'
    top = res['similar'][0]
    assert top['name'] == expected and top['reason'] == reason and top['score'] >= 0.8
    assert 'Item' not in aws.Table(lf.CHEMICAL_TABLE).get_item(Key={'dsids': 'A18030'})


def test_similar_groups_codes_by_product(aws):
    seed_named(aws, NAMED)
    _, res = call('POST', '/dschemical/create', {'name': '몬카르', 'infoL1': '살균제'})
    assert res['similar'][0]['codes'] == [{'dsids': 'A11041', 'unit': '500㎖'}, {'dsids': 'A11042', 'unit': '1ℓ'}]


def test_confirm_similar_creates(aws):
    seed_named(aws, NAMED)
    status, body = call('POST', '/dschemical/create', {'name': '신승', 'infoL1': '살균제', 'confirmSimilar': True})
    assert status == 201 and body['name'] == '신승' and 'confirmSimilar' not in body


def test_same_name_new_unit_needs_no_confirm(aws):
    seed_named(aws, NAMED)
    status, body = call('POST', '/dschemical/create', {'name': '몬카트', 'infoL1': '살균제', 'unit': '5ℓ'})
    assert status == 201 and body['dsids'] == 'A11043'


@pytest.mark.parametrize('unit', ['1ℓ', '1 L', '1l'])
def test_same_name_same_unit_needs_confirm(aws, unit):
    seed_named(aws, NAMED)
    status, res = call('POST', '/dschemical/create', {'name': '몬카트', 'infoL1': '살균제', 'unit': unit})
    assert status == 409 and res['sameUnit'] is True
    assert res['sameName'] == [{'dsids': 'A11041', 'unit': '500㎖'}, {'dsids': 'A11042', 'unit': '1ℓ'}]


def test_unrelated_name_creates_directly(aws):
    seed_named(aws, NAMED)
    status, _ = call('POST', '/dschemical/create', {'name': '완전새약', 'infoL1': '비료'})
    assert status == 201


def test_preview_returns_similar(aws):
    seed_named(aws, NAMED)
    status, body = call('GET', '/dschemical/next-code', query={'infoL1': '살균제', 'name': '몬카트', 'unit': '500 ㎖'})
    assert status == 200 and body['dsids'] == 'A11043'
    assert body['sameUnit'] is True and len(body['sameName']) == 2


def test_customer_create_has_no_similarity_check(aws):
    aws.Table(lf.CUSTOMER_TABLE).put_item(Item={'custcd': 'P00001', 'name': '김개인'})
    status, _ = call('POST', '/dscustomer/create', {'custType': 'person', 'name': '김개인'})
    assert status == 201


# ---------------------------------------------------------------- 창고

@pytest.fixture
def wh(aws):
    aws.create_table(TableName=lf.WAREHOUSE_TABLE, KeySchema=[{'AttributeName': 'whcd', 'KeyType': 'HASH'}],
                     AttributeDefinitions=[{'AttributeName': 'whcd', 'AttributeType': 'S'}], BillingMode='PAY_PER_REQUEST')
    table = aws.Table(lf.WAREHOUSE_TABLE)
    table.put_item(Item={'whcd': '100', 'name': '본사창고', 'memo': '원본'})
    table.put_item(Item={'whcd': '00001', 'name': '용역 파미 남'})
    return table


def test_warehouse_create(wh):
    status, body = call('POST', '/dswarehouse/create', {'whcd': '514', 'name': '용역 신규', 'origin': 'ecount', 'active': 'N'})
    assert status == 201
    assert body['whcd'] == '514' and body['whType'] == '창고' and body['active'] == 'Y' and body['origin'] == 'local'
    assert wh.get_item(Key={'whcd': '514'})['Item']['name'] == '용역 신규'


def test_warehouse_duplicate_code_409_no_overwrite(wh):
    status, res = call('POST', '/dswarehouse/create', {'whcd': '100', 'name': '다른창고'})
    assert status == 409 and res['reason'] == 'code' and res['existing'] == {'whcd': '100', 'name': '본사창고'}
    assert wh.get_item(Key={'whcd': '100'})['Item']['memo'] == '원본'


def test_warehouse_duplicate_name_409(wh):
    status, res = call('POST', '/dswarehouse/create', {'whcd': '515', 'name': '용역  파미남'})   # 띄어쓰기만 다름
    assert status == 409 and res['reason'] == 'name' and res['existing']['whcd'] == '00001'
    assert 'Item' not in wh.get_item(Key={'whcd': '515'})


@pytest.mark.parametrize('body', [
    {'name': '이름만'},                                  # 코드 없음
    {'whcd': '5 1', 'name': 'x'},                         # 공백
    {'whcd': '12345678901', 'name': 'x'},                 # 11자
    {'whcd': '516'},                                      # 이름 없음
    {'whcd': '516', 'name': 'x', 'whType': '매장'},        # 없는 구분
])
def test_warehouse_validation(wh, body):
    assert call('POST', '/dswarehouse/create', body)[0] == 400
