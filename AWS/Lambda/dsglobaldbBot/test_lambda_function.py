"""dsglobaldbBot 테스트 — 텔레그램·core Lambda 는 가짜, DynamoDB 는 moto.

    pytest AWS/Lambda/dsglobaldbBot
"""
import os

import boto3
import pytest
from moto import mock_aws

os.environ.setdefault('AWS_DEFAULT_REGION', 'us-east-1')

import lambda_function as bot  # noqa: E402

OWNER = 111
ITEM = {'kind': 'item', 'code': 'B05012', 'name': '그린영양제X', 'unit': '20ℓ', 'infoL1': '비료', 'IN_PRICE': 15000,
        'OUT_PRICE1': 0, 'regStatus': 'requested', 'ecountStatus': 'pending',
        'regRequest': {'app': 'quote', 'channel': 'telegram', 'by': '홍길동', 'at': '2026-10-12T02:00:00.000Z'}}
EVIDENCE = {'kind': 'customer', 'code': '1234567890', 'name': '(주)그린필드', 'custType': 'corp', 'bizNo': '1234567890',
            'category': '매입처', 'ceo': '김민수', 'bizType': '도소매', 'bizItem': '비료',
            'regStatus': 'approved', 'ecountStatus': 'pending',
            'regEvidence': {'docType': '세금계산서', 'fileKey': '2026/' + 'a' * 32 + '.jpg', 'readAt': '2026-10-12'},
            'regRequest': {'app': 'inv', 'channel': 'telegram', 'by': '홍길동', 'at': '2026-10-12T02:00:00.000Z'}}


@pytest.fixture
def env(monkeypatch):
    with mock_aws():
        boto3.resource('dynamodb', region_name='us-east-1').create_table(
            TableName='dsglobaldb-bot', BillingMode='PAY_PER_REQUEST',
            KeySchema=[{'AttributeName': 'pk', 'KeyType': 'HASH'}, {'AttributeName': 'sk', 'KeyType': 'RANGE'}],
            AttributeDefinitions=[{'AttributeName': 'pk', 'AttributeType': 'S'}, {'AttributeName': 'sk', 'AttributeType': 'S'}])
        bot._cache.clear()
        monkeypatch.setenv('GDB_OWNER_TG', f'{OWNER}:조윤제')
        monkeypatch.setenv('WEBHOOK_SECRET', 's3cret')
        sent, calls, state = [], [], {'records': {('item', 'B05012'): dict(ITEM), ('customer', '1234567890'): dict(EVIDENCE)}}

        def tg(method, **params):
            sent.append((method, params))
            return {'message_id': len(sent) + 100}

        def core(path, body=None):
            calls.append((path, body))
            key = (body or {}).get('kind'), (body or {}).get('id')
            rec = state['records'].get(key)
            if path == '/internal/pending':
                return 200, [r for r in state['records'].values() if bot.is_pending(r)]
            if not rec:
                return 404, {'message': '없음'}
            if path == '/internal/request':
                return 200, rec
            if not bot.is_pending(rec):
                return 409, {'reason': 'decided', 'regDecision': rec['regDecision']}
            d = body['decision']
            target = 'registration' if rec['regStatus'] == 'requested' else 'ecount'      # 서버 _decide 와 같음
            rec.update({'regDecision': {'decision': d, 'by': body['by'], 'comment': body.get('comment', ''), 'target': target},
                        'regStatus': 'rejected' if d == 'reject' else 'approved',
                        'ecountStatus': 'approved' if d == 'approve' else 'excluded'})
            return 200, rec

        monkeypatch.setattr(bot, 'tg', tg)
        monkeypatch.setattr(bot, 'core', core)
        yield sent, calls, state


def webhook(update, secret='s3cret'):
    return bot.lambda_handler({'params': {'header': {'X-Telegram-Bot-Api-Secret-Token': secret}}, 'body-json': update}, None)


def press(data, user=OWNER):
    return webhook({'update_id': 1, 'callback_query': {'id': 'cq', 'from': {'id': user}, 'data': data,
                                                        'message': {'chat': {'id': user}, 'message_id': 101}}})


