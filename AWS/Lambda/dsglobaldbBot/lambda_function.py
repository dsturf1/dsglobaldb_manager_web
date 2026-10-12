"""글로벌 DB 봇 — 품목·거래처 등록 승인 창구 (docs/gdb-request-registration-queue.md 4.8, 5.6).

받는 길
    POST /tgbot (API Gateway jyipsj28s9, 텔레그램 webhook)  X-Telegram-Bot-Api-Secret-Token 헤더로 확인
    Lambda 직접 호출 (비동기)
        {"action": "card", "row": {...}}      dsglobaldbCreate 가 승인 대기를 만들었을 때 → 슈퍼관리자에게 카드
        {"action": "decided", "row": {...}}   결정이 났을 때 (봇·웹·재고 어디서든) → 보낸 카드를 결정 문구로
        {"action": "morning"}                 EventBridge 매일 08:00 KST → 승인 대기 요약

- 승인 카드는 글로벌 DB 슈퍼관리자(GDB_OWNER_TG)에게만 보내고, 이 사람들이 누른 버튼만 받는다.
- 결정은 dsglobaldbCreate 의 /internal/review 를 직접 호출해 한다 (승인 규칙은 그 Lambda 한 곳에).
- 요청자에게는 보내지 않는다 — 요청한 앱이 regrequests 폴링으로 알린다.
- 카드 문구·버튼은 재고 api/registry.py (견적 notify.review_text 모양) 그대로.

환경 변수: TOKEN_PARAM(SSM SecureString 이름), WEBHOOK_SECRET, GDB_OWNER_TG("번호" 또는 "번호:이름", 쉼표),
          CORE_FUNCTION, BOT_TABLE, WEB_URL
"""
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

import boto3
from boto3.dynamodb.conditions import Key

KST = timezone(timedelta(hours=9))
EVIDENCE_BUCKET = 'dsbaseinfo'
EVIDENCE_PREFIX = 'evidence/customers/'
REASON_TTL = 86400                    # "사유를 보내 주세요" 대기 1일
MAX_PENDING_CARDS = 20                # /pending 에서 다시 보내는 카드 수

KIND = {'item': '품목', 'customer': '거래처'}
KIND_KEY = {'item': 'i', 'customer': 'c'}
KIND_OF = {'i': 'item', 'c': 'customer'}
DECIDED = {'approve': '✅ 이카운트 등록 승인', 'reject': '❌ 반려', 'exclude': '🚫 이카운트 제외'}
APPROVE_BOTH = '✅ 승인 (등록 + 이카운트)'   # (5차) 증빙 없는 요청 — 버튼 하나가 등록·이카운트 둘 다 승인
ASK = {'reject': '❌ 반려', 'exclude': '🚫 이카운트 제외'}
HELP = ('글로벌 DB 봇입니다. 품목·거래처 등록 승인 카드를 보냅니다.\n'
        '/pending — 지금 승인 대기 목록 (카드 다시 보내기)\n'
        '/help — 이 안내\n'
        '[❌ 반려]·[🚫 이카운트 제외]를 누르면 사유를 묻습니다. 그 메시지에 답장으로 사유를 보내 주세요.')

_cache = {}


# ---------------------------------------------------------------- 설정 · AWS

def _client(name):
    if name not in _cache:
        _cache[name] = boto3.client(name, region_name='us-east-1')
    return _cache[name]


def _table():
    if 'table' not in _cache:
        _cache['table'] = boto3.resource('dynamodb', region_name='us-east-1').Table(os.environ.get('BOT_TABLE', 'dsglobaldb-bot'))
    return _cache['table']


def _token():
    if 'token' not in _cache:
        _cache['token'] = _client('ssm').get_parameter(
            Name=os.environ['TOKEN_PARAM'], WithDecryption=True)['Parameter']['Value']
    return _cache['token']


def owners():
    """{텔레그램 번호: 이름}. GDB_OWNER_TG = "123,456:조윤제" (이름이 없으면 텔레그램 이름을 쓴다)."""
    result = {}
    for part in os.environ.get('GDB_OWNER_TG', '').split(','):
        num, _, name = part.strip().partition(':')
        if num.strip().lstrip('-').isdigit():
            result[int(num)] = name.strip()
    return result


