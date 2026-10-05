import React, { useState, useEffect } from 'react';
import { useGlobalComponent } from '../context/GlobalComponentContext';
import { NumberInput, UnitInput } from '../components/DSInputs';
import { previewChemicalCode, createChemical, describeSimilar } from '../utils/globaldbCreateApi';

/**
 * 신규 약품 추가. 코드는 서버(POST /dschemical/create)가 정한다 — 이미 있는 코드를 덮어쓰지 않음.
 * 입력 중에는 GET /dschemical/next-code 로 예상 코드와 비슷한 이름을 미리 보여준다.
 * 비슷한 이름이나 같은 이름·같은 용량이 있으면 서버가 409 를 주고, 사용자가 확인하면 confirmSimilar 로 다시 보낸다.
 * 서버가 origin: 'local', createdAt 을 붙인다 → 이카운트 비교의 '이카운트 미등록'에 나옴.
 */
const EMPTY_FORM = {
  infoL3: '중요도1',
  infoL2: '농약',
  infoL1: '살균제',
  name: '',
  unit: '0ｇ',
  IN_PRICE: 0,
  OUT_PRICE: 0,
  OUT_PRICE1: 0,
  active: 'Y',
  flgWork: 'Y',
  flgOut: 'Y'
};

export default function AddChemicalDialog({ isOpen, onClose }) {
  const { setGlobalChemicals } = useGlobalComponent();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [preview, setPreview] = useState(null);       // { dsids, sameName, sameUnit, similar }
  const [previewError, setPreviewError] = useState('');

  // 입력이 멈추면 서버에서 예상 코드와 비슷한 이름을 받아온다
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await previewChemicalCode({ infoL1: form.infoL1, name: form.name.trim(), unit: form.unit });
        if (!cancelled) {
          setPreview(result);
          setPreviewError('');
        }
      } catch (err) {
        if (!cancelled) setPreviewError(err.message);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, form.infoL1, form.name, form.unit]);

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setPreview(null);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    setIsSaving(true);
    try {
      let { status, body } = await createChemical(form);
      if (status === 409 && body.reason === 'similar') {
        if (!window.confirm(`${describeSimilar(body)}\n\n그래도 새 약품으로 추가하시겠습니까?`)) return;
        ({ status, body } = await createChemical(form, { confirmSimilar: true }));
      }
      if (status !== 201) {
        alert(`추가하지 못했습니다: ${body?.message || status}`);
        return;
      }
      setGlobalChemicals(prev => [...prev, body]);
      alert(`추가했습니다: ${body.dsids} ${body.name}`);
      handleClose();
    } catch (error) {
      console.error('Failed to add chemical:', error);
      alert(`추가 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <dialog className={`modal ${isOpen ? 'modal-open' : ''}`}>
      <div className="modal-box max-w-3xl">
        <h3 className="font-bold text-lg mb-4">신규 약품 추가</h3>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">중요도</label>
              <select
                className="select select-bordered w-full"
                value={form.infoL3}
                onChange={(e) => setForm(prev => ({ ...prev, infoL3: e.target.value }))}
              >
                <option value="중요도1">중요도1</option>
                <option value="중요도2">중요도2</option>
                <option value="중요도3">중요도3</option>
                <option value="중요도4">중요도4</option>
                <option value="중요도5">중요도5</option>
              </select>
            </div>

            <div>
              <label className="label">대분류</label>
              <select
                className="select select-bordered w-full"
                value={form.infoL2}
                onChange={(e) => setForm(prev => ({ 
                  ...prev, 
                  infoL2: e.target.value,
                  infoL1: e.target.value === '농약' ? '살균제' : 
                         e.target.value === '비료' ? '비료' : 
                         e.target.value === '잔디' ? '잔디' :
                         e.target.value === '기타물품' ? '기타물품' : '기타약재'
                }))}
              >
                <option value="농약">농약</option>
                <option value="비료">비료</option>
                <option value="기타약재">기타약재</option>
                <option value="잔디">잔디</option>
                <option value="기타물품">기타물품</option>
              </select>
            </div>

            <div>
              <label className="label">중분류</label>
              <select
                className="select select-bordered w-full"
                value={form.infoL1}
                onChange={(e) => setForm(prev => ({ ...prev, infoL1: e.target.value }))}
              >
                {form.infoL2 === '농약' ? (
                  <>
                    <option value="살균제">살균제</option>
                    <option value="살충제">살충제</option>
                    <option value="제초제">제초제</option>
                  </>
                ) : form.infoL2 === '비료' ? (
                  <option value="비료">비료</option>
                ) : form.infoL2 === '잔디' ? (
                  <option value="잔디">잔디</option>
                ) : form.infoL2 === '기타물품' ? (
                  <option value="기타물품">기타물품</option>
                ) : (
                  <option value="기타약재">기타약재</option>
                )}
              </select>
            </div>

            <div>
              <label className="label">제품명</label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="label">용량</label>
              <UnitInput
                value={form.unit}
                onChange={(value) => setForm(prev => ({ ...prev, unit: value }))}
                className="input input-bordered w-full"
                classNameUnit="select select-bordered w-20"
              />
            </div>

            <div>
              <label className="label">구입가</label>


              <NumberInput
                value={form.IN_PRICE}
                onChange={(e) => setForm(prev => ({ ...prev, IN_PRICE: Number(e) }))}
                className="input input-bordered w-full text-right"
              />

            </div>

            <div>
              <label className="label">용역판가</label>

              <NumberInput
                value={form.OUT_PRICE}
                onChange={(e) => setForm(prev => ({ ...prev, OUT_PRICE: Number(e) }))}
                                className="input input-bordered  w-full text-right"
              />
            </div>

            <div>
              <label className="label">판가</label>

              <NumberInput
                value={form.OUT_PRICE1}
                onChange={(e) => setForm(prev => ({ ...prev, OUT_PRICE1: Number(e) }))}
                                className="input input-bordered w-full text-right"
              />
            </div>

            <div>
              <label className="label">예상 코드</label>
              <div className="text-lg font-mono bg-base-200 p-2 rounded" title="저장할 때 서버가 확정합니다">
                {preview?.dsids || '…'}
              </div>
            </div>
          </div>

          <SimilarHint preview={form.name.trim() ? preview : null} error={previewError} />

          <div className="modal-action">
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  저장 중...
                </>
              ) : (
                '저장'
              )}
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleClose}
              disabled={isSaving}
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

// 같은 이름(다른 용량 추가) 안내 + 같은 용량·비슷한 이름 경고
function SimilarHint({ preview, error }) {
  if (error) return <p className="text-xs text-error mt-3">미리보기를 불러오지 못했습니다: {error}</p>;
  if (!preview) return null;
  const { sameName = [], sameUnit, similar = [] } = preview;
  if (sameName.length === 0 && similar.length === 0) return null;
  return (
    <div className="mt-4 space-y-2 text-sm">
      {sameName.length > 0 && (
        <div className={`alert ${sameUnit ? 'alert-warning' : 'alert-info'} block py-2`}>
          {sameUnit ? '같은 이름·같은 용량이 이미 있습니다. ' : '같은 이름의 다른 용량으로 추가됩니다. '}
          기존: {sameName.map(c => `${c.dsids} ${c.unit}`).join(', ')}
        </div>
      )}
      {similar.length > 0 && (
        <div className="alert alert-warning block py-2">
          <p className="font-semibold">비슷한 약품이 있습니다 — 저장할 때 한 번 더 확인합니다.</p>
          <ul className="list-disc ml-5">
            {similar.map(s => (
              <li key={s.name}>
                {s.name} <span className="text-xs">({s.reason}, {Math.round(s.score * 100)}%)</span>:{' '}
                {s.codes.map(c => `${c.dsids} ${c.unit}`).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}