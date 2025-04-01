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
  const [dsOrgList, setDsOrgList] = useState([]);
  const [dsTaskList, setDsTaskList] = useState([]);
  const [mapdscourseid, setMapdscourseid] = useState('MGC999');

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
      console.log("Base & Task configuration loaded successfully.", data);
    } catch (error) {
      console.error("Failed to parse dsbase.json:", error);
    }
  };


  // Context value
  const value = {
    dsrankOrder,
    dsOrgOrder,
    dstypeOrder,
    dsEQtypeOrder,
    dsEQtypeSymMap,
    dssclearConditions,
    dsprecipitationConditions,
    dswindConditions,
    dsOrgList,
    dsTaskList,
    dsEQCategoryTypeMAP,
    mapdscourseid,
    setMapdscourseid,
    loadConfig,
    getOrgByCourseId: (mapCourseId) =>
      dsOrgList.find((org) => org.mapdscourseid === mapCourseId)?.org || null,
  };

  return <BaseContext.Provider value={value}>{children}</BaseContext.Provider>;
};

// 커스텀 Hook
export const useBase = () => useContext(BaseContext);
