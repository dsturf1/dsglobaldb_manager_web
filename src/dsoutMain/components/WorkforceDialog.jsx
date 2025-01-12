import React, { useState, useMemo } from 'react';
import { useBase } from '../../context/BaseContext';

const WorkforceDialog = ({ availableWorkforces, selectedWorkforces, onClose, onSave }) => {
  const { dsrankOrder } = useBase();
  const [selected, setSelected] = useState([...selectedWorkforces]);

  // Rank와 Name으로 정렬된 작업 인력 목록 생성
  const sortedWorkforces = useMemo(() => {
    return [...availableWorkforces].sort((a, b) => {
      const rankA = dsrankOrder.indexOf(a.rank);
      const rankB = dsrankOrder.indexOf(b.rank);

      if (rankA === rankB) {
        return a.name.localeCompare(b.name);
      }
      return rankA - rankB;
    });
  }, [availableWorkforces, dsrankOrder]);

  const handleToggleWorker = (worker) => {
    setSelected((prevSelected) => {
      if (prevSelected.some((w) => w.name === worker.name)) {
        // 이미 선택된 경우 제거
        return prevSelected.filter((w) => w.name !== worker.name);
      } else {
        // 선택되지 않은 경우 추가
        return [...prevSelected, worker];
      }
    });
  };

  const handleSave = () => {
    onSave(selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded shadow-lg w-96">
        <h2 className="text-xl font-bold mb-4">작업 인력 선택</h2>
        <div className="max-h-64 overflow-y-auto">
          {sortedWorkforces.map((worker) => (
            <label key={worker.name} className="flex items-center mb-2">
              <input
                type="checkbox"
                checked={selected.some((w) => w.name === worker.name)}
                onChange={() => handleToggleWorker(worker)}
                className="mr-2"
              />
              <span className="ml-2">{worker.name} ({worker.rank})</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end space-x-2">
          <button
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
            onClick={onClose}
          >
            취소
          </button>
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={handleSave}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkforceDialog;
