import React, { useState } from 'react';
import { useGlobalComponent } from '../context/GlobalComponentContext'; 
import { useBase } from '../context/BaseContext';
import { NumberInput, TextInput, UnitInput } from '../components/DSInputs';

export default function AddWorkforceDialog({ isOpen, onClose }) {
  const { globalWorkforces, addGlobalWorkforce } = useGlobalComponent();
  const { dsOrgOrder, dsrankOrder, dsOrgList } = useBase();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    org: dsOrgOrder[0],
    rank: dsrankOrder[0],
    name: '',
    Email: '',
    category: '정규직',
    id: '',
    mapdscourseid: ''
  });

  


  const generateNewId = () => {
    const randomNum = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
    const newId = `DS${randomNum}`;
    globalWorkforces.forEach(workforce => {
      if (workforce.id === newId) {
        return generateNewId();
      }
    });
    return newId;
  };

  const getCategory = (rank) => {
    if (rank === '계약직') return '계약직';
    if (rank === '일용남') return '일용남';
    if (rank === '일용여') return '일용여';
    return '정규직';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return;

    setIsSaving(true);
    try {
      const selectedOrg = dsOrgList.find(item => item.org === form.org);
      const newWorkforce = {
        ...form,
        id: generateNewId(),
        category: getCategory(form.rank),
        mapdscourseid: selectedOrg.mapdscourseid
      };
      await addGlobalWorkforce(newWorkforce);
      onClose();
    } catch (error) {
      console.error('Failed to add workforce:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'rank' ? { category: getCategory(value) } : {})
    }));
  };

  if (!isOpen) return null;

  return (
    <dialog className={`modal ${isOpen ? 'modal-open' : ''}`}>
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-4">신규 인력 추가</h3>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">소속</label>
              <select
                name="org"
                className="select select-bordered w-full"
                value={form.org}
                onChange={(e) => {
                  const selectedOrg = dsOrgList.find(item => item.org === e.target.value);
                  setForm(prev => ({
                    ...prev,
                    org: selectedOrg.org,
                    mapdscourseid: selectedOrg.mapdscourseid
                  }));
                }}
              >
                {dsOrgList.map(item => (
                  <option key={item.org} value={item.org}>
                    {`${item.org}: ${item.mapdscourseid}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">직급</label>
              <select
                name="rank"
                className="select select-bordered w-full"
                value={form.rank}
                onChange={handleChange}
              >
                {dsrankOrder.map(rank => (
                  <option key={rank} value={rank}>{rank}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">이름</label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">이메일</label>
              <TextInput
                key={`email-${form.id}`}
                value={form.Email}
                // onChange={(value) => handleChange(value)}
                onChange={(e) => setForm(prev => ({ ...prev, Email: e }))}
                className="input input-bordered w-full"
              />
            </div>
            <div>
              <label className="label">분류</label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={form.category}
                disabled
              />
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