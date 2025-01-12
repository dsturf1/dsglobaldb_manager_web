import React, { useState } from 'react';

const EquipmentDialog = ({ availableEquipments, selectedEquipments, onClose, onSave }) => {
  const [selected, setSelected] = useState([...selectedEquipments]);

  const sortedEquipments = [...availableEquipments].sort((a, b) => a.type.localeCompare(b.type));

  const handleToggleEquipment = (equipment) => {
    setSelected((prevSelected) => {
      if (prevSelected.includes(equipment)) {
        // 이미 선택된 경우 제거
        return prevSelected.filter((e) => e !== equipment);
      } else {
        // 선택되지 않은 경우 추가
        return [...prevSelected, equipment];
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
        <h2 className="text-xl font-bold mb-4">사용 장비 선택</h2>
        <div className="max-h-64 overflow-y-auto">
          {sortedEquipments.map((equipment) => (
            <label key={equipment.name} className="flex items-center mb-2">
              <input
                type="checkbox"
                checked={selected.includes(equipment)}
                onChange={() => handleToggleEquipment(equipment)}
                className="mr-2"
              />
              <span className="ml-2">{equipment.name} ({equipment.type})</span>
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

export default EquipmentDialog;
