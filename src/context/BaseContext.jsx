import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { downloadData } from '@aws-amplify/storage'; // 최신 다운로드 API 사용

// Context 생성
const BaseContext = createContext();

// Provider 컴포넌트
export const BaseProvider = ({ children}) => {
  // 상태 관리
  const [dsrankOrder, setDsrankOrder] = useState([]);
  const [dsOrgOrder, setDsOrgOrder] = useState([]);
  const [dstypeOrder, setDstypeOrder] = useState([]);
  const [dssclearConditions, setDssclearConditions] = useState([]);
  const [dsprecipitationConditions, setDsprecipitationConditions] = useState([]);
  const [dswindConditions, setDswindConditions] = useState([]);
  const [dsOrgList, setDsOrgList] = useState([]);
  const [dsTaskList, setDsTaskList] = useState([]);
  const [mapdscourseid, setMapdscourseid] = useState('MGC999');

  // Config 파일 로드 함수
  const loadConfig = useCallback(async (courseId) => {
    if (!courseId) return;
    setMapdscourseid(courseId)    

    try {
      const dsBaseJson = await loadFromS3(`public/base/${courseId}/dsbase.json`);
      const dsTaskJson = await loadFromS3(`public/base/${courseId}/dstask.json`);

      // console.log('In Base COntext', dsTaskJson);

      if (dsBaseJson && dsTaskJson) {
        parseBaseJson(dsBaseJson);
        parseTaskJson(dsTaskJson);
      } else {
        console.error("Failed to load configuration.");
      }
    } catch (error) {
      console.error("Error loading configuration:", error);
    }
  }, []);

  // S3에서 파일 로드 함수
  const loadFromS3 = async (s3Key) => {
    try {
      const { body } = await downloadData({
        path: s3Key,
        options: {
          onProgress: (event) => {
            console.log(`Downloaded ${event.transferredBytes} bytes`);
          },
        },
      }).result;

      // UTF-8로 디코딩
      const textData = new TextDecoder('utf-8').decode(await body.arrayBuffer());
      return textData;
    } catch (error) {
      console.error(`Failed to load ${s3Key} from S3:`, error);
      return null;
    }
  };

  // dsbase.json 파싱 함수
  const parseBaseJson = (jsonString) => {
    try {
      const data = JSON.parse(jsonString);

      setDsrankOrder(data.dsrankOrder || []);
      setDsOrgOrder(data.dsOrgOrder || []);
      setDstypeOrder(data.dstypeOrder || []);
      setDssclearConditions(data.dssclearConditions || []);
      setDsprecipitationConditions(data.dsprecipitationConditions || []);
      setDswindConditions(data.dswindConditions || []);
      setDsOrgList(data.dsOrgList || []);

      console.log("Base configuration loaded successfully.", data.dsOrgList);
    } catch (error) {
      console.error("Failed to parse dsbase.json:", error);
    }
  };

  // dstask.json 파싱 함수
  const parseTaskJson = (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      // console.log(data);
      setDsTaskList(data || []);
      console.log("Task configuration loaded successfully.");
    } catch (error) {
      console.error("Failed to parse dstask.json:", error);
    }
  };


  // Context value
  const value = {
    dsrankOrder,
    dsOrgOrder,
    dstypeOrder,
    dssclearConditions,
    dsprecipitationConditions,
    dswindConditions,
    dsOrgList,
    dsTaskList,
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
