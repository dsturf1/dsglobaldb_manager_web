import React, { useEffect, useState } from 'react';
import { useBase } from '../context/BaseContext';
import { useDayRecord } from '../context/DayRecordContext';
import { useComponent } from '../context/ComponentContext';
import { fetchUserAttributes } from 'aws-amplify/auth';


const ExampleComponent = () => {
  const {
    dsrankOrder,
    dsOrgOrder,
    loadConfig,
    mapdscourseid
  } = useBase();

  const {
    dayRecords,
    fetchDayRecords,
  } = useDayRecord();

  const {
    chemicals,
    equipments,
    workforces,
    fetchChemicals,
    fetchEquipments,
    fetchWorkforces,
  } =  useComponent();

  const [loading, setLoading] = useState(true);

  // 초기화 로직: getUserInfo -> mapdscourseid로 설정 로드 및 DayRecord 가져오기
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 사용자 정보 가져오기
        const courseId = await getUserInfo();

        if (courseId) {
          // mapdscourseid 설정 및 Config 파일 로드
          await loadConfig(courseId);

          // DayRecord 데이터 가져오기
          await fetchDayRecords(courseId);

        } else {
          console.error('No mapdscourseid found for user.');
        }
      } catch (error) {
        console.error('Error during initialization:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    if (mapdscourseid!='MGC999') {
      fetchChemicals();
      fetchEquipments();
      fetchWorkforces();
    }
  }, [mapdscourseid]);

  // 사용자 정보 가져오기

  const getUserInfo = async () => {
    try {
      const user = await fetchUserAttributes();
      console.log('User Info:', user);
  
      // 커스텀 속성 가져오기
      const customTag = user['custom:org']|| null;
      console.log('Custom Tag:', customTag);
  
      return customTag;
    } catch (error) {
      console.error('Error fetching user info:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Base Configuration</h1>
      <pre>{JSON.stringify(dsrankOrder, null, 2)}</pre>
      <pre>{JSON.stringify(dsOrgOrder, null, 2)}</pre>

      <h1>Day Records</h1>
      <pre>{JSON.stringify(dayRecords, null, 2)}</pre>
      <h1>Chemicals</h1>
      <pre>{JSON.stringify(chemicals, null, 2)}</pre>
      <h1>workforces</h1>
      <pre>{JSON.stringify(workforces, null, 2)}</pre>
      <h1>equipmentss</h1>
      <pre>{JSON.stringify(equipments, null, 2)}</pre>
    </div>
  );
};

export default ExampleComponent;
