import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useBase } from './BaseContext';

const GlobalComponentContext = createContext();

const apiClient = axios.create({
  baseURL: 'https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

export const GlobalComponentProvider = ({ children }) => {
  const [globalChemicals, setGlobalChemicals] = useState([]);
  const [globalEquipments, setGlobalEquipments] = useState([]);
  const [globalWorkforces, setGlobalWorkforces] = useState([]); 
  const [globalMaintenances, setGlobalMaintenances] = useState([]);
  const { mapdscourseid } = useBase();


  // chemicals 변경 감지를 위한 useEffect 추가
  useEffect(() => {
    console.log('Global Chemicals updated:', globalChemicals);
  }, [globalChemicals]);

  // Fetch Global Chemicals
  const fetchGlobalChemicals = async () => {
    try {
      const response = await apiClient.get('/dschemical',);
      const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      const body = res_.body;
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      setGlobalChemicals(data);
      console.log('In First Global Chemical Fetch in GlobalComponentContext', data);
    } catch (err) {
      console.error('Error fetching global chemicals:', err);
    }
  };

  // Fetch Global Equipments
  const fetchGlobalEquipments = async () => {
    try {
      const response = await apiClient.get('/equipment');
      const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      const body = res_.body;
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      setGlobalEquipments(data);
      console.log('In First Global Equipment Fetch in GlobalComponentContext', data);
    } catch (err) {
      console.error('Error fetching global equipments:', err);
    }
  };

  // Fetch Global Workforces
  const fetchGlobalWorkforces = async () => {
    try {
      const response = await apiClient.get('/dsworkforce');
      const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      const body = res_.body;
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      setGlobalWorkforces(data);
      console.log('In First Global Workforce Fetch in GlobalComponentContext', data);
    } catch (err) {
      console.error('Error fetching global workforces:', err);
    }
  };

  // Add Global Chemical
  const addGlobalChemical = async (chemical) => {
    try {
      await apiClient.post('/dschemical', chemical);
      setGlobalChemicals(prev => [...prev, chemical]);
      console.log(`Global Chemical with id ${chemical.dsids} inserted successfully.`);
    } catch (err) {
      console.error('Error adding global chemical:', err);
    }
  };

  // Add Global Equipment
  const addGlobalEquipment = async (equipment) => {
    try {
      await apiClient.post('/equipment', equipment);  
      setGlobalEquipments(prev => [...prev, equipment]);
      console.log(`Global Equipment with id ${equipment.id} inserted successfully.`);
    } catch (err) {
      console.error('Error adding global equipment:', err);
    }
  };

  // Add Global Workforce
  const addGlobalWorkforce = async (workforce) => {
    try {
      await apiClient.post('/dsworkforce', workforce);
      setGlobalWorkforces(prev => [...prev, workforce]);
      console.log(`Global Workforce with id ${workforce.id} inserted successfully.`);
    } catch (err) {
      console.error('Error adding global workforce:', err);
    }
  };

  // Update Global Chemical
  const updateGlobalChemical = async (_chemical) => {
    try {
      const response = await apiClient.put('/dschemical', _chemical);
      if (response.status === 200) {
        setGlobalChemicals(prev => 
          prev.map(chemical => 
            chemical.dsids === _chemical.dsids ? _chemical : chemical
          )
        );
        console.log(`Global Chemical with id ${_chemical.dsids} updated successfully.`);
        return true;
      } else {
        return { success: false, error: 'Update failed' };
      }
    } catch (err) {
      console.error('Error updating global chemical:', err);
      return false;
    }
  };

  // Update Global Equipment
  const updateGlobalEquipment = async (equipment) => {
    try {
      await apiClient.put('/equipment', equipment);
      setGlobalEquipments((prev) => prev.map((item) => (item.id === equipment.id ? equipment : item)));  
      console.log(`Global Equipment with id ${equipment.id} updated successfully.`);
    } catch (err) {
      console.error('Error updating global equipment:', err);
    }
  };

  // Update Global Workforce
  const updateGlobalWorkforce = async (workforce) => {
    try {
      await apiClient.put('/dsworkforce', workforce, {
        params: { mapdscourseid: mapdscourseid },
      });
      setGlobalWorkforces((prev) => prev.map((item) => (item.id === workforce.id ? workforce : item)));
      console.log(`Global Workforce with id ${workforce.id} updated successfully.`);
    } catch (err) {
      console.error('Error updating global workforce:', err);
    }
  };

  // Delete Global Chemical
  const deleteGlobalChemical = async (dsids) => {
    try {
      const response = await apiClient.delete('/dschemical', {
        params: { id: dsids }
      });
      if (response.status === 200) {
        setGlobalChemicals(prev => prev.filter(chemical => chemical.dsids !== dsids));
        console.log(`Global Chemical with id ${dsids} deleted successfully.`,response);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error deleting global chemical:', err);
      return false;
    }
  };

  // Delete Global Equipment
  const deleteGlobalEquipment = async (equipmentId) => {
    try {
      const response = await apiClient.delete('/equipment', {
        params: { id: equipmentId }
      });
      if (response.status === 200) {
        setGlobalEquipments(prev => prev.filter(equipment => equipment.id !== equipmentId));
        console.log(`Global Equipment with id ${equipmentId} deleted successfully.`);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error deleting global equipment:', err);
      return false;
    }
  };

  // Delete Global Workforce
  const deleteGlobalWorkforce = async (workforceId) => {
    try {
      const response = await apiClient.delete('/dsworkforce', {
        params: { id: workforceId},
      });
      if (response.status === 200) {
        setGlobalWorkforces(prev => prev.filter(workforce => workforce.id !== workforceId));
        console.log(`Global Workforce with id ${workforceId} deleted successfully.`);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error deleting global workforce:', err);
      return false;
    }
  };
    // Fetch Maintenance Records
    const fetchGlobalMaintenances  = async () => {
      try {
        const response = await apiClient.get('/maintenance');
        const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        const body = res_.body;
        const data = typeof body === 'string' ? JSON.parse(body) : body;
        setGlobalMaintenances(data);
        console.log('In First Maintenance Records Fetch in GlobalComponentContext', data);
  
      } catch (err) {
        console.error('Error fetching maintenance records:', err);
      }
    };
  
    // Add Maintenance Record
    const addGlobalMaintenance = async (record) => {
      try {
        await apiClient.post('/maintenance', record);
        setGlobalMaintenances(prev => [...prev, record]);
        console.log(`Maintenance Record with id ${record.id} inserted successfully.`);
        return true;
  
      } catch (err) {
        console.error('Error adding maintenance record:', err);
        return false;
      }
    };
  
    // Update Maintenance Record
    const updateGlobalMaintenance = async (record) => {
      try {
        const response = await apiClient.put('/maintenance', record);
        if (response.status === 200) {
  
          setGlobalMaintenances(prev => 
            prev.map(r => 
              r.id === record.id ? record : r
            )
          );
  
          console.log(`Maintenance Record with id ${record.id} updated successfully.`);
          return true;
        } else {
          return false;
        }
      } catch (err) {
        console.error('Error updating maintenance record:', err);
        return false;
      }
    };
  
    // Delete Maintenance Record
    const deleteGlobalMaintenance = async (recordId, equipmentId) => {
      try {
        const response = await apiClient.delete('/maintenance', {
          params: { id: recordId, equipment_id: equipmentId }
  
        });
        if (response.status === 200) {
          setGlobalMaintenances(prev => prev.filter(record => record.id !== recordId));
          console.log(`Maintenance Record with id ${recordId} deleted successfully.`);
          return true;
        }
  
        return false;
      } catch (err) {
        console.error('Error deleting maintenance record:', err);
        return false;
      }
    };

  return (
    <GlobalComponentContext.Provider
      value={{
        globalChemicals,
        setGlobalChemicals,
        globalEquipments,
        globalWorkforces, 
        globalMaintenances,
        fetchGlobalChemicals,
        fetchGlobalEquipments,
        fetchGlobalWorkforces,
        addGlobalChemical,
        addGlobalEquipment,
        addGlobalWorkforce,

        updateGlobalChemical,
        updateGlobalEquipment,
        updateGlobalWorkforce,
        deleteGlobalChemical,
        deleteGlobalEquipment,
        deleteGlobalWorkforce,
        fetchGlobalMaintenances,
        addGlobalMaintenance,
        updateGlobalMaintenance,
        deleteGlobalMaintenance,
      }}
    >
      {children}
    </GlobalComponentContext.Provider>
  );
};

export const useGlobalComponent = () => {
  return useContext(GlobalComponentContext);
};
