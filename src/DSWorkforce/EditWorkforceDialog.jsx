import React from 'react';
import { TextInput } from '../components/DSInputs';

export default function EditWorkforceDialog({ 
  isOpen, 
  onClose, 
  workforce, 
  onSave, 
  onChange,
  dsOrgOrder,
  dsrankOrder,
  isSaving 
}) {
  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">인력 정보 수정</h3>
        
        <div className="form-control gap-4">
          <div>
            <label className="label">
              <span className="label-text">코드</span>
            </label>
            <input 
              type="text" 
              value={workforce.id} 
              className="input input-bordered w-full" 
              disabled 
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text">소속</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={workforce.org}
              onChange={(e) => onChange('org', e.target.value)}
            >
              {dsOrgOrder.map(org => (
                <option key={org} value={org}>{org}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">
              <span className="label-text">이름</span>
            </label>
            <TextInput
              value={workforce.name}
              onChange={(value) => onChange('name', value)}
              className="input input-bordered w-full"
            />
          </div>

          <div>
            <label className="label">
              <span className="label-text">직급</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={workforce.rank}
              onChange={(e) => onChange('rank', e.target.value)}
            >
              {dsrankOrder.map(rank => (
                <option key={rank} value={rank}>{rank}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">
              <span className="label-text">이메일</span>
            </label>
            <TextInput
              value={workforce.Email}
              onChange={(value) => onChange('Email', value)}
              className="input input-bordered w-full"
            />
          </div>
        </div>

        <div className="modal-action">
          <button 
            className="btn btn-primary"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                저장 중...
              </>
            ) : '저장'}
          </button>
          <button 
            className="btn"
            onClick={onClose}
            disabled={isSaving}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
} 