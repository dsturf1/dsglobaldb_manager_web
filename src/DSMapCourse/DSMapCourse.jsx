import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapPinIcon, FlagIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import CourseEditDialog from './CourseEditDialog';

const apiClient = axios.create({
  baseURL: 'https://spcxatxbph.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

const DSMapCourse = () => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await apiClient.get('/dscourse');
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        console.log('API Response:', data);
        
        if (!data || !data.body) {
          throw new Error('서버에서 올바른 데이터를 받지 못했습니다.');
        }
        
        const coursesData = Array.isArray(data.body) ? data.body : [];
        
        // 각 코스의 course_names와 access_org가 null이나 undefined인 경우 빈 배열로 초기화
        const processedCourses = coursesData.filter(course => course.id !== 'MGC999').map(course => ({
          ...course,
          course_names: Array.isArray(course.course_names) ? course.course_names : [],
          access_org: Array.isArray(course.access_org) ? course.access_org : []
        }));
        
        console.log('Processed courses:', processedCourses);
        setCourses(processedCourses);
        setError(null);
      } catch (error) {
        console.error('Error fetching courses:', error);
        setError(error.message || '골프장 정보를 불러오는 중 오류가 발생했습니다.');
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  const handleDoubleClick = (course) => {
    setSelectedCourse(course);
    setIsDialogOpen(true);
  };

  const handleSave = async (updatedCourse) => {
    try {
      const process_update = {
        ...updatedCourse,
        access_orgString: updatedCourse.access_org.join(','),
        course_namesString: updatedCourse.course_names.join(',')
      };
      // API 호출로 업데이트
      await apiClient.put(`/dscourse`, process_update);
      console.log('Updated course:', process_update);
      // 로컬 상태 업데이트
      setCourses(prevCourses => 
        prevCourses.map(course => 
          course.id === updatedCourse.id ? process_update : course
        )
      );
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {courses && courses.map((course) => (
          <div 
            key={course.id} 
            className="bg-white rounded-lg shadow-md overflow-hidden relative"
          >
            <button
              onClick={() => handleDoubleClick(course)}
              className="absolute bottom-2 right-2 text-red-500 hover:text-red-700 p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <div className="p-4">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold">{course.name} </h3>
                <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                  {course.org}
                </span>
              </div>
              <div className="flex items-start mb-4">
                <span className="bg-blue-100 text-blue-800 font-medium px-2.5 py-0.5 rounded mr-2">{course.id}</span>
                <span className="bg-blue-100 text-blue-800 font-medium px-2.5 py-0.5 rounded">{course.dscourseids}</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center text-gray-600">
                  <MapPinIcon className="h-5 w-5 mr-2" />
                  <span>{course.address}</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <FlagIcon className="h-5 w-5 mr-2" />
                  <span>{course.numHole}홀</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <UserGroupIcon className="h-5 w-5 mr-2" />
                  <span>접근 가능 조직: </span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {course.access_org.map((name, index) => (
                      <span
                        key={index}
                        className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <span className="font-medium">코스:</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {course.course_names.map((name, index) => (
                      <span
                        key={index}
                        className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <CourseEditDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        course={selectedCourse}
        onSave={handleSave}
      />
    </div>
  );
};

export default DSMapCourse; 