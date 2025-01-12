import React from 'react';
import { useDayRecord } from '../../context/DayRecordContext';
import { useBase } from '../../context/BaseContext';
import DayRecordTable from './DayRecordTable';
import { v4 as uuidv4 } from 'uuid';

const CategorySection = ({ category, records, onAddRecord, onDeleteRecord }) => (
  <div className="mb-8">
    <div className="flex items-center justify-between">
      <h2 className="text-2xl font-bold mb-2 border-b border-gray-400 pb-1">{category}</h2>
      <button
        className="bg-blue-500 text-white text-sm px-4 py-2 rounded shadow"
        onClick={() => onAddRecord(category)}
      >
        추가
      </button>
    </div>
    {records.length > 0 ? (
      records.map((record) => (
        <div key={record.id} className="flex items-center justify-start mb-2">
          <DayRecordTable record={record} />
          <button
            className="bg-red-500 text-white text-sm px-2 py-1 rounded shadow"
            onClick={() => onDeleteRecord(record.id)}
          >
            삭제
          </button>
        </div>
      ))
    ) : (
      <p className="text-sm text-gray-500">해당 카테고리에 레코드가 없습니다.</p>
    )}
  </div>
);

const DayRecordDetails = ({ className }) => {
  const { selectedDayRecord, updateDayRecord } = useDayRecord();
  const { dsTaskList } = useBase();

  if (!selectedDayRecord) {
    return (
      <div className={`p-6 ${className}`}>
        <h2 className="text-2xl font-bold">선택된 날짜가 없습니다.</h2>
      </div>
    );
  }

  const groupedRecords = dsTaskList.reduce((acc, task) => {
    acc[task.category] = [];
    return acc;
  }, {});

  selectedDayRecord.records.forEach((record) => {
    if (groupedRecords[record.category]) {
      groupedRecords[record.category].push(record);
    }
  });

  const handleAddRecord = (category) => {
    const newRecord = {
      mapdscourseid: selectedDayRecord.mapdscourseid,
      task: "",
      isodate: selectedDayRecord.date,
      chemical: [],
      timeslot: [],
      equipment: [],
      location: [],
      workforce: [],
      id: uuidv4(),
      category,
      desc: "",
      status: ""
    };

    updateDayRecord({
      ...selectedDayRecord,
      records: [...selectedDayRecord.records, newRecord]
    });
  };

  const handleDeleteRecord = (recordId) => {
    const updatedRecords = selectedDayRecord.records.filter((record) => record.id !== recordId);
    updateDayRecord({
      ...selectedDayRecord,
      records: updatedRecords
    });
  };

  return (
    <div className={`p-6 ${className}`}>
      <h1 className="text-2xl font-bold mb-4">Day Record Details</h1>
      {Object.keys(groupedRecords).map((category) => (
        <CategorySection
          key={category}
          category={category}
          records={groupedRecords[category]}
          onAddRecord={handleAddRecord}
          onDeleteRecord={handleDeleteRecord}
        />
      ))}
    </div>
  );
};

export default DayRecordDetails;
