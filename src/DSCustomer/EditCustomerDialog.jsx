import { useEffect, useState } from 'react';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { CUSTOMER_CATEGORIES, FIELD_LABELS } from './customerExcel';
import { updateCustomer, updateCustomerAliases, fetchCustomerHistory } from './customerApi';

/**
 * 거래처 편집 — 외부 앱(재고 봇 등)과 같은 API를 쓴다 (docs/gdb-update-api-request.md).
 * - 정보 수정: 바뀐 필드만 POST /dscustomer/update. 불러온 뒤 다른 곳에서 고쳤으면 409 → 최신 내용을 다시 보여준다
 * - 별칭: POST /dscustomer/alias 로 바로 더하고 뺀다. 다른 거래처가 쓰는 이름이면 확인 후 force
 * - 변경 이력: GET /dscustomer/history
 * 이카운트에서 온 거래처의 거래처명·대표자·업태·종목을 고치면 '이카운트 반영 필요'로 표시된다.
 */
const EDIT_FIELDS = ['name', 'ceo', 'bizType', 'bizItem', 'tel', 'email', 'category', 'active', 'memo'];
const ECOUNT_EDIT_FIELDS = ['name', 'ceo', 'bizType', 'bizItem'];
const ACTION_LABELS = { update: '정보 수정', alias: '별칭' };

const toForm = (c) => Object.fromEntries(EDIT_FIELDS.map(f => [f, c[f] ?? (f === 'category' ? '기타' : f === 'active' ? 'Y' : '')]));

