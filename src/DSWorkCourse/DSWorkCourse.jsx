import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapPinIcon, FlagIcon, UserGroupIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import WorkCourseEditDialog from './WorkCourseEditDialog';

const apiClient = axios.create({
  baseURL: 'https://e0x0fsw125.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

const DSWorkCourse = () => {
  const [courses, setCourses] = useState([]);
  const [filteredCourses, setFilteredCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('전체');
  const [selectedActive, setSelectedActive] = useState('전체');
  const [orgList, setOrgList] = useState(['전체']);
  const activeOptions = ['전체', 'Y', 'N'];

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await apiClient.get('/dscourse_info');
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        console.log('API Response:', data);
        
        if (!data || !data.body) {
          throw new Error('서버에서 올바른 데이터를 받지 못했습니다.');
        }
        
        const coursesData = Array.isArray(data.body) ? data.body : [];

        console.log('coursesData:', coursesData);
        
        const processedCourses = coursesData.filter(course => course.id !== 'MGC999').map(course => ({
          ...course,
          course_names: Array.isArray(course.course_names) ? course.course_names : [],
          access_org: Array.isArray(course.access_org) ? course.access_org : []
        }));
        
        // 조직 목록 추출
        const orgs = new Set(['전체']);
        processedCourses.forEach(course => {
          orgs.add(course.org);
        });
        setOrgList(Array.from(orgs));
        
        setCourses(processedCourses);
        setFilteredCourses(processedCourses);
        setError(null);
      } catch (error) {
        console.error('Error fetching courses:', error);
        setError(error.message || '골프장 정보를 불러오는 중 오류가 발생했습니다.');
        setCourses([]);
        setFilteredCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  useEffect(() => {
    let filtered = [...courses];
    
    // 조직 필터링
    if (selectedOrg !== '전체') {
      filtered = filtered.filter(course => course.org === selectedOrg);
    }
    
    // Active 상태 필터링
    if (selectedActive !== '전체') {
      filtered = filtered.filter(course => course.active === selectedActive);
    }
    
    // 검색어 필터링
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(course => 
        course.name.toLowerCase().includes(term) ||
        course.dscourseids.toLowerCase().includes(term) ||
        course.org.toLowerCase().includes(term)
      );
    }
    
    setFilteredCourses(filtered);
  }, [searchTerm, selectedOrg, selectedActive, courses]);

  const handleDoubleClick = (course) => {
    setSelectedCourse(course);
    setIsDialogOpen(true);
  };

  const generateNewCourseId = () => {
    const existingIds = courses.map(course => {
      const match = course.dscourseids.match(/GC(\d+)/);
      return match ? parseInt(match[1]) : 0;
    });
    const maxId = Math.max(...existingIds, 0);
    return `GC${String(maxId + 1).padStart(3, '0')}`;
  };

  const handleAddNewCourse = () => {
    const newCourse = {
      dscourseids: generateNewCourseId(),
      name: '',
      org: '',
      dedicated_org: '',
      active: 'Y',
      warehouse: '',
      outsource: '',
      outorg: '',
      outwarehouse: '',
      course_names: [],
      access_org: [],
      mapdscourseid: ''
    };
    setSelectedCourse(newCourse);
    setIsDialogOpen(true);
  };

  const handleSave = async (updatedCourse) => {
    try {
      const process_update = {
        ...updatedCourse,
        access_orgString: updatedCourse.access_org.join(','),
        course_namesString: updatedCourse.course_names.join(',')
      };
      
      console.log('Updated course:', process_update);

      const updatedCourses = [...courses];
      const index = updatedCourses.findIndex(course => course.dscourseids === updatedCourse.dscourseids);
      
      if (index === -1) {
        // 새로운 골프장 추가
        updatedCourses.push(process_update);
      } else {
        // 기존 골프장 수정
        updatedCourses[index] = process_update;
      }
      
      setCourses(updatedCourses);
      setFilteredCourses(updatedCourses);

      const response = await apiClient.put(`/dscourse_info`, updatedCourses);
      console.log('API Response:', response.data);
    } catch (error) {
      console.error('Error updating course:', error);
      setError('골프장 정보 업데이트 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <div className="text-red-500 text-xl mb-4">{error}</div>
        <button 
          onClick={() => window.location.reload()}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!courses || courses.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <div className="text-gray-500 text-xl mb-4">등록된 골프장이 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">골프장 목록</h2>
      
      <div className="mb-6 flex justify-between items-center">
        <div className="flex flex-col sm:flex-row gap-4 flex-grow">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="골프장명, ID, 조직으로 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="block w-full sm:w-48 pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
          >
            {orgList.map((org) => (
              <option key={org} value={org}>
                {org}
              </option>
            ))}
          </select>
          <select
            className="block w-full sm:w-32 pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            value={selectedActive}
            onChange={(e) => setSelectedActive(e.target.value)}
          >
            {activeOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'Y' ? '활성' : option === 'N' ? '비활성' : option}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleAddNewCourse}
          className="ml-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
        >
          새 골프장 추가
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white shadow-md rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MAP ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">골프장명</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">조직</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">전담조직</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">창고</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">용역</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">용역조직</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">용역창고</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">코스</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">접근가능조직</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">수정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredCourses.map((course) => (
              <tr key={course.dscourseids} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.dscourseids}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.mapdscourseid || ""}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.org}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.dedicated_org}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.active}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.warehouse}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.outsource}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.outorg}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.outwarehouse}</td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  <div className="flex flex-wrap gap-1">
                    {course.course_names.map((name, index) => (
                      <span key={index} className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                        {name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  <div className="flex flex-wrap gap-1">
                    {course.access_org.map((org, index) => (
                      <span key={index} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                        {org}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <button
                    onClick={() => handleDoubleClick(course)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    수정
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WorkCourseEditDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        course={selectedCourse}
        onSave={handleSave}
      />
    </div>
  );
};

export default DSWorkCourse; 