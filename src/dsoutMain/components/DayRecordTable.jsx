import React, { useState, useEffect } from 'react';
import { useBase } from '../../context/BaseContext'; // dsTask 가져오기
import { useComponent } from '../../context/ComponentContext';
import { useDayRecord } from '../../context/DayRecordContext'; // 추가
import LocationTree from './LocationTree';
import WorkforceDialog from './WorkforceDialog';
import EquipmentDialog from './EquipmentDialog';
import ChemicalDialog from './ChemicalDialog';

const DayRecordTable = ({ record }) => {
  const { dsTaskList } = useBase();
  const { workforces, equipments, chemicals } = useComponent();
  const { selectedDayRecord, updateDayRecord } = useDayRecord(); // useDayRecord 추가

  // 상태 초기화
  const [selectedTask, setSelectedTask] = useState(record.task);
  const [desc, setDesc] = useState(record.desc);
  const [timeslot, setTimeslot] = useState(record.timeslot || []);
  const [status, setStatus] = useState(record.status);
  const [location, setLocation] = useState(record.location || []);
  const [workforce, setWorkforce] = useState(record.workforce || []);
  const [equipment, setEquipment] = useState(record.equipment || []);
  const [isWorkforceDialogOpen, setIsWorkforceDialogOpen] = useState(false);
  const [isEquipmentDialogOpen, setIsEquipmentDialogOpen] = useState(false);
  const [chemical, setChemical] = useState(record.chemical || []);
  const [isChemicalDialogOpen, setIsChemicalDialogOpen] = useState(false);

  // 상태 변경 시 Context 업데이트
  useEffect(() => {
    if (!selectedDayRecord) return;

    // 기존 records 리스트에서 현재 record를 찾아 업데이트
    const updatedRecords = selectedDayRecord.records.map((r) =>
      r.id === record.id
        ? {
            ...r,
            task: selectedTask,
            desc,
            timeslot,
            status,
            location,
            workforce,
            equipment,
            chemical,
          }
        : r
    );

    // 업데이트된 records를 포함한 selectedDayRecord를 Context에 저장
    updateDayRecord({
      ...selectedDayRecord,
      records: updatedRecords,
    });
  }, [selectedTask, desc, timeslot, status, location, workforce, equipment, chemical]);

  // 작업 위치 설정
  const handleLocationChange = (newLocations) => {
    setLocation(newLocations);
  };

  // 필터링된 작업 목록 가져오기
  const filteredTasks = dsTaskList.find(item => item.category === record.category);

  if (!record) {
    return <p className="text-xs">기록이 없습니다.</p>;
  }

  // 작업명을 선택할 때 상태 업데이트
  const handleTaskChange = (e) => {
    setSelectedTask(e.target.value);
  };

  // 설명 변경
  const handleDescChange = (e) => {
    setDesc(e.target.value);
  };

  // 시간대 버튼 클릭 시 상태 업데이트
  const handleTimeslotToggle = (slot) => {
    if (timeslot.includes(slot)) {
      setTimeslot(timeslot.filter((s) => s !== slot)); // 이미 선택된 경우 제거
    } else {
      setTimeslot([...timeslot, slot]); // 선택되지 않은 경우 추가
    }
  };

  // 상태 토글 스위치
  const toggleStatus = () => {
    setStatus((prevStatus) => (prevStatus === 'completed' ? 'pending' : 'completed'));
  };

  // 작업 인력 추가/변경 다이얼로그 열기
  const handleWorkforceChange = (newWorkforce) => {
    setWorkforce(newWorkforce);
  };

  // 사용 장비 추가/변경 다이얼로그 열기
  const handleEquipmentChange = (newEquipment) => {
    setEquipment(newEquipment);
  };

  // 사용 시약 수정
  const handleChemicalChange = (index, newAmount) => {
    const updatedChemicals = [...chemical];
    updatedChemicals[index].amount = parseFloat(newAmount) || 0;
    setChemical(updatedChemicals);
  };

  // 사용 시약 삭제
  const handleChemicalDelete = (index) => {
    const updatedChemicals = chemical.filter((_, i) => i !== index);
    setChemical(updatedChemicals);
  };

  // 사용 시약 추가/변경 다이얼로그 열기
  const handleChemicalAdd = (newChemicalList) => {
    setChemical([...newChemicalList]);
  };

  return (
    <div className="overflow-auto bg-white p-4 rounded shadow">
      <table className="w-full border border-gray-300 table-fixed text-xs">
        {/* 테이블 헤더 */}
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border border-gray-300 w-2/12">[{record.category}]  작업명</th>
            <th className="p-2 border border-gray-300 w-6/12">설명</th>
            <th className="p-2 border border-gray-300 w-2/12">시간대</th>
            <th className="p-2 border border-gray-300 w-2/12">상태</th>
          </tr>
        </thead>

        {/* 테이블 내용 */}
        <tbody>
          {/* 첫 번째 행 */}
          <tr>
            <td className="p-2 border border-gray-300">
              <select
                className="select select-bordered w-full max-w-xs"
                value={selectedTask}
                onChange={handleTaskChange}
              >
                {(filteredTasks?.Task || []).map((task) => (
                  <option key={`${record.category}-${task}`} value={task}>
                    {task}
                  </option>
                ))}
              </select>
            </td>

            {/* 설명 Textarea */}
            <td className="p-2 border border-gray-300">
              <textarea
                className="w-full border border-gray-300 rounded p-1"
                rows="3"
                value={desc}
                onChange={handleDescChange}
              />
            </td>

            {/* 시간대 버튼 그룹 */}
            <td className="p-2 border border-gray-300">
              <div className="flex space-x-1">
                {['새벽', '오전', '오후', '저녁'].map((slot) => (
                  <button
                    key={slot}
                    className={`px-2 py-1 rounded ${
                      timeslot.includes(slot) ? 'bg-blue-500 text-white' : 'bg-gray-200'
                    }`}
                    onClick={() => handleTimeslotToggle(slot)}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </td>

            {/* 상태 Toggle Switch */}
            <td className="p-2 border border-gray-300 text-center">
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={status === 'completed'}
                    onChange={toggleStatus}
                  />
                  <div className="w-10 h-4 bg-gray-400 rounded-full shadow-inner"></div>
                  <div
                    className={`absolute w-6 h-6 bg-white rounded-full shadow -left-1 -top-1 transition-transform transform ${
                      status === 'completed' ? 'translate-x-full bg-green-500' : 'bg-yellow-500'
                    }`}
                  ></div>
                </div>
                <span className="ml-3 text-xs">
                  {status === 'completed' ? '완료됨' : '진행 중'}
                </span>
              </label>
            </td>
          </tr>

          {/* 두 번째 행: 작업 위치 */}
          <tr>
            <td className="p-2 border border-gray-300 font-bold">작업 위치</td>
            <td colSpan="3" className="p-2 border border-gray-300">
              {filteredTasks?.Task ? (
                <LocationTree
                  dsTask={filteredTasks}
                  initialState={location}
                  onStateChange={handleLocationChange}
                />
              ) : (
                <p>작업 목록이 없습니다.</p>
              )}
            </td>
          </tr>

          {/* 세 번째 행: 작업 인력 */}
          <tr>
            <td className="p-2 border border-gray-300 font-bold">작업 인력</td>
            <td colSpan="3" className="p-2 border border-gray-300">
              {workforce.map((worker) => worker.name).join(', ') || '없음'}
              <button
                className="ml-2 px-2 py-1 bg-blue-500 text-white rounded"
                onClick={() => setIsWorkforceDialogOpen(true)}
              >
                추가
              </button>
              {isWorkforceDialogOpen && (
                <WorkforceDialog
                  availableWorkforces={workforces}
                  selectedWorkforces={workforce}
                  onClose={() => setIsWorkforceDialogOpen(false)}
                  onSave={handleWorkforceChange}
                />
              )}
            </td>
          </tr>

          {/* 네 번째 행: 사용 장비 */}
          <tr>
            <td className="p-2 border border-gray-300 font-bold">사용 장비</td>
            <td colSpan="3" className="p-2 border border-gray-300">
              {equipment.map((eq) => eq.name).join(', ') || '없음'}
              <button
                className="ml-2 px-2 py-1 bg-blue-500 text-white rounded"
                onClick={() => setIsEquipmentDialogOpen(true)}
              >
                추가
              </button>
              {isEquipmentDialogOpen && (
                <EquipmentDialog
                  availableEquipments={equipments}
                  selectedEquipments={equipment}
                  onClose={() => setIsEquipmentDialogOpen(false)}
                  onSave={handleEquipmentChange}
                />
              )}
            </td>
          </tr>

          {/* 다섯 번째 행: 사용 시약 */}
          <tr>
            <td className="p-2 border border-gray-300 font-bold">사용 시약</td>
            <td colSpan="3" className="p-2 border border-gray-300">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="border-b p-1">DSID</th>
                    <th className="border-b p-1">이름</th>
                    <th className="border-b p-1">단위</th>
                    <th className="border-b p-1 w-1/6">수량</th>
                    <th className="border-b p-1 w-1/12">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {chemical.map((chem, index) => (
                    <tr key={chem.dsids}>
                      <td className="p-1 border-b">{chem.dsids}</td>
                      <td className="p-1 border-b">{chem.name}</td>
                      <td className="p-1 border-b">{chem.unit}</td>
                      <td className="p-1 border-b w-1/6">
                        <input
                          type="number"
                          className="w-full border border-gray-300 rounded p-1"
                          value={chem.amount}
                          step="0.1"
                          min="0"
                          onChange={(e) => handleChemicalChange(index, e.target.value)}
                        />
                      </td>
                      <td className="p-1 border-b w-1/12 text-center">
                        <button
                          className="px-2 py-1 bg-red-500 text-white rounded"
                          onClick={() => handleChemicalDelete(index)}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="mt-2 px-2 py-1 bg-green-500 text-white rounded"
                onClick={() => setIsChemicalDialogOpen(true)}
              >
                추가
              </button>
              {isChemicalDialogOpen && (
                <ChemicalDialog
                  availableChemicals={chemicals}
                  selectedChemicals={chemical}
                  onClose={() => setIsChemicalDialogOpen(false)}
                  onSave={handleChemicalAdd}
                />
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default DayRecordTable;
