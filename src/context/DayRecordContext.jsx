import { createContext, useContext, useReducer } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const DayRecordContext = createContext();

const apiClient = axios.create({
  baseURL: 'https://spcxatxbph.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

const initialState = {
  dayRecords: [],
  selectedDayRecord: null,
  mapdscourseid: '',
};

const dayRecordReducer = (state, action) => {
  switch (action.type) {
    case 'SET_DAY_RECORDS':
      return { ...state, dayRecords: action.payload.dayRecords, mapdscourseid: action.payload.mapdscourseid };
    case 'SELECT_DAY_RECORD':
      return { ...state, selectedDayRecord: action.payload };
    case 'UPDATE_DAY_RECORD': {
      const updatedRecords = state.dayRecords.map((record) =>
        record.id === action.payload.id ? { ...record, ...action.payload, edited: true } : record
      );
      return {
        ...state,
        dayRecords: updatedRecords,
        selectedDayRecord: action.payload.id === state.selectedDayRecord?.id ? { ...action.payload, edited: true } : state.selectedDayRecord,
      };
    }
    case 'ADD_NEW_DAY_RECORD':
      return { ...state, dayRecords: [...state.dayRecords, action.payload] };
    case 'SET_MAPDSCOURSEID':
      return { ...state, mapdscourseid: action.payload };
    default:
      return state;
  }
};

export const DayRecordProvider = ({ children }) => {
  const [state, dispatch] = useReducer(dayRecordReducer, initialState);

  const fetchDayRecords = async (mapdscourseid) => {
    try {
      const { data } = await apiClient.get('/dsoutwork', { params: { mapdscourseid } });
      const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      const dayRecords = (Array.isArray(parsedData.body) ? parsedData.body : JSON.parse(parsedData.body)).map(record => ({
        ...record,
        edited: record.edited ?? false
      }));

      dispatch({ type: 'SET_DAY_RECORDS', payload: { dayRecords, mapdscourseid } });
      return dayRecords;
    } catch (err) {
      console.error('Error fetching DayRecords:', err);
      return null;
    }
  };

  const selectDayRecord = (isodate) => {
    const todayDate = new Date(isodate).toISOString().split('T')[0];

    const existingRecord = state.dayRecords.find((record) => record.date === todayDate);
    
    if (existingRecord) {
      dispatch({ type: 'SELECT_DAY_RECORD', payload: existingRecord });
    } else {
      const newDayRecord = emptyDayRecord(todayDate, state.mapdscourseid);
      dispatch({ type: 'ADD_NEW_DAY_RECORD', payload: newDayRecord });
      dispatch({ type: 'SELECT_DAY_RECORD', payload: newDayRecord });
    }
  };

  const updateDayRecord = (dayRecord) => {
    dispatch({ type: 'UPDATE_DAY_RECORD', payload: { ...dayRecord, edited: true } });
  };

  const clearDayRecord = (dayRecordId) => {
    const dayRecordToClear = state.dayRecords.find(record => record.id === dayRecordId);
    if (dayRecordToClear) {
      const clearedRecord = {
        ...dayRecordToClear,
        records: [],
        infos: emptyInfo(dayRecordToClear.infos.id, dayRecordToClear.date),
        edited: true,
        status: 'planned'
      };
      dispatch({ type: 'UPDATE_DAY_RECORD', payload: clearedRecord });
    }
  };

  const saveDayRecord = async () => {
    const editedRecords = state.dayRecords.filter(record => record.edited);
    try {
      const promises = editedRecords.map(async (record) => {
        await apiClient.put('/dsoutwork', record);
        dispatch({ type: 'UPDATE_DAY_RECORD', payload: { ...record, edited: false } });
      });
      await Promise.all(promises);
      console.log('All edited records have been saved successfully');
    } catch (err) {
      console.error('Error saving DayRecords:', err);
    }
  };

  const emptyDayRecord = (date, mapdscourseid) => {
    return {
      id: uuidv4(),
      date,
      isodate: new Date(date).toISOString(),
      mapdscourseid,
      records: [],
      infos: emptyInfo(uuidv4(), date),
      edited: false,
      status: 'planned',
    };
  };

  const emptyInfo = (id, date) => {
    return {
      id,
      date,
      tempLow: 0,
      tempHigh: 0,
      isodate: new Date(date).toISOString(),
      mowingHeight: {
        fw: 0,
        green: 0,
        rough: 0,
        tee: 0,
      },
      weather: '',
      guest: [0, 0, 0],
      teeoffTime: new Date().toISOString(),
      attendance: {
        contractor: 0,
        total_employee: 0,
        tempFeMale: 0,
        employee: 0,
        total_contractor: 0,
        tempMale: 0,
      },
    };
  };

  return (
    <DayRecordContext.Provider
      value={{
        ...state,
        fetchDayRecords,
        selectDayRecord,
        updateDayRecord,
        clearDayRecord,
        saveDayRecord,
        setMapdscourseid: (mapdscourseid) => dispatch({ type: 'SET_MAPDSCOURSEID', payload: mapdscourseid }),
      }}
    >
      {children}
    </DayRecordContext.Provider>
  );
};

export const useDayRecord = () => {
  return useContext(DayRecordContext);
};