def say(text, user=OWNER, reply_to=None):
    msg = {'chat': {'id': user, 'type': 'private'}, 'from': {'id': user, 'first_name': 'Y'}, 'text': text}
    if reply_to:
        msg['reply_to_message'] = {'message_id': reply_to}
    return webhook({'update_id': 2, 'message': msg})


def test_card_text_matches_registry_shape():
    text = bot.card_text(ITEM)
    assert text.splitlines()[0] == '🆕 등록 승인 요청 — 새 품목'                       # 5차 문구
    assert '20ℓ · 비료 · 판가 없음 · 구입가 15,000원' in text and '등록: 홍길동 (2026-10-12) · 견적 봇' in text
    assert text.splitlines()[-1].endswith('(승인 전에는 쓰지 않음)')
    assert [(b['text'], b['callback_data']) for b in bot.card_buttons(ITEM)[0]] == [
        ('✅ 승인 (등록 + 이카운트)', 'ra:i:B05012'), ('❌ 반려', 'rr:i:B05012')]
    ev = bot.card_text(EVIDENCE)
    assert ev.splitlines()[0] == '🆕 이카운트 등록 승인 요청 — 새 거래처 (증빙 자동 등록)'
    assert '증빙: 세금계산서 (2026-10-12) · 재고 봇 · 홍길동' in ev
    assert [(b['text'], b['callback_data']) for row in bot.card_buttons(EVIDENCE) for b in row] == [
        ('✅ 이카운트 등록 승인', 'ra:c:1234567890'), ('🚫 이카운트 제외', 'rx:c:1234567890'),
        ('📄 증빙 보기', 're:c:1234567890')]


QUOTE_CUSTOMER = {'kind': 'customer', 'code': '1234567890', 'name': '(주)새솔', 'custType': 'corp', 'bizNo': '1234567890',
                  'category': '골프장', 'ceo': '김민수', 'regStatus': 'requested', 'ecountStatus': 'pending',
                  'regRequest': {'app': 'quote', 'channel': 'telegram', 'by': '홍길동', 'at': '2026-10-13T02:00:00.000Z'}}


def test_quote_customer_card_6th():
    lines = bot.card_text(QUOTE_CUSTOMER).splitlines()
    assert lines[0] == '🆕 등록 승인 요청 — 새 거래처'
    assert lines[2] == '법인 123-45-67890 · 골프장 · 대표 김민수' and lines[3] == '등록: 홍길동 (2026-10-13) · 견적 봇'
    assert lines[-2].startswith('견적에서는 승인 전에도 이 코드로 쓰는 중입니다')
    assert lines[-1] == '반려하면 새 견적에는 못 쓰고, 이미 만든 견적은 남습니다 (요청자에게 건수를 알림).'
    assert [b['text'] for b in bot.card_buttons(QUOTE_CUSTOMER)[0]] == ['✅ 승인 (등록 + 이카운트)', '❌ 반려']
    # 견적 품목·재고 거래처는 5차 문구 그대로
    assert bot.card_text({**QUOTE_CUSTOMER, 'regRequest': {**QUOTE_CUSTOMER['regRequest'], 'app': 'inv'}}).endswith('(승인 전에는 쓰지 않음)')
    assert bot.card_text({**ITEM, 'regRequest': {**ITEM['regRequest'], 'app': 'quote'}}).endswith('(승인 전에는 쓰지 않음)')
    # 결정 뒤에는 안내 두 줄이 모두 빠진다
    decided = bot.decided_text({**QUOTE_CUSTOMER, 'regStatus': 'rejected',
                                'regDecision': {'decision': 'reject', 'target': 'registration', 'by': '조윤제', 'comment': '중복'}})
    assert '견적에서는' not in decided and '반려하면' not in decided
    assert decided.splitlines() == ['❌ 반려 — 새 거래처', '코드: 1234567890 · (주)새솔', '법인 123-45-67890 · 골프장 · 대표 김민수',
                                    '등록: 홍길동 (2026-10-13) · 견적 봇', '❌ 반려 — 조윤제 · 사유: 중복']


