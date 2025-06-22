import React from 'react';
import { useBase } from '../context/BaseContext';
import EditableButtonList from '../components/EditableButtonList';
import EditableObjectList from '../components/EditableObjectList';
import { v4 as uuidv4 } from 'uuid';

const BaseInfoManager = () => {
  const {

    dsrankOrder,
    dsOrgOrder,
    dstypeOrder,
    dsEQtypeOrder,
    dsEQtypeSymMap,
    dssclearConditions,
    dsprecipitationConditions,
    dswindConditions,
    dsHolidays,
    dsOrgList,
    dsTaskList,
    dsEQCategoryTypeMAP,
    
    // 수정 함수들
    updateDsrankOrder,
    updateDsOrgOrder,
    updateDstypeOrder,
    updateDsEQtypeOrder,
    updateDsEQtypeSymMap,
    updateDssclearConditions,
    updateDsprecipitationConditions,
    updateDswindConditions,
    updateDsHolidays,
    updateDsOrgList,
    updateDsTaskList,
    updateDsEQCategoryTypeMAP,
    updateBaseInfoAPI
  } = useBase();

  // dsrankOrder를 변환하는 함수
  const transformList = (items) => {
    return items.map(item => ({
      id: uuidv4(),
      value: item
    }));
  };



  const transformEquipmentData = (order, symMap, categoryMap) => {
    return order.map(category => {
      return {
        id: uuidv4(),
        category: category,
        symbol: symMap[category],
        type: Array.isArray(categoryMap[category]) ? categoryMap[category].join(',') : categoryMap[category]
      };
    });
  };

  const revertEquipmentData = async (transformedData) => {
    const newOrder = transformedData.map(item => item.category);
    const newSymMap = {};
    const newCategoryMap = {};
  
    transformedData.forEach(item => {
      newSymMap[item.category] = item.symbol;
      newCategoryMap[item.category] = item.type.includes(',') ? item.type.split(',') : [item.type];
    });

    updateDsEQtypeOrder(newOrder);
    updateDsEQtypeSymMap(newSymMap);
    updateDsEQCategoryTypeMAP(newCategoryMap);
    await handleSave();
    return {
      dsEQtypeOrder: newOrder,
      dsEQtypeSymMap: newSymMap,
      dsEQCategoryTypeMAP: newCategoryMap
    };
  };

  // 각 데이터 변경 핸들러
  const handleRankChange = async (newItems) => {
    updateDsrankOrder(newItems);
    console.log('handleRankChange', newItems);
    await handleSave({dsrankOrder: newItems});
  };

  const handleOrgChange = async (newItems) => {
    updateDsOrgOrder(newItems);
    await handleSave({dsOrgOrder: newItems});
  };

  const handleOrgListChange = async (newItems) => {
    updateDsOrgList(newItems);
    await handleSave({dsOrgList: newItems});
  };

  const handleDssclearConditionsChange = async (newItems) => {
    updateDssclearConditions(newItems);
    await handleSave({dssclearConditions: newItems});
  };

  const handleDsprecipitationConditionsChange = async (newItems) => {
    updateDsprecipitationConditions(newItems);
    await handleSave({dsprecipitationConditions: newItems});
  };

  const handleDswindConditionsChange = async (newItems) => {
    updateDswindConditions(newItems);
    await handleSave({dswindConditions: newItems});
  };

  const handleDsHolidaysChange = async (newItems) => {
    updateDsHolidays(newItems);
    await handleSave();
  };

  const handleSave = async (baseinfo_) => {
    try {
      await updateBaseInfoAPI( baseinfo_ );
      console.log('handleSave', baseinfo_);
      alert('저장되었습니다.');
    } catch (error) {
      console.error('저장 중 오류 발생:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        BaseInfo 관리
      </h1>
      
      <div className="flex flex-col gap-6">
        <EditableButtonList
          title="직급정보"
          items={dsrankOrder}
          onItemsChange={handleRankChange}
        />

        <EditableButtonList
          title="조직 순서"
          items={dsOrgOrder}
          onItemsChange={handleOrgChange}
        />



        <EditableButtonList
          title="날씨정보"
          items={dsprecipitationConditions }  
          onItemsChange={handleDsprecipitationConditionsChange}
        />

        <EditableButtonList
          title="날씨정보2"
          items={dssclearConditions}  
          onItemsChange={handleDssclearConditionsChange}
        />

        <EditableButtonList
          title="날씨정보3"
          items={dswindConditions}  
          onItemsChange={handleDswindConditionsChange}
        />

        <EditableObjectList
          title="조직 정보"
          items={dsOrgList}
          onItemsChange={handleOrgListChange}
        />
        <EditableObjectList
          title="장비 타입"
          items={transformEquipmentData(dsEQtypeOrder, dsEQtypeSymMap, dsEQCategoryTypeMAP)}
          onItemsChange={revertEquipmentData}
        />
        {/* <EditableButtonList
          title="휴일정보"
          items={dsHolidays}  
          onItemsChange={handleDsHolidaysChange}
        /> */}
        {/* <EditableButtonList
          title="타입 순서"
          items={Object.keys(dstypeOrder)}
          onItemsChange={handleTypeChange}
        />

        <EditableButtonList
          title="장비 타입 순서"
          items={Object.keys(dsEQtypeOrder)}
          onItemsChange={handleEqTypeChange}
        /> */}


      </div>
    </div>
  );
};

export default BaseInfoManager; 