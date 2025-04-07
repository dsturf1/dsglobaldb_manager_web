import React, { useState, useEffect } from 'react';
import EditableObjectList from './EditableObjectList';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'https://e0x0fsw125.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

const EditDialog = ({ isOpen, onClose, item, onSave, title }) => {
  const [formData, setFormData] = useState(item || {});

  useEffect(() => {
    setFormData(item || {});
  }, [item]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg w-96">
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-base font-medium text-gray-700">ID</label>
              <input
                type="text"
                name="dsids"
                value={formData.dsids || ''}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                required
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700">이름</label>
              <input
                type="text"
                name="name"
                value={formData.name || ''}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                required
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700">단위</label>
              <input
                type="text"
                name="unit"
                value={formData.unit || ''}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                required
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700">타입</label>
              <input
                type="text"
                name="type"
                value={formData.type || ''}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                required
              />
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700">작업여부</label>
              <select
                name="flgWork"
                value={formData.flgWork || 'Y'}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
              >
                <option value="Y">예</option>
                <option value="N">아니오</option>
              </select>
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700">외부여부</label>
              <select
                name="flgOut"
                value={formData.flgOut || 'Y'}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
              >
                <option value="Y">예</option>
                <option value="N">아니오</option>
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-base font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const WorkBaseInfoManager = () => {
  const [workBaseInfo, setWorkBaseInfo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orgInfo, setOrgInfo] = useState([]);
  const [outsourceInfo, setOutsourceInfo] = useState([]);
  const [taskInfo, setTaskInfo] = useState([]);
  const [vehicleInfo, setVehicleInfo] = useState([]);
  
  // Dialog 상태 관리
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    type: null,
    item: null,
    mode: 'add' // 'add' or 'edit'
  });

  useEffect(() => {
    const fetchWorkBaseInfo = async () => {
      try {
        const response = await apiClient.get('/baseinfo');
        console.log('API Response:', response.data);
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        
        if (!data || !data.body) {
          throw new Error('서버에서 올바른 데이터를 받지 못했습니다.');
        }
        
        const workBaseInfoData = {...data.body}
        console.log('workBaseInfoData:', workBaseInfoData);
        setWorkBaseInfo(workBaseInfoData);

        if (workBaseInfoData.org_info) {
          console.log('org_info:', workBaseInfoData.org_info);
          setOrgInfo(workBaseInfoData.org_info);
        } else {
          console.log('org_info is undefined or null');
          setOrgInfo([]);
        }
        if (workBaseInfoData.outsource_info) setOutsourceInfo(workBaseInfoData.outsource_info);
        if (workBaseInfoData.task_info) setTaskInfo(workBaseInfoData.task_info);
        if (workBaseInfoData.vehicle_info) setVehicleInfo(workBaseInfoData.vehicle_info);

        setError(null);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError(error.message || '데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkBaseInfo();
  }, []);

  const handleSave = async (newData = null) => {
    try {
      const dataToSave = newData || {
        org_info: orgInfo,
        outsource_info: outsourceInfo,
        task_info: taskInfo,
        vehicle_info: vehicleInfo
      };
      console.log('Saving data:', dataToSave);
      // await apiClient.post('/baseinfo', dataToSave);
      const response = await apiClient.put('/baseinfo', dataToSave);
      console.log('API Response:', response.data);
      console.log(dataToSave);
    } catch (error) {
      console.error('저장 중 오류 발생:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleDialogOpen = (type, mode, item = null) => {
    setDialogState({
      isOpen: true,
      type,
      item,
      mode
    });
  };

  const handleDialogClose = () => {
    setDialogState({
      isOpen: false,
      type: null,
      item: null,
      mode: 'add'
    });
  };

  const handleItemSave = (newItem) => {
    let updatedData;
    switch (dialogState.type) {
      case 'outsource':
        if (dialogState.mode === 'add') {
          updatedData = [...outsourceInfo, newItem];
          setOutsourceInfo(updatedData);
        } else {
          updatedData = outsourceInfo.map(item => 
            item.dsids === newItem.dsids ? newItem : item
          );
          setOutsourceInfo(updatedData);
        }
        break;
      case 'task':
        if (dialogState.mode === 'add') {
          updatedData = [...taskInfo, newItem];
          setTaskInfo(updatedData);
        } else {
          updatedData = taskInfo.map(item => 
            item.dsids === newItem.dsids ? newItem : item
          );
          setTaskInfo(updatedData);
        }
        break;
      case 'vehicle':
        if (dialogState.mode === 'add') {
          updatedData = [...vehicleInfo, newItem];
          setVehicleInfo(updatedData);
        } else {
          updatedData = vehicleInfo.map(item => 
            item.dsids === newItem.dsids ? newItem : item
          );
          setVehicleInfo(updatedData);
        }
        break;
    }
    handleSave({
      org_info: orgInfo,
      outsource_info: dialogState.type === 'outsource' ? updatedData : outsourceInfo,
      task_info: dialogState.type === 'task' ? updatedData : taskInfo,
      vehicle_info: dialogState.type === 'vehicle' ? updatedData : vehicleInfo
    });
  };

  const handleItemDelete = (type, id) => {
    let updatedData;
    switch (type) {
      case 'outsource':
        updatedData = outsourceInfo.filter(item => item.dsids !== id);
        setOutsourceInfo(updatedData);
        break;
      case 'task':
        updatedData = taskInfo.filter(item => item.dsids !== id);
        setTaskInfo(updatedData);
        break;
      case 'vehicle':
        updatedData = vehicleInfo.filter(item => item.dsids !== id);
        setVehicleInfo(updatedData);
        break;
    }
    handleSave({
      org_info: orgInfo,
      outsource_info: type === 'outsource' ? updatedData : outsourceInfo,
      task_info: type === 'task' ? updatedData : taskInfo,
      vehicle_info: type === 'vehicle' ? updatedData : vehicleInfo
    });
  };

  const renderTable = (title, items, type) => (
    <div className="bg-white shadow-md rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button
          onClick={() => handleDialogOpen(type, 'add')}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
        >
          추가
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="px-4 py-2 text-center">ID</th>
              <th className="px-4 py-2 text-center">이름</th>
              <th className="px-4 py-2 text-center">단위</th>
              <th className="px-4 py-2 text-center">타입</th>
              <th className="px-4 py-2 text-center">작업여부</th>
              <th className="px-4 py-2 text-center">외부여부</th>
              <th className="px-4 py-2 text-center">작업</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.dsids}>
                <td className="px-4 py-2 text-center">{item.dsids}</td>
                <td className="px-4 py-2 text-center">{item.name}</td>
                <td className="px-4 py-2 text-center">{item.unit}</td>
                <td className="px-4 py-2 text-center">{item.type}</td>
                <td className="px-4 py-2 text-center">{item.flgWork}</td>
                <td className="px-4 py-2 text-center">{item.flgOut}</td>
                <td className="px-4 py-2 text-center">

                  <button
                    onClick={() => handleDialogOpen(type, 'edit', item)}
                    className="text-indigo-600 hover:text-indigo-900 mr-2"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleItemDelete(type, item.dsids)}
                    className="text-red-600 hover:text-red-900"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">BaseInfo 관리</h1>
      
      <div className="flex flex-col gap-6">
        <EditableObjectList
          title="조직 정보"
          items={orgInfo}
          onItemsChange={(newItems) => {
            setOrgInfo(newItems);
            handleSave({
              org_info: newItems,
              outsource_info: outsourceInfo,
              task_info: taskInfo,
              vehicle_info: vehicleInfo
            });
          }}
        />

        {renderTable('용역 정보', outsourceInfo, 'outsource')}
        {renderTable('작업 정보', taskInfo, 'task')}
        {renderTable('차량 정보', vehicleInfo, 'vehicle')}
      </div>

      <EditDialog
        isOpen={dialogState.isOpen}
        onClose={handleDialogClose}
        item={dialogState.item}
        onSave={handleItemSave}
        title={`${dialogState.mode === 'add' ? '추가' : '수정'} - ${dialogState.type === 'outsource' ? '용역 정보' : dialogState.type === 'task' ? '작업 정보' : '차량 정보'}`}
      />
    </div>
  );
};

export default WorkBaseInfoManager; 