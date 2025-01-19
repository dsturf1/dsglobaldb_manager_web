import React, { useEffect, useState } from 'react';
import { Link } from "react-router-dom";
import { useBase } from '../context/BaseContext';
import { useDayRecord } from '../context/DayRecordContext';
import { useComponent } from '../context/ComponentContext';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
import ChemicalsTable from '../dsGchemical/ChemicalsTable';

export default function Layout({ children }) {
    const {
      dsrankOrder,
      dsOrgOrder,
      dsTaskList,
      loadConfig,
      mapdscourseid,
      dsOrgList
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
    const [userEmail, setUserEmail] = useState('');
    const [orgName, setOrgName] = useState('');
  
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
            // await fetchDayRecords(courseId);
  
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
      if (mapdscourseid=='MGC999') {
        fetchChemicals();
        // fetchEquipments();
        // fetchWorkforces();
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
    
        // 이메일 저장
        setUserEmail(user.email || '');
        
        // 커스텀 속성 가져오기
        const customTag = user['custom:org']|| null;
        console.log('Custom Tag:', customTag);
    
        return customTag;
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    };

    // handleSignOut 함수 추가
    const handleSignOut = async () => {
        try {
            await signOut();
            // 로그아웃 후 페이지 새로고침
            window.location.reload();
        } catch (error) {
            console.error('로그아웃 중 오류 발생:', error);
        }
    };

    // 조직명 설정을 위한 useEffect 추가
    useEffect(() => {
      if (dsOrgList && mapdscourseid) {
        const org = dsOrgList.find(org => org.mapdscourseid === mapdscourseid);
        console.log(org)
        if (org) {
          setOrgName(org.org);
        }
      }
    }, [dsOrgList, mapdscourseid]);

  return (
    <div className="h-screen flex flex-col">
      {/* Navbar */}
      <nav className="bg-white text-gray-800 border-b border-gray-300 p-2 fixed w-full z-10 shadow-md">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-extrabold text-blue-800 tracking-wide">
              동성 그린
            </h1>
            <h2 className="text-lg font-semibold text-gray-700">
              담당부서: {orgName ? `${orgName}(${mapdscourseid})` : mapdscourseid}
            </h2>
            <span className="text-sm text-gray-600">({userEmail})</span>
          </div>
          <div className="flex items-center space-x-3">
            <Link to="/" className="text-gray-500 hover:text-blue-500 text-sm">
              Home
            </Link>
            <Link to="/profile" className="text-gray-500 hover:text-blue-500 text-sm">
              Profile
            </Link>
            <Link to="/settings" className="text-gray-500 hover:text-blue-500 text-sm">
              Settings
            </Link>
            <button 
                onClick={handleSignOut}
                className="text-gray-500 hover:text-blue-500 text-sm"
            >
                Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow pt-16">{children}</main>
    </div>
  );
}
