import React, { useEffect, useState } from 'react';
import { useDayRecord } from '../../context/DayRecordContext';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css'; // 기본 스타일
import './CustomCalendar.css';

const SidebarLeft = () => {
  const [date, setDate] = useState(new Date());
  const { selectDayRecord, dayRecords, selectedDayRecord } = useDayRecord();

  const handleDateChange = (newDate) => {
    setDate(newDate);
    selectDayRecord(newDate);
  };

  useEffect(()=>{
    console.log(selectedDayRecord);
  },[selectedDayRecord])

    // 특정 날짜에 점(dot) 표시
  // 특정 날짜에 점(dot) 표시
  const getTileContent = ({ date, view }) => {
    if (view === 'month') {
      const formattedDate = date.toISOString().split('T')[0];
      const record = dayRecords.find((rec) => rec.date === formattedDate);

      if (record && record.records.length > 0) {
        const dotsToShow = record.records.slice(0, 10); // 최대 10개만 점 표시
        const hasMoreDots = record.records.length > 10;

        return (
          <div className="dot-container">
            {dotsToShow.map((rec, index) => (
              <span
                key={index}
                className="dot"
                style={{ backgroundColor: rec.status === 'completed' ? '#ff4d4f' : '#d9d9d9' }}
              ></span>
            ))}
            {hasMoreDots && <span className="more-dots-icon">⋯</span>}
          </div>
        );
      }
    }
    // 기록이 없는 날도 동일한 공간을 차지하도록 빈 div 반환
    return <div className="dot-container empty"></div>;
  };

  return (
    <div className="sidebar p-4 border-r border-gray-200">
      <h2 className="text-lg font-bold mb-4">Calendar</h2>
      <Calendar
        onChange={handleDateChange}
        value={date}
        // showWeekNumbers
        formatDay={(locale, date) => date.getDate()}
        tileContent={getTileContent} // 점 표시 추가
        tileClassName={({ date, view }) =>
          view === 'month' && selectedDayRecord?.date === date.toISOString().split('T')[0]
            ? 'bg-blue-500 text-white'
            : ''
        }
      />
    </div>
  );
};

export default SidebarLeft;