export default function EditCustomerDialog({ customer, onClose, onSaved }) {
  const [record, setRecord] = useState(null);     // 서버 기준 최신 레코드
  const [form, setForm] = useState(null);
  const [newAlias, setNewAlias] = useState('');
  const [history, setHistory] = useState([]);
  const [userTag, setUserTag] = useState('web');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setRecord(customer);
    setForm(customer ? toForm(customer) : null);
    setNewAlias('');
    if (customer) loadHistory(customer.custcd);
  }, [customer]);

  useEffect(() => {
    fetchUserAttributes()
      .then(attrs => setUserTag(`web:${attrs.email || attrs.sub}`))
      .catch(() => setUserTag('web'));
  }, []);

  const loadHistory = async (custcd) => {
    try {
      setHistory(await fetchCustomerHistory(custcd));
    } catch (err) {
      console.error('Failed to load history:', err);
      setHistory([]);
    }
  };

  // 서버가 돌려준 레코드로 화면·목록을 맞춘다
  const applyRecord = (saved, { resetForm = true } = {}) => {
    setRecord(saved);
    if (resetForm) setForm(toForm(saved));
    onSaved(saved);
    loadHistory(saved.custcd);
  };

  if (!record || !form) return null;

  const isEcount = record.origin === 'ecount';
  const changedFields = EDIT_FIELDS.filter(f => (form[f] ?? '').trim() !== (toForm(record)[f] ?? '').trim());
  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (changedFields.length === 0) return onClose();
    setIsSaving(true);
    try {
      const { status, body } = await updateCustomer(record, Object.fromEntries(changedFields.map(f => [f, form[f]])), userTag);
      if (status === 409) {
        alert('다른 곳에서 먼저 고쳤습니다. 최신 내용을 다시 불러왔으니 확인하고 다시 고치세요.');
        applyRecord(body.current);
        return;
      }
      if (status !== 200) {
        alert(`저장하지 못했습니다: ${body?.message || status}`);
        return;
      }
      applyRecord(body);
      onClose();
    } catch (err) {
      console.error('Failed to update customer:', err);
      alert(`저장 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const changeAliases = async (change) => {
    setIsSaving(true);
    try {
      let { status, body } = await updateCustomerAliases(record.custcd, change, userTag);
      if (status === 409 && body.reason === 'aliasTaken') {
        const list = body.taken.map(t => `'${t.alias}' → ${t.name} (${t.custcd})`).join('\n');
        if (!window.confirm(`다른 거래처가 같은 이름을 쓰고 있습니다.\n${list}\n\n그래도 이 거래처 별칭으로 저장하시겠습니까?`)) return;
        ({ status, body } = await updateCustomerAliases(record.custcd, { ...change, force: true }, userTag));
      }
      if (status !== 200) {
        alert(`별칭을 저장하지 못했습니다: ${body?.message || status}`);
        return;
      }
      applyRecord(body, { resetForm: changedFields.length === 0 });   // 입력 중인 정보 수정은 유지
      setRecord(body);
      setNewAlias('');
    } catch (err) {
      console.error('Failed to update aliases:', err);
      alert(`별칭 저장 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const input = (field, props = {}) => (
    <div>
      <label className="label">
        {FIELD_LABELS[field]}
        {isEcount && ECOUNT_EDIT_FIELDS.includes(field) && <span className="text-xs text-gray-400">이카운트 항목</span>}
      </label>
      <input className="input input-bordered input-sm w-full" value={form[field]} onChange={set(field)} {...props} />
    </div>
  );

  const dirty = record.ecountDirtyFields || [];

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-3xl">
        <h3 className="font-bold text-lg mb-1">거래처 정보 — {record.custcd}</h3>
        <p className="text-xs text-gray-500 mb-3">
          마지막 수정 {record.updatedAt ? new Date(record.updatedAt).toLocaleString('ko-KR') : '-'}
          {record.updatedBy && ` · ${record.updatedBy}`}
        </p>
        {dirty.length > 0 && (
          <div className="alert alert-warning text-sm py-2 mb-3">
            이카운트 반영 필요: {dirty.map(f => FIELD_LABELS[f]).join(', ')} — 이카운트 거래처등록에서도 같게 고쳐 주세요.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {input('name', { required: true })}
            {input('ceo')}
            {input('bizType')}
            {input('bizItem')}
            {input('tel')}
            {input('email', { type: 'email' })}
            <div>
              <label className="label">분류</label>
              <select className="select select-bordered select-sm w-full" value={form.category} onChange={set('category')}>
                {CUSTOMER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">사용</label>
              <select className="select select-bordered select-sm w-full" value={form.active} onChange={set('active')}>
                <option value="Y">사용</option>
                <option value="N">미사용</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">메모</label>
              <textarea className="textarea textarea-bordered w-full" rows={2} value={form.memo} onChange={set('memo')} />
            </div>
          </div>
          {isEcount && changedFields.some(f => ECOUNT_EDIT_FIELDS.includes(f)) && (
            <p className="text-xs text-warning mt-1">이카운트 항목을 고치면 &lsquo;이카운트 반영 필요&rsquo;로 표시됩니다.</p>
          )}

          <div className="divider my-2">별칭 (현장 이름 등)</div>
          <div className="flex flex-wrap gap-2 mb-2">
            {(record.aliases || []).length === 0 && <span className="text-sm text-gray-400">별칭 없음</span>}
            {(record.aliases || []).map(a => (
              <span key={`${a.code}-${a.name}`} className={`badge gap-1 ${a.source === 'local' ? 'badge-info' : 'badge-ghost'}`}
                title={a.source === 'local' ? '여기서 붙인 별칭' : '이카운트 검색입력'}>
                {a.code ? `${a.code} ` : ''}{a.name}
                <button type="button" className="text-xs" disabled={isSaving}
                  onClick={() => window.confirm(`별칭 '${a.name}'을 빼시겠습니까?`) && changeAliases({ remove: [{ name: a.name }] })}>
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input input-bordered input-sm flex-1" placeholder="새 별칭 (예: 월송리)" value={newAlias}
              maxLength={40} onChange={(e) => setNewAlias(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newAlias.trim()) changeAliases({ add: [{ name: newAlias.trim() }] }); } }} />
            <button type="button" className="btn btn-sm" disabled={isSaving || !newAlias.trim()}
              onClick={() => changeAliases({ add: [{ name: newAlias.trim() }] })}>
              별칭 추가
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">별칭은 바로 저장됩니다. 이카운트 검색입력 별칭(회색)을 빼면 다음 엑셀 비교에서 다시 나타납니다.</p>

          <details className="mt-3">
            <summary className="text-sm cursor-pointer">변경 이력 ({history.length})</summary>
            <ul className="text-xs mt-2 space-y-1 max-h-40 overflow-y-auto">
              {history.map(h => (
                <li key={h.at + h.action}>
                  <span className="text-gray-500">{new Date(h.at).toLocaleString('ko-KR')} · {h.by} · {ACTION_LABELS[h.action] || h.action}</span>
                  {' — '}
                  {Object.entries(h.changes || {}).map(([f, [from, to]]) => (
                    <span key={f} className="mr-2">
                      {FIELD_LABELS[f] || f}: {Array.isArray(from) ? from.join(', ') : from || '-'} → {Array.isArray(to) ? to.join(', ') : to || '-'}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </details>

          <div className="modal-action">
            <button type="button" className="btn" onClick={onClose} disabled={isSaving}>닫기</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving || changedFields.length === 0}>
              {isSaving ? '저장 중...' : `저장${changedFields.length ? ` (${changedFields.length})` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
