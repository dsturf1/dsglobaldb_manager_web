import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useBase } from './BaseContext';

const ComponentContext = createContext();

const apiClient = axios.create({
  baseURL: 'https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

export const ComponentProvider = ({ children }) => {
  const [chemicals, setChemicals] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [workforces, setWorkforces] = useState([]);
  const { mapdscourseid } = useBase();

  // chemicals 변경 감지를 위한 useEffect 추가
  useEffect(() => {
    console.log('Chemicals updated:', chemicals);
  }, [chemicals]);

  // Fetch Chemicals
  const fetchChemicals = async () => {
    try {
      const response = await apiClient.get('/dschemical',);
      const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      const body = res_;// 이상하게 Proxy를 사용하면 {status:200, body:} 가 아닌, 
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      setChemicals(data);
      console.log('In First Chemmical Fetch in ComponentContext', data);
    } catch (err) {
      console.error('Error fetching chemicals:', err);
    }
  };

  // Fetch Equipments
  const fetchEquipments = async () => {
    try {
      // const response = await apiClient.get('/equipment', {
      //   params: { mapdscourseid: mapdscourseid },
      // });
      const response = await apiClient.get('/equipment');
      const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      const body = res_.body;
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      setEquipments(data);
    } catch (err) {
      console.error('Error fetching equipments:', err);
    }
  };

  // Fetch Workforces
  const fetchWorkforces = async () => {
    try {
      const response = await apiClient.get('/dsworkforce');
      const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      const body = res_.body;
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      setWorkforces(data);
    } catch (err) {
      console.error('Error fetching workforces:', err);
    }
  };

  // Add Chemical
  const addChemical = async (chemical) => {
    try {
      await apiClient.post('/localchemical', chemical, {
        params: { mapdscourseid: mapdscourseid },
      });
      setChemicals((prev) => [...prev, chemical]);
      console.log(`Chemical with id ${chemical.dsids} inserted successfully.`);
    } catch (err) {
      console.error('Error adding chemical:', err);
    }
  };

  // Add Equipment
  const addEquipment = async (equipment) => {
    try {
      await apiClient.post('/localequipment', equipment, {
        params: { mapdscourseid: mapdscourseid },
      });
      setEquipments((prev) => [...prev, equipment]);
      console.log(`Equipment with id ${equipment.id} inserted successfully.`);
    } catch (err) {
      console.error('Error adding equipment:', err);
    }
  };

  // Add Workforce
  const addWorkforce = async (workforce) => {
    try {
      await apiClient.post('/localworkforce', workforce, {
        params:{ mapdscourseid: mapdscourseid },
      });
      setWorkforces((prev) => [...prev, workforce]);
      console.log(`Workforce with id ${workforce.id} inserted successfully.`);
    } catch (err) {
      console.error('Error adding workforce:', err);
    }
  };

  // Update Chemical
  const updateChemical = async (chemical) => {
    try {
      const response = await apiClient.put('/dschemical', chemical);
      if (response.status === 200) {
        console.log(`Chemical with id ${chemical.dsids} updated successfully.`);
        return true;
      } else {
        return { success: false, error: 'Update failed' };
      }
    } catch (err) {
      console.error('Error updating chemical:', err);
      return false;
    }
  };

  // Update Equipment
  const updateEquipment = async (equipment) => {
    try {
      await apiClient.put('/localequipment', equipment, {
        params: { mapdscourseid: mapdscourseid },
      });
      setEquipments((prev) => prev.map((item) => (item.id === equipment.id ? equipment : item)));
      console.log(`Equipment with id ${equipment.id} updated successfully.`);
    } catch (err) {
      console.error('Error updating equipment:', err);
    }
  };

  // Update Workforce
  const updateWorkforce = async (workforce) => {
    try {
      await apiClient.put('/localworkforce', workforce, {
        params: { mapdscourseid: mapdscourseid },
      });
      setWorkforces((prev) => prev.map((item) => (item.id === workforce.id ? workforce : item)));
      console.log(`Workforce with id ${workforce.id} updated successfully.`);
    } catch (err) {
      console.error('Error updating workforce:', err);
    }
  };

  // Delete Chemical
  const deleteChemical = async (dsids) => {
    try {
      const response = await apiClient.delete('/dschemical', {
        params: { id: dsids }
      });
      if (response.status === 200) {
        console.log(`Chemical with id ${dsids} deleted successfully.`);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error deleting chemical:', err);
      return false;
    }
  };

  // Delete Equipment
  const deleteEquipment = async (equipmentId) => {
    try {
      await apiClient.delete('/localequipment', {
        params: { id: equipmentId, mapdscourseid: mapdscourseid },
      });
      setEquipments((prev) => prev.filter((item) => item.id !== equipmentId));
      console.log(`Equipment with id ${equipmentId} deleted successfully.`);
    } catch (err) {
      console.error('Error deleting equipment:', err);
    }
  };

  // Delete Workforce
  const deleteWorkforce = async (workforceId) => {
    try {
      await apiClient.delete('/localworkforce', {
        params: { id: workforceId, mapdscourseid: mapdscourseid},
      });
      setWorkforces((prev) => prev.filter((item) => item.id !== workforceId));
      console.log(`Workforce with id ${workforceId} deleted successfully.`);
    } catch (err) {
      console.error('Error deleting workforce:', err);
    }
  };

  return (
    <ComponentContext.Provider
      value={{
        chemicals,
        setChemicals,
        equipments,
        workforces,
        fetchChemicals,
        fetchEquipments,
        fetchWorkforces,
        addChemical,
        addEquipment,
        addWorkforce,
        updateChemical,
        updateEquipment,
        updateWorkforce,
        deleteChemical,
        deleteEquipment,
        deleteWorkforce,
      }}
    >
      {children}
    </ComponentContext.Provider>
  );
};

export const useComponent = () => {
  return useContext(ComponentContext);
};
