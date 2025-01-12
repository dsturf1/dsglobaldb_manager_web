import React, { useEffect, useState } from 'react';
import { Link } from "react-router-dom";
import { useBase } from '../context/BaseContext';
import { useDayRecord } from '../context/DayRecordContext';
import { useComponent } from '../context/ComponentContext';
import { fetchUserAttributes } from 'aws-amplify/auth';

export default function Layout({ children }) {
    const {
      dsrankOrder,
      dsOrgOrder,
      dsTaskList,
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

    useEffect(() => {
      console.log(dsTaskList);
      console.log(dsrankOrder);
    }, [dsTaskList]);
  
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
  return (
    <div className="h-screen flex flex-col">
      {/* Navbar */}
      <nav className="bg-white text-gray-800 border-b border-gray-300 p-2 fixed w-full z-10 shadow-md">
        <div className="flex justify-between items-center">
          <h1 className="text-sm font-semibold">동성 그린 {mapdscourseid}</h1>
          <div className="space-x-3">
            <Link to="/" className="text-gray-500 hover:text-blue-500 text-sm">
              Home
            </Link>
            <Link to="/profile" className="text-gray-500 hover:text-blue-500 text-sm">
              Profile
            </Link>
            <Link to="/settings" className="text-gray-500 hover:text-blue-500 text-sm">
              Settings
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow pt-16">{children}</main>
    </div>
  );
}
