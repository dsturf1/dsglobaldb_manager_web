import { useEffect, useMemo, useState } from 'react';
import { fetchRegRequests, fetchReviewer, reviewRequest } from '../utils/globaldbCreateApi';
import { APP_LABELS, isQuoteCustomerInUse, regBadges, requestSource } from '../utils/regStatus';
import RegRequestDetail from './RegRequestDetail';

/**
 * 등록 요청 (docs/gdb-request-registration-queue.md 4.4) — 재고·견적이 만든 품목·거래처 등록 요청과 결정.
 * 글로벌 DB 슈퍼관리자(서버 GDB_OWNER_EMAILS)로 로그인하면 승인·반려·이카운트 제외 버튼이 보인다 (4차).
 * 같은 결정을 글로벌 DB 봇 카드로도 할 수 있고, 어디서 결정하든 봇 카드는 결정 문구로 바뀐다.
 * 줄을 열면 증빙과 읽은 값을 보고, 오타는 [정보 수정]으로 고친다 (수정 API 그대로).
 */
const TABS = [
  { key: 'pending', label: '승인 대기', match: r => r.regStatus === 'requested' || (r.ecountStatus === 'pending' && r.regStatus !== 'rejected') },
  { key: 'evidence', label: '증빙 자동 등록', match: r => Boolean(r.regEvidence) },
  { key: 'approved', label: '승인', match: r => r.regStatus === 'approved' && r.ecountStatus === 'approved' },
  { key: 'closed', label: '반려·제외', match: r => r.regStatus === 'rejected' || r.ecountStatus === 'excluded' },
  { key: 'all', label: '전체', match: () => true },
];
const KIND_LABELS = { item: '품목', customer: '거래처' };
const DECISION_LABELS = { approve: '승인', reject: '반려', exclude: '이카운트 제외' };

// 줄의 상태에 따라 누를 수 있는 결정 (서버 _decide 와 같은 규칙)
const decisionsFor = (r) => {
  if (r.regStatus === 'requested') return ['approve', 'reject'];
  if (r.regStatus === 'approved' && r.ecountStatus === 'pending') return ['approve', 'exclude'];
  return [];
};
// 글로벌 DB 봇 카드와 같은 이름 (5차) — 증빙 없는 요청의 승인은 등록·이카운트 둘 다
const approveLabel = (r) => (r.regStatus === 'requested' ? '✅ 승인 (등록 + 이카운트)' : '✅ 이카운트 등록 승인');
const DECISION_BUTTONS = {
  approve: { label: approveLabel, className: 'btn-success' },
  reject: { label: () => '❌ 반려', className: 'btn-error' },
  exclude: { label: () => '🚫 이카운트 제외', className: 'btn-warning' },
};

const formatTime = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-');

