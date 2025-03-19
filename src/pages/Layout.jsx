import React, { useEffect, useState } from 'react';
import { Link } from "react-router-dom";
import { useBase } from '../context/BaseContext';
import { useDayRecord } from '../context/DayRecordContext';
import { useGlobalComponent } from '../context/GlobalComponentContext';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
/**
 * 
 * 앱 초기화 흐름 (useEffect 기반)

사용자 정보를 가져오고 (getUserInfo)
사용자 mapdscourseid를 기반으로 설정을 로드 (loadConfig)
특정 조건(mapdscourseid === "MGC999")에서 글로벌 데이터를 로드
 */

export default function Layout({ children }) {
    // Context API를 통해 글로벌 상태 및 데이터 관리
    const {
      dsrankOrder,
      dsOrgOrder,
      dsTaskList,
      loadConfig,
      mapdscourseid,
      dsOrgList,
      dsEQCategoryTypeMAP
    } = useBase();
  
    const {
      dayRecords,
      fetchDayRecords,
    } = useDayRecord();
  
    const {
      fetchGlobalChemicals,
      fetchGlobalEquipments,
      fetchGlobalWorkforces,
    } = useGlobalComponent();
  
    // 로딩 상태 및 사용자 정보 상태
    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState('');
    const [orgName, setOrgName] = useState('');
  
    // 애플리케이션 초기화: 사용자 정보 가져오기 -> 설정 로드 및 DayRecord 가져오기
    useEffect(() => {
      const initializeApp = async () => {
        try {
          // 사용자 정보를 가져와 해당 사용자의 mapdscourseid(조직 ID) 반환
          const courseId = await getUserInfo();
  
          if (courseId) {
            // 사용자의 courseId를 기반으로 설정을 로드
            await loadConfig(courseId);
  
            // DayRecord 데이터 가져오기 (현재 주석 처리됨): 이 WEB에서는 사용하지 않음
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
  
    // 특정 조건(mapdscourseid가 'MGC999')일 때 글로벌 데이터를 가져옴
    useEffect(() => {
      if (mapdscourseid=='MGC999') {
        fetchGlobalChemicals();
        fetchGlobalEquipments();
        fetchGlobalWorkforces();
      }
    }, [mapdscourseid]);

    // dsTaskList, dsrankOrder 값 변경 시 콘솔에 출력 (디버깅 용도)
    useEffect(() => {
      console.log(dsTaskList);
      console.log(dsrankOrder);
      console.log(dsEQCategoryTypeMAP);
    }, [dsEQCategoryTypeMAP]);
  
    // 사용자 정보 가져오기 함수
    const getUserInfo = async () => {
      try {
        const user = await fetchUserAttributes();
        console.log('User Info:', user);
    
        // 사용자 이메일 저장
        setUserEmail(user.email || '');
        
        // 사용자 정의 속성에서 조직 ID 가져오기
        const customTag = user['custom:org']|| null;
        console.log('Custom Tag:', customTag);
    
        return customTag;
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    };

    // 로그아웃 처리 함수
    const handleSignOut = async () => {
        try {
            await signOut();
            // 로그아웃 후 페이지 새로고침
            window.location.reload();
        } catch (error) {
            console.error('로그아웃 중 오류 발생:', error);
        }
    };

    // 조직명 설정 (dsOrgList에서 사용자의 mapdscourseid에 해당하는 조직 정보 찾기)
    useEffect(() => {
      if (dsOrgList && mapdscourseid) {
        const org = dsOrgList.find(org => org.mapdscourseid === mapdscourseid);
        console.log(org);
        if (org) {
          setOrgName(org.org);
        }
      }
    }, [dsOrgList, mapdscourseid]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* 네비게이션 바 */}
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
            <Link to="/dsdb" className="text-gray-500 hover:text-blue-500 text-sm">
              동성Database
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

      {/* 메인 컨텐츠 영역 */}
      <main className="flex-grow pt-16 h-[calc(100vh-4rem)]">{children}</main>
    </div>
  );
}
