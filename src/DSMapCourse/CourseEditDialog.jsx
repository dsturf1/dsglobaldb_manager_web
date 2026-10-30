import React, { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { useBase } from '../context/BaseContext';
import CustomerPicker from '../DSCustomer/CustomerPicker';
import { fetchWorkCourses, workCourseLabel } from '../DSWorkCourse/workCourseApi';

const CourseEditDialog = ({ isOpen, onClose, course, onSave }) => {
  const [editedCourse, setEditedCourse] = useState(null);
  const [newOrg, setNewOrg] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newAccessCourseId, setNewAccessCourseId] = useState('');
  const [workCourses, setWorkCourses] = useState([]);
  const { dsOrgList } = useBase();

  useEffect(() => {
    fetchWorkCourses().then(setWorkCourses).catch(err => console.error('Error fetching work courses:', err));
  }, []);

  useEffect(() => {
    if (course) {
      setEditedCourse({
        ...course,
        access_org: course.access_org || [],
        course_names: course.course_names || [],
        access_course_ids: course.access_course_ids || [],
      });
    }
  }, [course]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedCourse(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddOrg = () => {
    if (newOrg.trim() && !editedCourse.access_org.includes(newOrg.trim())) {
      setEditedCourse(prev => ({
        ...prev,
        access_org: [...prev.access_org, newOrg.trim()]
      }));
      setNewOrg('');
    }
  };

  const handleRemoveOrg = (orgToRemove) => {
    setEditedCourse(prev => ({
      ...prev,
      access_org: prev.access_org.filter(org => org !== orgToRemove)
    }));
  };

  const handleAddCourseName = () => {
    if (newCourseName.trim() && !editedCourse.course_names.includes(newCourseName.trim())) {
      setEditedCourse(prev => ({
        ...prev,
        course_names: [...prev.course_names, newCourseName.trim()]
      }));
      setNewCourseName('');
    }
  };

  const handleRemoveCourseName = (nameToRemove) => {
    setEditedCourse(prev => ({
      ...prev,
      course_names: prev.course_names.filter(name => name !== nameToRemove)
    }));
  };

  const handleAddAccessCourseId = () => {
    if (newAccessCourseId.trim() && !editedCourse.access_course_ids.includes(newAccessCourseId.trim())) {
      setEditedCourse(prev => ({
        ...prev,
        access_course_ids: [...prev.access_course_ids, newAccessCourseId.trim()]
      }));
      setNewAccessCourseId('');
    }
  };

  const handleRemoveAccessCourseId = (idToRemove) => {
    setEditedCourse(prev => ({
      ...prev,
      access_course_ids: prev.access_course_ids.filter(id => id !== idToRemove)
    }));
  };

  const handlePickCustomer = (c) => {
    setEditedCourse(prev => ({ ...prev, custcd: c ? c.custcd : '', custName: c ? c.name : '' }));
  };

  // 방제작업코스(GC)가 원본: GC 에 고객사가 있으면 그것을 쓰고, 없을 때만 여기서 고른다
  const gc = editedCourse && workCourses.find(g => g.dscourseids === editedCourse.dscourseids);

  const handleSave = () => {
    if (editedCourse) {
      onSave(gc?.custcd ? { ...editedCourse, custcd: gc.custcd, custName: gc.custName || '' } : editedCourse);
      onClose();
    }
  };

  if (!editedCourse) return null;

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-2xl w-full bg-white rounded-lg p-6 max-h-[90vh] overflow-y-auto">
          <Dialog.Title className="text-lg font-medium mb-4">골프장 정보 수정</Dialog.Title>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">이름</label>
              <input
                type="text"
                name="name"
                value={editedCourse.name}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">주소</label>
              <input
                type="text"
                name="address"
                value={editedCourse.address}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">방제작업코스 <span className="text-xs text-gray-400">고르면 고객사 거래처를 거기서 불러옴</span></label>
              <select
                name="dscourseids"
                value={editedCourse.dscourseids || ''}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">— 없음 —</option>
                {editedCourse.dscourseids && !gc && <option value={editedCourse.dscourseids}>{editedCourse.dscourseids}</option>}
                {workCourses.map(g => <option key={g.dscourseids} value={g.dscourseids}>{workCourseLabel(g)}</option>)}
              </select>
            </div>

            {gc?.custcd
              ? <div>
                  <label className="block text-sm font-medium text-gray-700">고객사 거래처</label>
                  <div className="mt-1 text-sm"><span className="bg-blue-50 rounded-md px-2 py-1">{gc.custName || gc.custcd} · {gc.custcd}</span>
                    <span className="ml-2 text-xs text-gray-400">{gc.dscourseids} 에서 불러옴 — 바꾸려면 방제작업코스 화면에서</span></div>
                </div>
              : <CustomerPicker custcd={editedCourse.custcd} custName={editedCourse.custName} onPick={handlePickCustomer} />}

            <div>
              <label className="block text-sm font-medium text-gray-700">홀 수</label>
              <select
                name="numHole"
                value={editedCourse.numHole}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {Array.from({ length: 100 }, (_, i) => (i + 1) * 3).map((holes) => (
                  <option key={holes} value={holes}>
                    {holes}홀
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">접근 가능 조직</label>
              <div className="mt-2 flex gap-2">
                <select
                  value={newOrg}
                  onChange={(e) => setNewOrg(e.target.value)}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">조직을 선택하세요</option>
                  {dsOrgList.map((org) => (
                    <option key={org.ecnt} value={org.org}>
                      {org.org}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddOrg}
                  className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  추가
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {editedCourse.access_org.map((org, index) => (
                  <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1">
                    <span className="text-sm">{org}</span>
                    <button
                      onClick={() => handleRemoveOrg(org)}
                      className="ml-2 text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">코스 이름</label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="새 코스 추가"
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddCourseName}
                  className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  추가
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {editedCourse.course_names.map((name, index) => (
                  <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1">
                    <span className="text-sm">{name}</span>
                    <button
                      onClick={() => handleRemoveCourseName(name)}
                      className="ml-2 text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">접근 가능 코스 ID</label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newAccessCourseId}
                  onChange={(e) => setNewAccessCourseId(e.target.value)}
                  placeholder="새 코스 ID 추가"
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddAccessCourseId}
                  className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  추가
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {editedCourse.access_course_ids.map((id, index) => (
                  <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1">
                    <span className="text-sm">{id}</span>
                    <button
                      onClick={() => handleRemoveAccessCourseId(id)}
                      className="ml-2 text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              저장
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default CourseEditDialog; 