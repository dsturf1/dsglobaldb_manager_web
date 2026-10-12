import { useEffect, useMemo, useState } from 'react';
import { fetchRegRequests } from '../utils/globaldbCreateApi';
import { APP_LABELS, regBadges, requestSource } from '../utils/regStatus';
import RegRequestDetail from './RegRequestDetail';

/**
 * 등록 요청 (docs/gdb-request-registration-queue.md 4.4) — 보기 전용.
 * 모든 앱(재고·견적·이 웹)이 만든 품목·거래처 등록 요청과 결정. 승인은 재고 슈퍼관리자가 재고 봇·재고 웹에서 한다.
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

const formatTime = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-');

export default function DSRegRequests() {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('pending');
  const [kind, setKind] = useState('all');
  const [app, setApp] = useState('all');
  const [opened, setOpened] = useState(null);

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
        승인은 재고 시스템 슈퍼관리자가 재고 봇·재고 웹에서 합니다. 여기서는 요청과 결정을 보고, 오타만 고칩니다.
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
                </td>
                <td className="text-xs">
                  {r.regDecision
                    ? `${DECISION_LABELS[r.regDecision.decision] || ''} · ${r.regDecision.by}${r.regDecision.comment ? ` · ${r.regDecision.comment}` : ''}`
                    : '-'}
                </td>
              </tr>
            ))}
            {!isLoading && shown.length === 0 && (
              <tr><td colSpan={11} className="text-center text-gray-400 py-8">요청이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <RegRequestDetail request={opened} onClose={() => setOpened(null)} onChanged={load} />
    </div>
  );
}