export default function DSRegRequests() {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('pending');
  const [kind, setKind] = useState('all');
  const [app, setApp] = useState('all');
  const [opened, setOpened] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [deciding, setDeciding] = useState(null);

  useEffect(() => {
    fetchReviewer()
      .then(r => setIsOwner(Boolean(r.isOwner)))
      .catch(err => {
        console.warn('승인 권한 확인 실패:', err.message);
        setIsOwner(false);
      });
  }, []);

  const decide = async (r, decision) => {
    let comment = '';
    if (decision !== 'approve') {
      comment = window.prompt(`${DECISION_LABELS[decision]} 사유를 적어 주세요 — ${r.code} ${r.name}`) ?? '';
      if (!comment.trim()) return;
    } else if (!window.confirm(`${r.code} ${r.name}
${r.regStatus === 'requested'
    ? '등록과 이카운트 등록을 함께 승인하시겠습니까? 승인하면 요청한 앱에서 이 코드를 쓸 수 있습니다.'
    : '이카운트 등록을 승인하시겠습니까?'}`)) {
      return;
    }
    setDeciding(`${r.kind}-${r.code}`);
    try {
      const { status, body } = await reviewRequest({ kind: r.kind, code: r.code, decision, comment: comment.trim(),
        expectedUpdatedAt: r.updatedAt });
      if (status === 409 && body.reason === 'decided') {
        alert(`이미 처리된 요청입니다${body.regDecision?.by ? ` — ${body.regDecision.by}` : ''}.`);
      } else if (status === 409) {
        alert('그사이 다른 곳에서 고쳤습니다. 목록을 다시 불러왔으니 확인하고 다시 결정하세요.');
      } else if (status !== 200) {
        alert(`처리하지 못했습니다: ${body?.message || status}`);
      }
    } catch (err) {
      console.error('Failed to review:', err);
      alert(`처리 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setDeciding(null);
      load();
    }
  };

  const decisionButtons = (r, size = 'btn-xs') => decisionsFor(r).map(d => (
    <button key={d} className={`btn ${size} ${DECISION_BUTTONS[d].className} mr-1`} disabled={deciding !== null}
      onClick={(e) => { e.stopPropagation(); decide(r, d); }}>
      {DECISION_BUTTONS[d].label(r)}
    </button>
  ));

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const fresh = await fetchRegRequests();
      setRows(fresh);
      setOpened(prev => (prev ? fresh.find(r => r.kind === prev.kind && r.code === prev.code) || null : null));
    } catch (err) {
      console.error('Failed to load registration requests:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => rows.filter(r => (kind === 'all' || r.kind === kind) && (app === 'all' || r.regRequest?.app === app)),
    [rows, kind, app],
  );
  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t.key, filtered.filter(t.match).length])), [filtered]);
  const shown = filtered.filter(TABS.find(t => t.key === tab).match);

  return (
    <div className="p-4">
      <div className="flex items-center gap-4 mb-2">
        <h2 className="text-xl font-semibold">등록 요청</h2>
        <span className="badge badge-warning">승인 대기 {counts.pending ?? 0}</span>
        <button className="btn btn-outline btn-sm" onClick={load} disabled={isLoading}>
          {isLoading ? '불러오는 중...' : '새로고침'}
        </button>
      </div>
      <div className="alert alert-info text-sm py-2 mb-3">
        {isOwner
          ? '승인 대기 줄의 버튼으로 결정합니다. 글로벌 DB 봇 카드로도 할 수 있고, 먼저 한 결정만 남습니다.'
          : '승인은 글로벌 DB 슈퍼관리자가 글로벌 DB 봇이나 이 화면에서 합니다. 여기서는 요청과 결정을 보고, 오타만 고칩니다.'}
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-3">
        <div role="tablist" className="tabs tabs-boxed">
          {TABS.map(t => (
            <button key={t.key} role="tab" className={`tab ${tab === t.key ? 'tab-active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label} ({counts[t.key] ?? 0})
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          종류
          <select className="select select-bordered select-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">전체</option>
            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          앱
          <select className="select select-bordered select-sm" value={app} onChange={(e) => setApp(e.target.value)}>
            <option value="all">전체</option>
            {Object.entries(APP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="alert alert-error text-sm mb-3">{error}</div>}

      <div className="overflow-x-auto">
        <table className="table table-zebra table-sm w-full">
          <thead>
            <tr>
              <th>요청 시각</th>
              <th>앱</th>
              <th>요청자</th>
              <th>종류</th>
              <th>코드</th>
              <th>이름</th>
              <th>용량/사업자번호</th>
              <th>분류</th>
              <th>증빙</th>
              <th>상태</th>
              <th>결정</th>
              {isOwner && <th>승인</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={`${r.kind}-${r.code}`} className="cursor-pointer hover:bg-gray-100" onClick={() => setOpened(r)}>
                <td className="text-xs whitespace-nowrap">{formatTime(r.regRequest?.at)}</td>
                <td className="text-xs">{requestSource(r.regRequest)}</td>
                <td className="text-xs">{r.regRequest?.by || '-'}</td>
                <td className="text-xs">{KIND_LABELS[r.kind]}</td>
                <td className="text-xs">{r.code}</td>
                <td className="text-sm">{r.name}</td>
                <td className="text-xs">{r.kind === 'item' ? r.unit : r.bizNo || '개인'}</td>
                <td className="text-xs">{r.kind === 'item' ? r.infoL1 : r.category}</td>
                <td className="text-xs">
                  {r.regEvidence ? (
                    <a className="link link-primary" href={r.regEvidence.viewUrl} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}>
                      {r.regEvidence.docType} 보기
                    </a>
                  ) : '-'}
                </td>
                <td className="text-xs">
                  {regBadges({ ...r, origin: 'local' }).map(b => (
                    <span key={b.label} className={`badge badge-xs mr-1 ${b.className}`} title={b.title}>{b.label}</span>
                  ))}
                  {r.active === 'N' && r.regStatus !== 'rejected' && <span className="badge badge-xs badge-error">미사용</span>}
                  {isQuoteCustomerInUse(r) && (
                    <span className="badge badge-xs badge-info" title="견적은 거래처를 승인 대기에도 이 코드로 씁니다 (6차 개정)">
                      견적에서 사용 중
                    </span>
                  )}
                </td>
                <td className="text-xs">
                  {r.regDecision
                    ? `${DECISION_LABELS[r.regDecision.decision] || ''} · ${r.regDecision.by}${r.regDecision.comment ? ` · ${r.regDecision.comment}` : ''}`
                    : '-'}
                </td>
                {isOwner && <td className="whitespace-nowrap">{decisionButtons(r)}</td>}
              </tr>
            ))}
            {!isLoading && shown.length === 0 && (
              <tr><td colSpan={isOwner ? 12 : 11} className="text-center text-gray-400 py-8">요청이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <RegRequestDetail request={opened} onClose={() => setOpened(null)} onChanged={load}
        decisionButtons={isOwner && opened ? decisionButtons(opened, 'btn-sm') : null} />
    </div>
  );
}
