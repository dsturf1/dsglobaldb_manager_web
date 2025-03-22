import React, { useEffect } from 'react';
import { NumberInput, TextInput, UnitInput } from '../components/DSInputs';

export default function EditChemicalDialog({ 
  isOpen, 
  onClose, 
  chemical, 
  onSave,
  filterOptions 
}) {
  const [editedData, setEditedData] = React.useState(null);

  useEffect(() => {
    if (chemical) {
      setEditedData(chemical);
    }
  }, [chemical]);

  const handleChange = (field, value) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSave(editedData);
    onClose();
  };

  if (!isOpen || !chemical || !editedData) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">약품 정보 수정</h3>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">중요도</span>
              </label>
              <select 
                className="select select-bordered"
                value={editedData.infoL3}
                onChange={(e) => handleChange('infoL3', e.target.value)}
              >
                {filterOptions.infoL3.filter(opt => opt !== 'all').map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">대분류</span>
              </label>
              <select 
                className="select select-bordered"
                value={editedData.infoL2}
                onChange={(e) => handleChange('infoL2', e.target.value)}
              >
                {filterOptions.infoL2.filter(opt => opt !== 'all').map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">중분류</span>
              </label>
              <select 
                className="select select-bordered"
                value={editedData.infoL1}
                onChange={(e) => handleChange('infoL1', e.target.value)}
              >
                {filterOptions.infoL1.filter(opt => opt !== 'all').map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">제품명</span>
              </label>
              <TextInput
                value={editedData.name}
                onChange={(value) => handleChange('name', value)}
                className="input input-bordered"
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">용량</span>
              </label>
              <UnitInput
                value={editedData.unit}
                onChange={(value) => handleChange('unit', value)}
                className="input input-bordered"
                classNameUnit="select select-bordered"
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">구입가</span>
              </label>
              <NumberInput
                value={editedData.IN_PRICE}
                onChange={(value) => handleChange('IN_PRICE', value)}
                className="input input-bordered"
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">용역판가</span>
              </label>
              <NumberInput
                value={editedData.OUT_PRICE}
                onChange={(value) => handleChange('OUT_PRICE', value)}
                className="input input-bordered"
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">판가</span>
              </label>
              <NumberInput
                value={editedData.OUT_PRICE1}
                onChange={(value) => handleChange('OUT_PRICE1', value)}
                className="input input-bordered"
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">상태</span>
              </label>
              <select 
                className="select select-bordered"
                value={editedData.active}
                onChange={(e) => handleChange('active', e.target.value)}
              >
                <option value="Y">사용</option>
                <option value="N">미사용</option>
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">방제팀</span>
              </label>
              <select 
                className="select select-bordered"
                value={editedData.flgWork}
                onChange={(e) => handleChange('flgWork', e.target.value)}
              >
                <option value="Y">사용</option>
                <option value="N">미사용</option>
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">용역팀</span>
              </label>
              <select 
                className="select select-bordered"
                value={editedData.flgOut}
                onChange={(e) => handleChange('flgOut', e.target.value)}
              >
                <option value="Y">사용</option>
                <option value="N">미사용</option>
              </select>
            </div>
          </div>

          <div className="modal-action">
            <button type="submit" className="btn btn-primary">저장</button>
            <button type="button" className="btn" onClick={onClose}>취소</button>
          </div>
        </form>
      </div>
    </dialog>
  );
} 