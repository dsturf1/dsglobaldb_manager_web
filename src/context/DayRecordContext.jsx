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
    case 'UPDATE_DAY_RECORD':
      const updatedRecords = state.dayRecords.map((record) =>
        record.id === action.payload.id ? action.payload : record
      );
      return { ...state, dayRecords: updatedRecords };
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
      const response = await apiClient.get('/dsoutwork', {
        params: { mapdscourseid },
      });
      const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      const body = res_.body;
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      dispatch({ type: 'SET_DAY_RECORDS', payload: { dayRecords: data, mapdscourseid } });
      return data; // Ensure the function returns the fetched data
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
    dispatch({ type: 'UPDATE_DAY_RECORD', payload: dayRecord });
  };

  const emptyDayRecord = (date, mapdscourseid) => {
    return {
      id: uuidv4(),
      date,
      isodate: new Date(date),
      mapdscourseid,
      records: [],
      infos: emptyInfo(uuidv4(), new Date(date)),
      edited: false,
      status: 'planned',
    };
  };

  const emptyInfo = (id, isodate) => {
    return {
      id,
      isodate,
      location: '',
      supervisor: '',
      notes: '',
    };
  };

  return (
    <DayRecordContext.Provider
      value={{
        dayRecords: state.dayRecords,
        selectedDayRecord: state.selectedDayRecord,
        mapdscourseid: state.mapdscourseid,
        fetchDayRecords,
        selectDayRecord,
        updateDayRecord,
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
