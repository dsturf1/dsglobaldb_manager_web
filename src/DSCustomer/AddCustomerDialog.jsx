import { useEffect, useState } from 'react';
import { CUSTOMER_CATEGORIES, CUSTOMER_TYPES, isValidBizNo, nextPersonCode } from './customerExcel';
import { createCustomer } from '../utils/globaldbCreateApi';

/**
 * 거래처 신규 추가 — 서버(POST /dscustomer/create)가 저장한다. 이미 있는 코드는 덮어쓰지 않음.
 * 서버가 origin: 'local', createdAt 을 붙인다 → 이카운트 비교의 '이카운트 미등록'에 나옴.
 * - 법인: 거래처코드 = 사업자등록번호 10자리 (이카운트 관례). 이미 있으면 409
 * - 개인: 거래처코드 = P00001 형식, 서버가 순번을 정한다. 주민등록번호는 받지 않는다
 * 화면의 중복·검증 표시는 빠른 안내용이고, 최종 판단은 서버가 한다.
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

export default function AddCustomerDialog({ isOpen, onClose, customers, onCreated }) {
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

    setIsSaving(true);
    try {
      const { status, body } = await createCustomer({
        custType: form.custType,
        bizNo: isCorp ? bizNoDigits : undefined,
        allowInvalidBizNo: Boolean(codeWarning),   // 위에서 확인을 받은 경우만
        name: form.name.trim(),
        ceo: form.ceo,
        bizType: form.bizType,
        bizItem: form.bizItem,
        tel: form.tel,
        email: form.email,
        category: form.category,
        memo: form.memo,
      });
      if (status === 409) {
        alert(`이미 있는 거래처입니다: ${body.existing?.name || ''} (${body.existing?.custcd || custcd})`);
        return;
      }
      if (status !== 201) {
        alert(`추가하지 못했습니다: ${body?.message || status}`);
        return;
      }
      onCreated(body);
      alert(`추가했습니다: ${body.custcd} ${body.name}`);
      onClose();
    } catch (err) {
      console.error('Failed to create customer:', err);
      alert(`추가 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
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
                <label className="label">거래처코드 (예상 · 저장할 때 서버가 확정)</label>
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
