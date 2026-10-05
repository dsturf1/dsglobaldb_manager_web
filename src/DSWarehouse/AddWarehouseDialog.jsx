import { useEffect, useState } from 'react';
import { WAREHOUSE_TYPES, suggestWarehouseCode } from './warehouseExcel';
import { createWarehouse } from '../utils/globaldbCreateApi';

/**
 * 창고 신규 추가 — 서버(POST /dswarehouse/create)가 저장한다.
 * 창고코드는 이카운트처럼 직접 정한다(제안값: 3자리 최대 + 1). 같은 코드나 같은 창고명이 있으면 서버가 409로 거부.
 * 서버가 origin: 'local', createdAt 을 붙인다 → 엑셀 비교의 '이카운트 미등록'에 나옴.
 */
export default function AddWarehouseDialog({ isOpen, onClose, warehouses, onCreated }) {
  const [form, setForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 추가사업장명은 지금 모든 창고가 같은 값이라 그 값을 기본으로
      const site = warehouses.find(w => w.site)?.site || '';
      setForm({ whcd: suggestWarehouseCode(warehouses), name: '', whType: '창고', site, memo: '' });
    }
  }, [isOpen, warehouses]);

  if (!isOpen || !form) return null;

  const code = form.whcd.trim();
  const codeTaken = warehouses.find(w => w.whcd === code);
  const nameTaken = warehouses.find(w => w.name.replace(/\s/g, '') === form.name.replace(/\s/g, '') && form.name.trim());
  const canSave = /^[0-9A-Za-z]{1,10}$/.test(code) && form.name.trim() && !codeTaken && !nameTaken && !isSaving;
  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    try {
      const { status, body } = await createWarehouse({ ...form, whcd: code, name: form.name.trim() });
      if (status === 409) {
        alert(`${body.message}: ${body.existing?.whcd} ${body.existing?.name}`);
        return;
      }
      if (status !== 201) {
        alert(`추가하지 못했습니다: ${body?.message || status}`);
        return;
      }
      onCreated(body);
      onClose();
    } catch (err) {
      console.error('Failed to create warehouse:', err);
      alert(`추가 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-xl">
        <h3 className="font-bold text-lg mb-4">신규 창고 추가</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">창고코드</label>
            <input className="input input-bordered w-full" value={form.whcd} onChange={set('whcd')} autoFocus />
          </div>
          <div>
            <label className="label">구분</label>
            <select className="select select-bordered w-full" value={form.whType} onChange={set('whType')}>
              {WAREHOUSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">창고명</label>
            <input className="input input-bordered w-full" value={form.name} onChange={set('name')} placeholder="예: 용역 신규골프장" required />
          </div>
          <div className="col-span-2">
            <label className="label">추가사업장명</label>
            <input className="input input-bordered w-full" value={form.site} onChange={set('site')} />
          </div>
          <div className="col-span-2">
            <label className="label">메모</label>
            <textarea className="textarea textarea-bordered w-full" rows={2} value={form.memo} onChange={set('memo')} />
          </div>
          {(codeTaken || nameTaken) && (
            <p className="col-span-2 text-sm text-error">
              {codeTaken ? `이미 있는 창고코드입니다: ${codeTaken.name}` : `같은 이름의 창고가 있습니다: ${nameTaken.whcd} ${nameTaken.name}`}
            </p>
          )}
          <p className="col-span-2 text-xs text-gray-500">
            약품과 방제 기본정보는 창고를 <b>창고명</b>으로 연결합니다. 이카운트에 등록할 이름과 똑같이 입력하세요.
          </p>
          <div className="modal-action col-span-2">
            <button type="button" className="btn" onClick={onClose} disabled={isSaving}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={!canSave}>{isSaving ? '저장 중...' : '추가'}</button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
