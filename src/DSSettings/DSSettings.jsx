import { useEffect, useRef, useState } from 'react';
import { fetchSettings, settingsAction } from '../utils/globaldbCreateApi';

/**
 * 설정 — 등록 승인자와 텔레그램 연결 (재고 앱 "설정 · 텔레그램 연결"과 같은 방식).
 * - 슈퍼관리자: 서버 환경 변수 GDB_OWNER_EMAILS. 여기서 빼거나 바꿀 수 없고, 승인자를 추가·빼기·초대할 수 있다.
 * - 승인자: 슈퍼관리자가 이메일(글로벌 DB 웹 로그인)과 이름으로 추가. 웹 "등록 요청"과 글로벌 DB 봇에서 승인한다.
 * - 텔레그램은 번호를 치지 않고, 한 번만 쓰는 링크(t.me/<봇>?start=<코드>)를 열어 [시작]을 누르면 연결된다.
 *   본인 링크는 10분, 슈퍼관리자가 만든 초대 링크는 48시간.
 */
const ROLE_LABELS = { owner: '슈퍼관리자', approver: '승인자' };

const formatTime = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '');

function TelegramChips({ links, onUnlink, disabled }) {
  if (!links?.length) return <span className="text-gray-400 text-sm">미연결</span>;
  return links.map(l => (
    <span key={l.telegramId} className="badge badge-info gap-1 mr-1" title={`연결 ${formatTime(l.linkedAt)} · 번호 ${l.telegramId}`}>
      ✈️ {l.username ? `@${l.username}` : l.tgName || l.telegramId}
      {onUnlink && (
        <button type="button" className="text-xs underline" disabled={disabled}
          onClick={() => window.confirm('이 텔레그램 연결을 끊을까요? 승인 카드를 더 받지 않습니다.') && onUnlink(l)}>
          끊기
        </button>
      )}
    </span>
  ));
}

function LinkBox({ link, title, note, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      window.prompt('링크를 복사하세요', link.url);
    }
  };
  return (
    <div className="border rounded-lg p-3 bg-base-200 mt-2">
      <div className="font-semibold text-sm mb-1">{title}</div>
      <div className="text-xs break-all bg-base-100 rounded p-2 mb-2 select-all">{link.url}</div>
      <div className="flex flex-wrap items-center gap-2">
        <a className="btn btn-primary btn-sm" href={link.url} target="_blank" rel="noreferrer">텔레그램 열기</a>
        <button type="button" className="btn btn-sm" onClick={copy}>{copied ? '복사됨' : '링크 복사'}</button>
        <span className="text-xs text-gray-500">{formatTime(link.expiresAt)}까지 · 한 번만 사용</span>
        {onClose && <button type="button" className="btn btn-ghost btn-xs ml-auto" onClick={onClose}>닫기</button>}
      </div>
      <p className="text-xs text-gray-500 mt-2">{note}</p>
    </div>
  );
}