def core(path, body=None):
    """dsglobaldbCreate 내부 경로 직접 호출 → (statusCode, body)."""
    res = _client('lambda').invoke(
        FunctionName=os.environ.get('CORE_FUNCTION', 'dsglobaldbCreate'), InvocationType='RequestResponse',
        Payload=json.dumps({'context': {'http-method': 'POST', 'resource-path': path}, 'body-json': body or {}},
                           ensure_ascii=False).encode())
    out = json.loads(res['Payload'].read())
    return out['statusCode'], json.loads(out['body'])


# ---------------------------------------------------------------- 텔레그램

def tg(method, **params):
    req = urllib.request.Request(f'https://api.telegram.org/bot{_token()}/{method}', method='POST',
                                 data=json.dumps(params, ensure_ascii=False).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r).get('result')
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:200]
        if 'message is not modified' not in detail:
            print(f'텔레그램 {method} 실패: {e.code} {detail}')
        return None


def send_document(chat_id, filename, data, caption=''):
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in (('chat_id', str(chat_id)), ('caption', caption)):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="document"; filename="{filename}"\r\n'
                  'Content-Type: application/octet-stream\r\n\r\n').encode() + data + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    req = urllib.request.Request(f'https://api.telegram.org/bot{_token()}/sendDocument', method='POST',
                                 data=b''.join(parts), headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r).get('result')


def button(text, data):
    return {'text': text, 'callback_data': data}


# ---------------------------------------------------------------- 카드 문구 (재고 api/registry.py 와 같음)

def won(v):
    return f'{int(v):,}원' if v else '없음'


def app_label(rec):
    req = rec.get('regRequest') or {}
    app, ch = req.get('app') or 'unknown', req.get('channel') or ''
    base = {'inv': '재고', 'quote': '견적', 'web': '글로벌 DB 웹', 'unknown': '앱 모름'}.get(app, app)
    if app in ('inv', 'quote'):
        return f"{base} {'봇' if ch == 'telegram' else '웹'}"
    return base


def is_evidence(rec):
    return bool(rec.get('regEvidence')) and rec.get('regStatus', 'approved') == 'approved'


def is_pending(rec):
    return rec.get('regStatus') == 'requested' or (rec.get('ecountStatus') == 'pending' and rec.get('regStatus') != 'rejected')


def biz(no):
    d = ''.join(c for c in (no or '') if c.isdigit())
    return f'{d[:3]}-{d[3:5]}-{d[5:]}' if len(d) == 10 else (no or '')


def card_text(rec):
    k, req = rec['kind'], rec.get('regRequest') or {}
    when = (req.get('at') or '')[:10]
    if is_evidence(rec):
        ev = rec['regEvidence']
        return '\n'.join([
            '🆕 이카운트 등록 승인 요청 — 새 거래처 (증빙 자동 등록)', f"코드: {rec['code']} · {rec.get('name', '')}",
            f"{rec.get('category') or '분류 없음'} · 대표 {rec.get('ceo') or '-'} · {rec.get('bizType') or '-'}/{rec.get('bizItem') or '-'}",
            f"증빙: {ev.get('docType', '')} ({(ev.get('readAt') or when)[:10]}) · {app_label(rec)} · {req.get('by', '')}",
            '거래처 등록은 끝났습니다. 이카운트에 올릴지 정해 주세요.'])
    requested = rec.get('regStatus') == 'requested'
    head = '🆕 등록 승인 요청' if requested else '🆕 이카운트 등록 승인 요청'   # (5차) 승인 전에는 어느 앱도 쓰지 않음
    out = [f'{head} — 새 {KIND[k]}', f"코드: {rec['code']} · {rec.get('name', '')}"]
    if k == 'item':
        out.append(f"{rec.get('unit') or '-'} · {rec.get('infoL1') or '-'} · 판가 {won(rec.get('OUT_PRICE1'))} · "
                   f"구입가 {won(rec.get('IN_PRICE'))}" + (f" · 구매처 {rec['vendors']}" if rec.get('vendors') else ''))
    else:
        corp = rec.get('custType') == 'corp'
        out.append(('법인 ' + biz(rec.get('bizNo')) if corp else '개인') + f" · {rec.get('category') or '분류 없음'}"
                   + (f" · 대표 {rec['ceo']}" if corp and rec.get('ceo') else ''))
    out.append(f"등록: {req.get('by', '')} ({when}) · {app_label(rec)}")
    if req.get('confirmSimilar'):
        out.append('⚠️ 비슷한 품목이 있다는 확인을 무릅쓰고 등록함')
    if req.get('allowInvalidBizNo'):
        out.append('⚠️ 사업자번호 검증번호가 틀린 것을 맞다고 하고 등록함')
    if req.get('note'):
        out.append(f"메모: {req['note']}")
    out.append('승인하면 등록이 확정되어 앱에서 쓸 수 있고, 이카운트에도 등록해도 됩니다. (승인 전에는 쓰지 않음)' if requested
               else '등록은 끝났습니다. 이카운트에 올릴지 정해 주세요.')
    return '\n'.join(out)