def test_decided_labels():
    both = {**ITEM, 'regStatus': 'approved', 'ecountStatus': 'approved',
            'regDecision': {'decision': 'approve', 'target': 'registration', 'by': '조윤제'}}
    assert bot.decided_text(both).splitlines()[0] == '✅ 승인 (등록 + 이카운트) — 새 품목'
    assert bot.decided_text(both).splitlines()[-1] == '✅ 승인 (등록 + 이카운트) — 조윤제'
    ev = {**EVIDENCE, 'ecountStatus': 'approved', 'regDecision': {'decision': 'approve', 'target': 'ecount', 'by': '조윤제'}}
    assert bot.decided_text(ev).splitlines()[0] == '✅ 이카운트 등록 승인 — 새 거래처'
    rej = {**ITEM, 'regStatus': 'rejected',
           'regDecision': {'decision': 'reject', 'target': 'registration', 'by': '조윤제', 'comment': '중복'}}
    assert bot.decided_text(rej).splitlines()[-1] == '❌ 반려 — 조윤제 · 사유: 중복'


def test_card_sent_once_to_owners(env):
    sent, _, _ = env
    bot.lambda_handler({'action': 'card', 'row': ITEM}, None)
    bot.lambda_handler({'action': 'card', 'row': ITEM}, None)          # 비동기 재시도 — 다시 보내지 않음
    assert [(m, p['chat_id']) for m, p in sent] == [('sendMessage', OWNER)]


def test_approve_button_edits_cards(env):
    sent, calls, state = env
    bot.lambda_handler({'action': 'card', 'row': ITEM}, None)
    press('ra:i:B05012')
    assert ('/internal/review', {'kind': 'item', 'id': 'B05012', 'decision': 'approve', 'comment': '',
                                 'by': '조윤제', 'byId': f'tg:{OWNER}'}) in calls
    edits = [p for m, p in sent if m == 'editMessageText']
    assert edits and edits[0]['text'].startswith('✅ 승인 (등록 + 이카운트) — 새 품목') and '— 조윤제' in edits[0]['text']
    press('ra:i:B05012')                                                 # 다시 누르면 이미 처리됨
    assert sent[-2][1]['text'].startswith('이미 처리됨: 품목 B05012')


def test_reject_asks_reason_then_decides(env):
    sent, _, state = env
    press('rr:i:B05012')
    ask = next(p for m, p in sent if m == 'sendMessage' and '사유를 보내 주세요' in p['text'])
    ask_id = next(i for i, (m, p) in enumerate(sent) if p is ask) + 101    # 가짜 tg 의 message_id
    say('이미 있는 품목', reply_to=ask_id)
    rec = state['records'][('item', 'B05012')]
    assert rec['regStatus'] == 'rejected' and rec['regDecision']['comment'] == '이미 있는 품목'
    assert sent[-1][1]['text'].startswith('❌ 반려 처리했습니다: B05012')
    say('또', reply_to=ask_id)                                           # 사유 대기는 한 번만
    assert sent[-1][1]['text'].startswith('글로벌 DB 봇입니다')


def test_non_owner_and_bad_secret(env):
    sent, calls, _ = env
    press('ra:i:B05012', user=999)
    assert sent[-1][0] == 'answerCallbackQuery' and sent[-1][1]['show_alert'] is True and not calls
    say('/start', user=999)
    assert '당신의 텔레그램 번호: 999' in sent[-1][1]['text']
    before = len(sent)
    assert webhook({'message': {}}, secret='wrong')['statusCode'] == 403 and len(sent) == before


def test_pending_and_morning(env):
    sent, _, _ = env
    say('/pending')
    assert sent[0][1]['text'] == '📋 승인 대기 2건' and sum(1 for m, _ in sent if m == 'sendMessage') == 3
    sent.clear()
    bot.lambda_handler({'action': 'morning'}, None)
    assert sent[0][1]['text'].startswith('📋 승인 대기 2건 (등록 승인 1 · 이카운트 승인 1)')
