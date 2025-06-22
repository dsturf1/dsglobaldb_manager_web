import React, { useState, useRef, useEffect } from 'react';
import { useGlobalComponent } from '../context/GlobalComponentContext';
import { NumberInput, TextInput, UnitInput } from '../components/DSInputs';

export default function AddChemicalDialog({ isOpen, onClose }) {
  const { addGlobalChemical, globalChemicals } = useGlobalComponent();
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [editedCode, setEditedCode] = useState('');
  const [form, setForm] = useState({
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
  });

  const getPreviewCode = () => {
    if (editedCode !== '') {
      return editedCode;
    }
    // 분류에 따른 prefix 결정
    const getPrefix = () => {
      switch (form.infoL1) {
        case '살균제': return 'A1';
        case '살충제': return 'A2';
        case '제초제': return 'A3';
        case '비료': return 'B0';
        case '기타약재': return 'C0';
        case '잔디': return 'G0';
        case '기타물품': return 'D0';
        default: return 'X0';
      }
    };

    const prefix = getPrefix();
    const currentName = form.name.trim();

    // 1. 동일한 이름을 가진 항목들 찾기
    const sameNameItems = globalChemicals.filter(item => 
      item.name.trim() === currentName
    );

    if (sameNameItems.length > 0) {

    // 동일한 이름이 있는 경우: 해당 항목들의 코드 중 가장 큰  숫자 + 1
    const maxNumber = Math.max(...sameNameItems.map(item => 
      parseInt(item.dsids.slice(prefix.length))
    ));
    return `${prefix}${(maxNumber + 1).toString().padStart(4, '0')}`;
    } else {
      // 동일한 이름이 없는 경우: 전체 항목 중 가장 큰 3자리 숫자 + 1
      const maxNumber = globalChemicals.length > 0 
        ? Math.max(...globalChemicals.map(item => parseInt(item.dsids.slice(-4, -1))))
        : 0;
      return `${prefix}${(maxNumber + 1).toString().padStart(3, '0')}0`;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return;

    setIsSaving(true);
    try {
      const newChemical = {
        ...form,
        dsids: getPreviewCode()
      };
      await addGlobalChemical(newChemical);
      onClose();
    } catch (error) {
      console.error('Failed to add chemical:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCodeDoubleClick = () => {
    setEditedCode(getPreviewCode());
    setIsEditingCode(true);
  };

  const handleCodeBlur = () => {
    setIsEditingCode(false);
  };

  const handleCodeChange = (e) => {
    setEditedCode(e.target.value);
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
              {isEditingCode ? (
                <input
                  type="text"
                  value={editedCode}
                  onChange={handleCodeChange}
                  onBlur={handleCodeBlur}
                  className="input input-bordered w-full font-mono"
                  autoFocus
                />
              ) : (
                <div 
                  className="text-lg font-mono bg-base-200 p-2 rounded cursor-pointer"
                  onDoubleClick={handleCodeDoubleClick}
                >
                  {getPreviewCode()}
                </div>
              )}
            </div>
          </div>
          
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
              onClick={onClose}
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