def card_buttons(rec):
    key = f"{KIND_KEY[rec['kind']]}:{rec['code']}"
    if rec.get('regStatus') == 'requested':
        return [[button(APPROVE_BOTH, f'ra:{key}'), button('❌ 반려', f'rr:{key}')]]
    row = [button('✅ 이카운트 등록 승인', f'ra:{key}'), button('🚫 이카운트 제외', f'rx:{key}')]
    return [row, [button('📄 증빙 보기', f're:{key}')]] if rec.get('regEvidence') else [row]


def decided_text(rec):
    """결정 뒤 카드 — `✅ 승인 (등록 + 이카운트)`(증빙 없는 요청) / `✅ 이카운트 등록 승인`(증빙 등록)
    / `❌ 반려 · 사유: …` / `🚫 이카운트 제외 · 사유: …`."""
    d = rec.get('regDecision') or {}
    decision = d.get('decision', 'approve')
    if decision not in DECIDED:
        decision = 'approve'
    label = APPROVE_BOTH if decision == 'approve' and d.get('target') == 'registration' else DECIDED[decision]
    pending_view = {**rec, 'regStatus': 'approved' if rec.get('regEvidence') else 'requested', 'ecountStatus': 'pending'}
    body = card_text(pending_view).split('\n')[1:-1]       # 머리와 마지막 안내 줄을 뺀다
    tail = f"{label} — {d.get('by', '')}" + (f" · 사유: {d['comment']}" if d.get('comment') else '')
    return '\n'.join([f"{label} — 새 {KIND[rec['kind']]}", *body, tail])


def already_text(rec, body):
    d = body.get('regDecision') or (body.get('current') or {}).get('regDecision') or {}
    what = {'approve': '승인', 'reject': '반려', 'exclude': '이카운트 제외'}.get(d.get('decision', ''), '결정')
    return (f"이미 처리됨: {KIND[rec['kind']]} {rec['code']} · {rec.get('name', '')} — {what}"
            + (f" — {d['by']}" if d.get('by') else ''))


# ---------------------------------------------------------------- 보낸 카드 · 사유 대기 (DynamoDB pk/sk, ttl)

def _card_pk(kind, code):
    return f'card#{kind}#{code}'


def sent_cards(kind, code):
    return _table().query(KeyConditionExpression=Key('pk').eq(_card_pk(kind, code))).get('Items', [])


def mark_sent(kind, code, chat_id, message_id):
    _table().put_item(Item={'pk': _card_pk(kind, code), 'sk': str(chat_id), 'chat_id': chat_id,
                            'message_id': message_id, 'sent_at': datetime.now(timezone.utc).isoformat()})


def ask_reason(chat_id, message_id, kind, code, decision):
    _table().put_item(Item={'pk': f'reason#{chat_id}#{message_id}', 'sk': '-', 'kind': kind, 'code': code,
                            'decision': decision, 'ttl': int(time.time()) + REASON_TTL})


def take_reason(chat_id, message_id):
    item = _table().get_item(Key={'pk': f'reason#{chat_id}#{message_id}', 'sk': '-'}).get('Item')
    if item and item.get('ttl', 0) > time.time():
        _table().delete_item(Key={'pk': f'reason#{chat_id}#{message_id}', 'sk': '-'})
        return item
    return None


# ---------------------------------------------------------------- 동작

