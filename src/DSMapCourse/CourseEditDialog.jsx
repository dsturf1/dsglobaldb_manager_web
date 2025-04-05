import React, { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';

const CourseEditDialog = ({ isOpen, onClose, course, onSave }) => {
  const [editedCourse, setEditedCourse] = useState(null);
  const [newOrg, setNewOrg] = useState('');
  const [newCourseName, setNewCourseName] = useState('');

  useEffect(() => {
    if (course) {
      setEditedCourse(course);
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

  const handleSave = () => {
    if (editedCourse) {
      onSave(editedCourse);
      onClose();
    }
  };

  if (!editedCourse) return null;

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-2xl w-full bg-white rounded-lg p-6">
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
                <input
                  type="text"
                  value={newOrg}
                  onChange={(e) => setNewOrg(e.target.value)}
                  placeholder="새 조직 추가"
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
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