export default function DSSettings() {
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [myLink, setMyLink] = useState(null);
  const [invite, setInvite] = useState(null);           // { link, name }
  const [form, setForm] = useState(null);               // { email, name, isNew }
  const pollRef = useRef(null);

  const load = async () => {
    try {
      setView(await fetchSettings());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    return () => clearInterval(pollRef.current);
  }, []);

  // 링크를 만든 뒤 3초마다 확인 — 텔레그램에서 [시작]을 누르면 바로 "연결됨"으로
  useEffect(() => {
    clearInterval(pollRef.current);
    if (!myLink && !invite) return undefined;
    const before = JSON.stringify((view?.approvers || []).map(a => a.telegram?.length || 0)) + (view?.me?.telegram?.length || 0);
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await fetchSettings();
        const after = JSON.stringify((fresh.approvers || []).map(a => a.telegram?.length || 0)) + (fresh.me?.telegram?.length || 0);
        if (after !== before) {
          setView(fresh);
          setMyLink(null);
          setInvite(null);
        }
      } catch { /* 다음에 다시 */ }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [myLink, invite]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (body, after) => {
    setBusy(true);
    try {
      const next = await settingsAction(body);
      setView(next);
      after?.(next);
      return next;
    } catch (err) {
      alert(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="p-4"><div className="alert alert-error text-sm">{error}</div></div>;
  if (!view) return <div className="p-4 text-gray-500">불러오는 중...</div>;

  const { me } = view;
  const isOwner = me.role === 'owner';

  const saveForm = async (e) => {
    e.preventDefault();
    const saved = await run({ action: 'saveApprover', email: form.email.trim(), name: form.name.trim() });
    if (!saved) return;
    const email = form.email.trim().toLowerCase();
    setForm(null);
    if (form.isNew && window.confirm('추가했습니다. 이 승인자의 텔레그램 초대 링크를 만들까요?')) {
      run({ action: 'linkCode', email }, next => setInvite({ link: next.link, name: form.name.trim() }));
    }
  };

  return (
    <div className="p-4 max-w-5xl">
      <h2 className="text-xl font-semibold mb-1">설정</h2>
      <p className="text-sm text-gray-500 mb-4">
        등록 승인자와 글로벌 DB 봇{view.botUsername && ` (@${view.botUsername})`} 연결을 관리합니다.
        승인자는 웹 &lsquo;등록 요청&rsquo; 화면과 봇 카드에서 품목·거래처 등록을 승인합니다.
      </p>

      <section className="mb-6">
        <h3 className="font-semibold mb-2">내 텔레그램 연결</h3>
        {!me.role ? (
          <p className="text-sm text-gray-500">{me.email} 은(는) 승인자가 아닙니다. 승인이 필요하면 슈퍼관리자에게 추가를 요청하세요.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-sm">{me.email}</span>
              <TelegramChips links={me.telegram} disabled={busy}
                onUnlink={l => run({ action: 'unlink', telegramId: String(l.telegramId) })} />
              <button type="button" className="btn btn-sm btn-outline" disabled={busy}
                onClick={() => run({ action: 'linkCode' }, next => setMyLink(next.link))}>
                연결 링크 만들기
              </button>
            </div>
            {myLink && (
              <LinkBox link={myLink} title="내 텔레그램 연결" onClose={() => setMyLink(null)}
                note={`휴대폰에서 링크를 열고 [시작]을 누르세요. ${view.linkMinutes}분 안에 한 번만 쓸 수 있고, 연결되면 이 화면이 바뀝니다.`} />
            )}
          </>
        )}
      </section>

      {me.role && (
        <section className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-semibold">승인자</h3>
            {isOwner && (
              <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                onClick={() => setForm({ email: '', name: '', isNew: true })}>
                + 승인자 추가
              </button>
            )}
          </div>
          {!isOwner && <p className="text-xs text-gray-500 mb-2">승인자 추가·빼기는 슈퍼관리자만 할 수 있습니다.</p>}
          <table className="table table-sm">
            <thead>
              <tr><th>이름</th><th>이메일</th><th>역할</th><th>텔레그램</th>{isOwner && <th />}</tr>
            </thead>
            <tbody>
              {view.approvers.map(a => (
                <tr key={a.email}>
                  <td>{a.name || <span className="text-gray-400">이름 없음</span>}</td>
                  <td className="text-sm">{a.email}</td>
                  <td>
                    <span className={`badge badge-sm ${a.role === 'owner' ? 'badge-warning' : 'badge-ghost'}`}>{ROLE_LABELS[a.role]}</span>
                    {a.email === me.email && <span className="badge badge-sm badge-outline ml-1">나</span>}
                  </td>
                  <td>
                    <TelegramChips links={a.telegram} disabled={busy}
                      onUnlink={isOwner ? l => run({ action: 'unlink', email: a.email, telegramId: String(l.telegramId) }) : null} />
                  </td>
                  {isOwner && (
                    <td className="whitespace-nowrap">
                      <button type="button" className="btn btn-xs mr-1" disabled={busy}
                        onClick={() => setForm({ email: a.email, name: a.name, isNew: false })}>이름</button>
                      <button type="button" className="btn btn-xs mr-1" disabled={busy}
                        onClick={() => run({ action: 'linkCode', email: a.email },
                          next => (a.email === me.email ? setMyLink(next.link) : setInvite({ link: next.link, name: a.name || a.email })))}>
                        + 초대 링크
                      </button>
                      {a.role !== 'owner' && (
                        <button type="button" className="btn btn-xs btn-error btn-outline" disabled={busy}
                          onClick={() => window.confirm(`${a.name || a.email} 을(를) 승인자에서 뺄까요? 텔레그램 연결도 끊깁니다.`)
                            && run({ action: 'removeApprover', email: a.email })}>
                          빼기
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-1">
            슈퍼관리자는 서버 설정(GDB_OWNER_EMAILS)으로 정하며 여기서 뺄 수 없습니다. 이름은 승인 기록에 남습니다.
          </p>

          {invite && (
            <LinkBox link={invite.link} title={`텔레그램 초대 — ${invite.name}`} onClose={() => setInvite(null)}
              note={`이 링크를 그 사람에게 보내 주세요. 받은 사람이 텔레그램에서 [시작]을 누르면 연결됩니다 (${view.inviteHours}시간 안에 한 번만).`} />
          )}
        </section>
      )}

      {isOwner && view.invites.length > 0 && (
        <section className="mb-6">
          <h3 className="font-semibold mb-2">아직 연결 안 된 초대</h3>
          <ul className="text-sm space-y-1">
            {view.invites.map(i => (
              <li key={i.codeId} className="flex items-center gap-2">
                <span>{i.name || i.email} ({i.email}) · {formatTime(i.expiresAt)}까지</span>
                <button type="button" className="btn btn-xs" disabled={busy}
                  onClick={() => run({ action: 'cancelInvite', codeId: i.codeId })}>초대 취소</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {form && (
        <dialog className="modal modal-open">
          <form className="modal-box max-w-md" onSubmit={saveForm}>
            <h3 className="font-bold text-lg mb-3">{form.isNew ? '승인자 추가' : '이름 바꾸기'}</h3>
            <label className="label"><span className="label-text">이메일 (글로벌 DB 웹 로그인)</span></label>
            <input className="input input-bordered w-full" type="email" required value={form.email} disabled={!form.isNew}
              onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} />
            <label className="label"><span className="label-text">이름 (승인 기록에 남음)</span></label>
            <input className="input input-bordered w-full" required maxLength={50} value={form.name} autoFocus={!form.isNew}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
            <div className="modal-action">
              <button type="button" className="btn" onClick={() => setForm(null)} disabled={busy}>취소</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{form.isNew ? '추가' : '저장'}</button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