def send_card(row, chat_ids=None, force=False):
    """승인 카드를 슈퍼관리자에게. 이미 보낸 사람은 건너뛴다 (force 면 /pending 처럼 다시)."""
    already = set() if force else {int(c['chat_id']) for c in sent_cards(row['kind'], row['code'])}
    targets = chat_ids or list(owners())
    if not targets:
        print(f"슈퍼관리자 텔레그램(GDB_OWNER_TG)이 없어 카드를 보내지 못함: {row['kind']} {row['code']}")
    for chat_id in targets:
        if chat_id in already:
            continue
        sent = tg('sendMessage', chat_id=chat_id, text=card_text(row), reply_markup={'inline_keyboard': card_buttons(row)})
        if sent:
            mark_sent(row['kind'], row['code'], chat_id, sent['message_id'])


def mark_decided(row):
    """보낸 카드를 모두 결정 문구로 (버튼 없앰)."""
    text = decided_text(row)
    for c in sent_cards(row['kind'], row['code']):
        tg('editMessageText', chat_id=int(c['chat_id']), message_id=int(c['message_id']), text=text)


def morning():
    status, rows = core('/internal/pending')
    if status != 200 or not rows:
        return
    reg = sum(1 for r in rows if r.get('regStatus') == 'requested')
    text = (f'📋 승인 대기 {len(rows)}건 (등록 승인 {reg} · 이카운트 승인 {len(rows) - reg})\n'
            f"/pending 으로 카드를 다시 받거나 웹에서 처리하세요: {os.environ.get('WEB_URL', '')}")
    for chat_id in owners():
        tg('sendMessage', chat_id=chat_id, text=text)


def _person(user):
    name = owners().get(user['id']) or ' '.join(filter(None, [user.get('last_name'), user.get('first_name')]))
    return name or str(user['id'])


def decide(row_key, decision, comment, user):
    kind, code = row_key
    return core('/internal/review', {'kind': kind, 'id': code, 'decision': decision, 'comment': comment,
                                     'by': _person(user), 'byId': f"tg:{user['id']}"})


def on_callback(cq):
    user, data = cq['from'], cq.get('data', '')
    msg = cq.get('message') or {}
    chat_id, message_id = msg.get('chat', {}).get('id'), msg.get('message_id')

    def answer(text, alert=False):
        tg('answerCallbackQuery', callback_query_id=cq['id'], text=text, show_alert=alert)

    if user['id'] not in owners():
        return answer('승인은 글로벌 DB 슈퍼관리자만 할 수 있습니다.', alert=True)
    action, _, rest = data.partition(':')
    k, _, code = rest.partition(':')
    if action not in ('ra', 'rr', 'rx', 're') or k not in KIND_OF or not code:
        return answer('만료됐거나 알 수 없는 버튼입니다.')
    kind = KIND_OF[k]

    status, rec = core('/internal/request', {'kind': kind, 'id': code})
    if status != 200:
        return answer(f"찾지 못했습니다: {rec.get('message', status)}", alert=True)

    if action == 're':
        ev = rec.get('regEvidence')
        if not ev:
            return answer('증빙 파일이 없습니다.')
        obj = _client('s3').get_object(Bucket=EVIDENCE_BUCKET, Key=EVIDENCE_PREFIX + ev['fileKey'])
        send_document(chat_id, f"{code}_{ev.get('docType', '증빙')}.{ev['fileKey'].rsplit('.', 1)[-1]}",
                      obj['Body'].read(), caption=f"{ev.get('docType', '')} — {rec.get('name', '')} ({biz(code)})")
        return answer('증빙을 보냈습니다.')

    if action in ('rr', 'rx'):
        if not is_pending(rec):
            tg('editMessageText', chat_id=chat_id, message_id=message_id, text=already_text(rec, rec))
            return answer('이미 처리된 요청입니다.')
        decision = 'reject' if action == 'rr' else 'exclude'
        ask = tg('sendMessage', chat_id=chat_id,
                 text=f"{ASK[decision]} 사유를 보내 주세요 — {KIND[kind]} {code} · {rec.get('name', '')}\n(이 메시지에 답장)",
                 reply_markup={'force_reply': True, 'input_field_placeholder': '사유'})
        if ask:
            ask_reason(chat_id, ask['message_id'], kind, code, decision)
        return answer('사유를 답장으로 보내 주세요.')

    status, body = decide((kind, code), 'approve', '', user)
    if status == 200:
        mark_decided(body)
        return answer(f'승인했습니다: {code}')
    if status == 409 and body.get('reason') == 'decided':
        tg('editMessageText', chat_id=chat_id, message_id=message_id, text=already_text(rec, body))
        return answer('이미 처리된 요청입니다.')
    return answer(f"처리하지 못했습니다: {body.get('message', status)}", alert=True)


