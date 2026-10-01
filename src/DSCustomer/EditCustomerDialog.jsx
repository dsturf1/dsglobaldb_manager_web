import { useEffect, useState } from 'react';
import { CUSTOMER_CATEGORIES, FIELD_LABELS, formatAliases } from './customerExcel';

/**
 * 거래처 편집. 이카운트 필드는 읽기 전용(엑셀 비교로만 갱신), DB 관리 필드(분류/사용/메모)만 수정.
 */
export default function EditCustomerDialog({ customer, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(customer ? { category: '기타', active: 'Y', memo: '', ...customer } : null);
  }, [customer]);

  if (!customer || !form) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const ok = await onSave({ ...form, updatedAt: new Date().toISOString() });
    setIsSaving(false);
    if (ok) onClose();
  };

  const readOnlyRows = [
    ['custcd', customer.custcd],
    ['name', customer.name],
    ['ceo', customer.ceo],
    ['bizType', customer.bizType],
    ['bizItem', customer.bizItem],
    ['tel', customer.tel],
    ['email', customer.email],
    ['aliases', formatAliases(customer.aliases)],
  ];

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-4">거래처 정보</h3>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-sm mb-4">
            {readOnlyRows.map(([field, value]) => (
              <div key={field} className="contents">
                <span className="text-gray-500">{FIELD_LABELS[field]}</span>
                <span className="break-all">{value || '-'}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mb-4">위 항목은 이카운트 엑셀 비교로만 바뀝니다.</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">분류</label>
              <select
                className="select select-bordered w-full"
                value={form.category}
                onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
              >
                {CUSTOMER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">사용</label>
              <select
                className="select select-bordered w-full"
                value={form.active}
                onChange={(e) => setForm(prev => ({ ...prev, active: e.target.value }))}
              >
                <option value="Y">사용</option>
                <option value="N">미사용</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">메모</label>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={3}
                value={form.memo}
                onChange={(e) => setForm(prev => ({ ...prev, memo: e.target.value }))}
              />
            </div>
          </div>

          <div className="modal-action">
            <button type="button" className="btn" onClick={onClose} disabled={isSaving}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
