import { useEffect, useState } from 'react';
import { CUSTOMER_CATEGORIES, CUSTOMER_TYPES, isValidBizNo, nextPersonCode } from './customerExcel';

/**
 * 거래처 신규 추가 (여기서 만든 거래처, origin=local → 이카운트 비교의 '이카운트 미등록'에 나옴).
 * - 법인: 거래처코드 = 사업자등록번호 10자리 (이카운트 관례)
 * - 개인: 거래처코드 = P00001 형식 자동 부여. 주민등록번호는 받지 않는다
 */
const EMPTY_FORM = {
  custType: 'corp',
  bizNo: '',
  name: '',
  ceo: '',
  bizType: '',
  bizItem: '',
  tel: '',
  email: '',
  category: '기타',
  memo: '',
};

export default function AddCustomerDialog({ isOpen, onClose, customers, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setForm(EMPTY_FORM);
  }, [isOpen]);

  if (!isOpen) return null;

  const isCorp = form.custType === 'corp';
  const bizNoDigits = form.bizNo.replace(/\D/g, '');
  const custcd = isCorp ? bizNoDigits : nextPersonCode(customers);
  const duplicate = custcd && customers.find(c => c.custcd === custcd);

  const codeError = isCorp && bizNoDigits.length !== 10
    ? '사업자등록번호 10자리를 입력하세요.'
    : duplicate ? `이미 있는 거래처코드입니다: ${duplicate.name}` : '';
  const codeWarning = isCorp && !codeError && !isValidBizNo(bizNoDigits)
    ? '사업자등록번호 검증번호가 맞지 않습니다. 번호를 다시 확인하세요.' : '';
  const canSave = !codeError && form.name.trim() && !isSaving;

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    if (codeWarning && !window.confirm(`${codeWarning}\n그래도 저장하시겠습니까?`)) return;

    const now = new Date().toISOString();
    const name = form.name.trim();
    setIsSaving(true);
    const ok = await onSave({
      custcd,
      custType: form.custType,
      name,
      ceo: isCorp ? form.ceo.trim() : name,
      bizType: isCorp ? form.bizType.trim() : '',
      bizItem: isCorp ? form.bizItem.trim() : '',
      tel: form.tel.trim(),
      email: form.email.trim(),
      aliases: [],
      category: form.category,
      active: 'Y',
      memo: form.memo,
      origin: 'local',
      createdAt: now,
      updatedAt: now,
    });
    setIsSaving(false);
    if (ok) onClose();
  };

  const input = (field, label, props = {}) => (
    <div>
      <label className="label">{label}</label>
      <input className="input input-bordered w-full" value={form[field]} onChange={set(field)} {...props} />
    </div>
  );

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-4">신규 거래처 추가</h3>
        <form onSubmit={handleSubmit}>
          <div role="tablist" className="tabs tabs-boxed mb-4 w-fit">
            {Object.entries(CUSTOMER_TYPES).map(([type, label]) => (
              <button
                key={type}
                type="button"
                role="tab"
                className={`tab ${form.custType === type ? 'tab-active' : ''}`}
                onClick={() => setForm(prev => ({ ...prev, custType: type }))}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {isCorp ? (
              <div className="col-span-2">
                {input('bizNo', '사업자등록번호 (거래처코드)', { placeholder: '123-45-67890', autoFocus: true })}
              </div>
            ) : (
              <div className="col-span-2">
                <label className="label">거래처코드 (자동)</label>
                <div className="input input-bordered w-full flex items-center bg-gray-50">{custcd}</div>
                <p className="text-xs text-gray-500 mt-1">개인은 주민등록번호를 저장하지 않습니다. 세금계산서용 번호는 이카운트에서 직접 입력하세요.</p>
              </div>
            )}
            {(codeError || codeWarning) && form.bizNo !== '' && (
              <p className={`col-span-2 text-sm ${codeError ? 'text-error' : 'text-warning'}`}>{codeError || codeWarning}</p>
            )}
            {!isCorp && codeError && <p className="col-span-2 text-sm text-error">{codeError}</p>}

            {input('name', isCorp ? '거래처명 (상호)' : '이름', { required: true })}
            {isCorp ? input('ceo', '대표자명') : <div />}
            {isCorp && input('bizType', '업태')}
            {isCorp && input('bizItem', '종목')}
            {input('tel', '전화')}
            {input('email', 'Email', { type: 'email' })}
            <div>
              <label className="label">분류</label>
              <select className="select select-bordered w-full" value={form.category} onChange={set('category')}>
                {CUSTOMER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">메모</label>
              <textarea className="textarea textarea-bordered w-full" rows={2} value={form.memo} onChange={set('memo')} />
            </div>
          </div>

          <div className="modal-action">
            <button type="button" className="btn" onClick={onClose} disabled={isSaving}>취소</button>
            <button type="submit" className="btn btn-primary" disabled={!canSave}>
              {isSaving ? '저장 중...' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
