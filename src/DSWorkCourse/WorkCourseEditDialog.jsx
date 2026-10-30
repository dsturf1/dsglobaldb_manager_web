import React, { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { useBase } from '../context/BaseContext';
import CustomerPicker from '../DSCustomer/CustomerPicker';
import { fetchCourses } from '../DSMapCourse/courseApi';
import { fetchWarehouses } from '../DSWarehouse/warehouseApi';

// 방제작업코스(GC)가 용역 현장 짝의 원본: 맵코스(mapdscourseid)·고객사(custcd·custName)·용역창고(outwhcd + 이름 outwarehouse).
// 골프장·창고 화면은 GC 를 골라 여기 값을 불러온다. outwarehouse 는 약품·방제 기본정보가 이름으로 쓰므로 이름도 같이 둔다.

const WorkCourseEditDialog = ({ isOpen, onClose, course, onSave }) => {
  const [editedCourse, setEditedCourse] = useState(null);
  const [newOrg, setNewOrg] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [mapCourses, setMapCourses] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const { dsOrgList } = useBase();

  useEffect(() => {
    fetchCourses().then(setMapCourses).catch(err => console.error('Error fetching courses:', err));
    fetchWarehouses().then(ws => setWarehouses(ws.filter(w => w.active !== 'N')
      .sort((a, b) => (!a.name.includes('용역')) - (!b.name.includes('용역')) || a.name.localeCompare(b.name, 'ko'))))
      .catch(err => console.error('Error fetching warehouses:', err));
  }, []);

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

  const handlePickCustomer = (c) => {
    setEditedCourse(prev => ({ ...prev, custcd: c ? c.custcd : '', custName: c ? c.name : '' }));
  };

  const handlePickOutWarehouse = (e) => {
    const w = warehouses.find(x => x.whcd === e.target.value);
    setEditedCourse(prev => ({ ...prev, outwhcd: w ? w.whcd : '', outwarehouse: w ? w.name : '' }));
  };

  // 이름만 있고 코드가 없던 예전 값은 이름으로 찾아 보여 준다
  const outWh = editedCourse && (warehouses.find(w => w.whcd === editedCourse.outwhcd)
    || warehouses.find(w => w.name === editedCourse.outwarehouse));

  const handleSave = () => {
    if (editedCourse) {
      onSave(outWh && !editedCourse.outwhcd ? { ...editedCourse, outwhcd: outWh.whcd } : editedCourse);
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">ID</label>
                <input
                  type="text"
                  name="dscourseids"
                  value={editedCourse.dscourseids}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">mapdscourseid</label>
                <select
                  name="mapdscourseid"
                  value={editedCourse.mapdscourseid || ''}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">맵코스를 선택하세요</option>
                  {editedCourse.mapdscourseid && !mapCourses.some(c => c.id === editedCourse.mapdscourseid)
                    && <option value={editedCourse.mapdscourseid}>{editedCourse.mapdscourseid}</option>}
                  {mapCourses.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">골프장명</label>
                <input
                  type="text"
                  name="name"
                  value={editedCourse.name}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">조직</label>
                <input
                  type="text"
                  name="org"
                  value={editedCourse.org}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">전담조직</label>
                <input
                  type="text"
                  name="dedicated_org"
                  value={editedCourse.dedicated_org}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Active</label>
                <select
                  name="active"
                  value={editedCourse.active}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="Y">예</option>
                  <option value="N">아니오</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">창고</label>
                <input
                  type="text"
                  name="warehouse"
                  value={editedCourse.warehouse}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">용역</label>
                <select
                  name="outsource"
                  value={editedCourse.outsource}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="Y">예</option>
                  <option value="N">아니오</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">용역조직</label>
                <select
                  name="outorg"
                  value={editedCourse.outorg}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">조직을 선택하세요</option>
                  {dsOrgList.map((org) => (
                    <option key={org.org_ecnt} value={org.org}>
                      {org.org}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">용역창고</label>
                <select
                  value={outWh?.whcd || ''}
                  onChange={handlePickOutWarehouse}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">{editedCourse.outwarehouse && !outWh ? `${editedCourse.outwarehouse} (창고 목록에 없음)` : '— 없음 —'}</option>
                  {warehouses.map(w => <option key={w.whcd} value={w.whcd}>{w.name} ({w.whcd})</option>)}
                </select>
              </div>
            </div>

            <CustomerPicker custcd={editedCourse.custcd} custName={editedCourse.custName} onPick={handlePickCustomer} />

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

export default WorkCourseEditDialog; 