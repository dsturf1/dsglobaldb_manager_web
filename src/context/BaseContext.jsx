import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';

// Axios 클라이언트 설정
const apiClient = axios.create({
  baseURL: 'https://spcxatxbph.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

// Context 생성
const BaseContext = createContext();

// Provider 컴포넌트
export const BaseProvider = ({ children}) => {
  // 상태 관리
  const [dsrankOrder, setDsrankOrder] = useState([]);
  const [dsOrgOrder, setDsOrgOrder] = useState([]);
  const [dstypeOrder, setDstypeOrder] = useState([]);
  const [dsEQtypeOrder, setDsEQtypeOrder] = useState([]);
  const [dsEQCategoryTypeMAP, setDsEQCategoryTypeMAP] = useState({});
  const [dsEQtypeSymMap, setDsEQtypeSymMap] = useState({});

  const [dssclearConditions, setDssclearConditions] = useState([]);
  const [dsprecipitationConditions, setDsprecipitationConditions] = useState([]);
  const [dswindConditions, setDswindConditions] = useState([]);
  const [dsHolidays, setDsHolidays] = useState([]);
  const [dsOrgList, setDsOrgList] = useState([]);
  const [dsTaskList, setDsTaskList] = useState([]);
  const [mapdscourseid, setMapdscourseid] = useState('MGC999');

  // 상태 변경 감지용 useEffect
  useEffect(() => {
    console.log('Base 상태 변경 감지:', {
      dsrankOrder,
      dsOrgOrder,
      dstypeOrder,
      dsEQtypeOrder,
      dsEQCategoryTypeMAP,
      dsEQtypeSymMap,
      dssclearConditions,
      dsprecipitationConditions,
      dswindConditions,
      dsHolidays,
      dsOrgList,
      dsTaskList,
      mapdscourseid
    });
  }, [
    dsrankOrder,
    dsOrgOrder,
    dstypeOrder,
    dsEQtypeOrder,
    dsEQCategoryTypeMAP,
    dsEQtypeSymMap,
    dssclearConditions,
    dsprecipitationConditions,
    dswindConditions,
    dsHolidays,
    dsOrgList,
    dsTaskList,
    mapdscourseid
  ]);

  // Config 파일 로드 함수
  const loadConfig = useCallback(async (courseId) => {
    if (!courseId) return;
    setMapdscourseid(courseId);

    try {
      const response = await apiClient.get('/baseinfo', {
        params: { mapdscourseid: courseId },
      });

      const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      console.log(res_);
      const body = typeof res_.body === 'string' ? JSON.parse(res_.body) : res_.body;

      if (body) {
        parseBaseJson(body);
      } else {
        console.error("Failed to load configuration.");
      }
    } catch (error) {
      console.error("Error loading configuration:", error);
    }
  }, []);
  


  // dsbase.json 파싱 함수
  const parseBaseJson = (data) => {
    try {
      // const data = JSON.parse(jsonString);

      setDsrankOrder(data.dsrankOrder || []);
      setDsOrgOrder(data.dsOrgOrder || []);
      setDstypeOrder(data.dstypeOrder || []);
      setDsEQtypeOrder(data.dsEQtypeOrder || []);
      setDsEQtypeSymMap(data.dsEQtypeSymMap || {});
      setDssclearConditions(data.dssclearConditions || []);
      setDsprecipitationConditions(data.dsprecipitationConditions || []);
      setDswindConditions(data.dswindConditions || []);
      setDsOrgList(data.dsOrgList || []);
      setDsTaskList(data.dstask || []);
      setDsEQCategoryTypeMAP(data.dsEQCategoryTypeMAP || {});
      setDsHolidays(data.dsholidays || []);
      console.log("Base & Task configuration loaded successfully.", data);
      console.log("Base & Task configuration loaded successfully.", getBaseData());
    } catch (error) {
      console.error("Failed to parse dsbase.json:", error);
    }
  };

  // 현재 상태의 모든 변수를 하나의 객체로 묶어서 반환하는 함수
  const getBaseData = () => {
    return {
      mapdscourseid,
      dsrankOrder,
      dsOrgOrder,
      dstypeOrder,
      dsEQtypeOrder,
      dsEQtypeSymMap,
      dssclearConditions,
      dsprecipitationConditions,
      dswindConditions,
      dsOrgList,
      dstask: dsTaskList,
      dsEQCategoryTypeMAP,
      dsholidays: dsHolidays,
    };
  };

  // baseinfo 업데이트 함수
  const updateBaseInfo = async () => {

    try {
      const response = await apiClient.get('/baseinfo');

      const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      var body = typeof res_.body === 'string' ? JSON.parse(res_.body) : res_.body;

      if (body) {

        const baseData = getBaseData();
        body = {...body, ...baseData};
        console.log(body);
        await updateBaseInfoAPI(body);
      } else {
        console.error("Failed to load configuration.");
      }
    } catch (error) {
      console.error('Error updating base info:', error);
      throw error;
    }

  };

  const updateBaseInfoAPI = async (baseInfo) => {
    try {
      const response = await apiClient.put('/baseinfo', baseInfo);
      console.log('Base info updated successfully:', response.data);
    } catch (error) {
      console.error('Error updating base info:', error);
      throw error;
    }
  };

  // 각 변수별 수정 함수들
  const updateDsrankOrder = (newOrder) => {
    setDsrankOrder(newOrder);
  };

  const updateDsOrgOrder = (newOrder) => {
    setDsOrgOrder(newOrder);
  };

  const updateDstypeOrder = (newOrder) => {
    setDstypeOrder(newOrder);
  };

  const updateDsEQtypeOrder = (newOrder) => {
    setDsEQtypeOrder(newOrder);
  };

  const updateDsEQtypeSymMap = (newValue) => setDsEQtypeSymMap(newValue);
  const updateDssclearConditions = (newValue) => setDssclearConditions(newValue);
  const updateDsprecipitationConditions = (newValue) => setDsprecipitationConditions(newValue);
  const updateDswindConditions = (newValue) => setDswindConditions(newValue);
  const updateDsHolidays = (newValue) => setDsHolidays(newValue);
  const updateDsOrgList = (newValue) => setDsOrgList(newValue);
  const updateDsTaskList = (newValue) => setDsTaskList(newValue);
  const updateDsEQCategoryTypeMAP = (newValue) => setDsEQCategoryTypeMAP(newValue);

  // Context value
  const value = {
    // 상태 변수들
    dsrankOrder,
    dsOrgOrder,
    dstypeOrder,
    dsEQtypeOrder,
    dsEQtypeSymMap,
    dssclearConditions,
    dsprecipitationConditions,
    dswindConditions,
    dsHolidays,
    dsOrgList,
    dsTaskList,
    dsEQCategoryTypeMAP,
    mapdscourseid,
    
    // 수정 함수들
    updateDsrankOrder,
    updateDsOrgOrder,
    updateDstypeOrder,
    updateDsEQtypeOrder,
    updateDsEQtypeSymMap,
    updateDssclearConditions,
    updateDsprecipitationConditions,
    updateDswindConditions,
    updateDsHolidays,
    updateDsOrgList,
    updateDsTaskList,
    updateDsEQCategoryTypeMAP,
    
    // 기존 함수들
    setMapdscourseid,
    loadConfig,
    getOrgByCourseId: (mapCourseId) =>
      dsOrgList.find((org) => org.mapdscourseid === mapCourseId)?.org || null,
    getBaseData,
    updateBaseInfo,
  };

  return <BaseContext.Provider value={value}>{children}</BaseContext.Provider>;
};

// 커스텀 Hook
export const useBase = () => useContext(BaseContext);
