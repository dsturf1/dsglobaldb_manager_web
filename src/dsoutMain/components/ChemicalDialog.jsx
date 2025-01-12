import React, { useState, useMemo } from 'react';
import { useBase } from '../../context/BaseContext';

const ChemicalDialog = ({ availableChemicals, selectedChemicals, onClose, onSave }) => {
  const { dstypeOrder } = useBase();
  const [selected, setSelected] = useState([...selectedChemicals]);
  const [searchTerm, setSearchTerm] = useState('');

  // 선택된 화학 물질을 제외하고, dstypeOrder에 따라 chemical infoL1을 먼저 정렬하고, 그다음 이름으로 정렬
  const sortedChemicals = useMemo(() => {
    const filteredChemicals = availableChemicals.filter(
      (chemical) => !selected.some((c) => c.dsids === chemical.dsids) &&
      (`${chemical.infoL1} - ${chemical.dsids} - ${chemical.name} (${chemical.unit})`.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return filteredChemicals.sort((a, b) => {
      const typeA = dstypeOrder.indexOf(a.infoL1);
      const typeB = dstypeOrder.indexOf(b.infoL1);

      if (typeA === typeB) {
        return a.name.localeCompare(b.name);
      }
      return typeA - typeB;
    });
  }, [availableChemicals, selected, dstypeOrder, searchTerm]);

  const handleToggleChemical = (chemical) => {
    setSelected((prevSelected) => {
      if (prevSelected.some((c) => c.dsids === chemical.dsids)) {
        return prevSelected.filter((c) => c.dsids !== chemical.dsids);
      } else {
        return [...prevSelected, chemical];
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
        <h2 className="text-xl font-bold mb-4">화학 물질 선택</h2>
        <input
          type="text"
          className="w-full p-2 border border-gray-300 rounded mb-4"
          placeholder="검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className="max-h-64 overflow-y-auto">
          {sortedChemicals.map((chemical) => (
            <label key={chemical.dsids} className="flex items-center mb-2 cursor-pointer">
              <input
                type="checkbox"
                className="mr-2"
                checked={selected.some((c) => c.dsids === chemical.dsids)}
                onChange={() => handleToggleChemical(chemical)}
              />
              <span className="ml-2">{chemical.infoL1} - {chemical.dsids} - {chemical.name} ({chemical.unit})</span>
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

export default ChemicalDialog;