def on_message(msg):
    chat, user, text = msg.get('chat', {}), msg.get('from', {}), (msg.get('text') or '').strip()
    if chat.get('type') != 'private':
        return
    chat_id, is_owner = chat['id'], user.get('id') in owners()

    if text.startswith('/start'):
        tg('sendMessage', chat_id=chat_id, text=(
            f"글로벌 DB 봇입니다.\n당신의 텔레그램 번호: {user.get('id')}\n"
            + ('승인 카드를 여기로 보냅니다. /help 를 보세요.' if is_owner
               else '승인자로 등록하려면 관리자에게 이 번호를 알려 주세요.')))
        return
    if not is_owner:
        tg('sendMessage', chat_id=chat_id, text='승인은 글로벌 DB 슈퍼관리자만 할 수 있습니다.')
        return

    reply_to = msg.get('reply_to_message')
    if reply_to:
        waiting = take_reason(chat_id, reply_to['message_id'])
        if waiting:
            if not text:
                ask_reason(chat_id, reply_to['message_id'], waiting['kind'], waiting['code'], waiting['decision'])
                tg('sendMessage', chat_id=chat_id, text='사유를 글로 보내 주세요.')
                return
            status, body = decide((waiting['kind'], waiting['code']), waiting['decision'], text, user)
            if status == 200:
                mark_decided(body)
                tg('sendMessage', chat_id=chat_id, text=f"{ASK[waiting['decision']]} 처리했습니다: {waiting['code']} · {body.get('name', '')}")
            elif status == 409 and body.get('reason') == 'decided':
                tg('sendMessage', chat_id=chat_id, text=already_text({'kind': waiting['kind'], 'code': waiting['code']}, body))
            else:
                tg('sendMessage', chat_id=chat_id, text=f"처리하지 못했습니다: {body.get('message', status)}")
            return

    if text.startswith('/pending'):
        status, rows = core('/internal/pending')
        if status != 200:
            tg('sendMessage', chat_id=chat_id, text=f'목록을 가져오지 못했습니다 ({status}).')
            return
        if not rows:
            tg('sendMessage', chat_id=chat_id, text='승인 대기가 없습니다.')
            return
        rows = sorted(rows, key=lambda r: (r.get('regRequest') or {}).get('at', ''))
        tg('sendMessage', chat_id=chat_id, text=f'📋 승인 대기 {len(rows)}건'
           + (f' — 오래된 {MAX_PENDING_CARDS}건 카드를 보냅니다' if len(rows) > MAX_PENDING_CARDS else ''))
        for row in rows[:MAX_PENDING_CARDS]:
            send_card(row, [chat_id], force=True)
        return
    tg('sendMessage', chat_id=chat_id, text=HELP)


def _header(event, name):
    headers = (event.get('params') or {}).get('header') or {}
    return next((v for k, v in headers.items() if k.lower() == name.lower()), '')


def lambda_handler(event, context):
    action = event.get('action')
    if action:                                   # dsglobaldbCreate · EventBridge 에서 직접
        try:
            if action == 'card':
                send_card(event['row'])
            elif action == 'decided':
                mark_decided(event['row'])
            elif action == 'morning':
                morning()
        except Exception as e:  # noqa: BLE001
            print(f'봇 작업 실패 action={action}: {type(e).__name__} {e}')
        return {'ok': True}

    # 텔레그램 webhook — 실패해도 200 (텔레그램이 같은 업데이트를 계속 다시 보내지 않도록)
    if _header(event, 'X-Telegram-Bot-Api-Secret-Token') != os.environ.get('WEBHOOK_SECRET') or not os.environ.get('WEBHOOK_SECRET'):
        print('webhook secret 불일치 — 무시')
        return {'statusCode': 403, 'body': '{}'}
    update = event.get('body-json') or {}
    try:
        if 'callback_query' in update:
            on_callback(update['callback_query'])
        elif 'message' in update:
            on_message(update['message'])
    except Exception as e:  # noqa: BLE001
        print(f"업데이트 처리 실패 {update.get('update_id')}: {type(e).__name__} {e}")
    return {'statusCode': 200, 'body': '{}'}
