import React, { useMemo, useState, useEffect } from 'react';
import { getUrl} from 'aws-amplify/storage';
import defaultImage from '../assets/equipment_with_larger_logo.png';
import { useGlobalComponent } from '../context/GlobalComponentContext';
import { useBase } from '../context/BaseContext';
import EditEquipmentDialog from './EditEquipmentDialog';
import { useComponent } from '../context/ComponentContext';
import ViewMaintenanceDialog from './ViewMaintenanceDialog';

// 이미지 URL 캐시를 위한 객체
const imageUrlCache = new Map();

const LoadingSpinner = () => (
  <div className="min-h-[400px] flex items-center justify-center">
    <span className="loading loading-spinner loading-lg text-primary"></span>
  </div>
);

export default function DSEquipmentTable() {
  const { globalEquipments, updateGlobalEquipment, deleteGlobalEquipment, addGlobalEquipment, fetchGlobalEquipments,globalMaintenances,fetchGlobalMaintenances} = useGlobalComponent();
  // const {maintenances, fetchMaintenances} = useComponent();
  const { dsOrgList,  dsEQCategoryTypeMAP} = useBase();
  
  // 검색어 상태
  const [searchTerm, setSearchTerm] = useState('');
  
  // 편집 모달 상태
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // 필터 상태
  const [filters, setFilters] = useState({
    category: 'all',    
    type: 'all',
    org: '전체'  // 담당부서 필터 추가
  });

  // 이미지 로딩 상태를 관리하는 객체
  const [imageLoadingStates, setImageLoadingStates] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);

  // 이미지 URL이 추가된 장비 데이터 상태
  const [equipmentImages, setEquipmentImages] = useState({});

  // 유지보수 이력 모달 상태
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);

  // 장비별 유지보수 이력 갯수를 계산하는 함수
  const getMaintenanceCount = useMemo(() => {
    const countMap = {};  
    globalMaintenances?.forEach(maintenance => {
      if (maintenance.equipment_id) {
        countMap[maintenance.equipment_id] = (countMap[maintenance.equipment_id] || 0) + 1;

      }
    });
    return countMap;
  // }, [maintenances]);
  }, [globalMaintenances]);

  // 필터 옵션 추출 로직 수정
  const filterOptions = useMemo(() => {
    // 분류(카테고리) 옵션
    const categories = ['전체', ...Object.keys(dsEQCategoryTypeMAP)]
      .sort((a, b) => {
        if (a === '전체') return -1;
        if (b === '전체') return 1;
        return a.localeCompare(b);
      });
    
    // 선택된 카테고리에 따른 유형 옵션 추출
    const getTypeOptions = (selectedCategory) => {
      if (selectedCategory === 'all' || selectedCategory === '전체') {
        // 모든 유형을 중복 없이 추출
        const allTypes = new Set();
        Object.values(dsEQCategoryTypeMAP).forEach(types => {
          types.forEach(type => allTypes.add(type));
        });
        return ['전체', ...Array.from(allTypes).sort()];
      }
      return ['전체', ...(dsEQCategoryTypeMAP[selectedCategory] || [])].sort();
    };

    // 담당부서 옵션
    const orgs = [
      { org: '전체', mapdscourseid: '전체' },  // value도 '전체'로 통일
      ...dsOrgList
    ];

    return {
      category: categories.map(cat => ({
        label: cat,
        value: cat === '전체' ? 'all' : cat
      })),
      type: getTypeOptions(filters.category).map(type => ({
        label: type,
        value: type === '전체' ? 'all' : type
      })),
      org: orgs.map(org => ({
        label: org.org,
        value: org.mapdscourseid
      }))
    };
  }, [dsEQCategoryTypeMAP, filters.category, dsOrgList]);

  // 필터 선택 컴포넌트 추가
  const FilterSelect = ({ label, value, onChange, options }) => (
    <div className="flex items-center gap-2">
      <span className="text-sm">{label}:</span>
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        className="select select-bordered select-sm"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  // filteredAndSortedEquipments 로직 수정
  const filteredAndSortedEquipments = useMemo(() => {
    if (!globalEquipments) return [];
    
    return [...globalEquipments]
      .filter(equipment => {
        const searchMatch = searchTerm === '' || 
          (equipment.name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        const categoryMatch = filters.category === 'all' || equipment.category === filters.category;
        const typeMatch = filters.type === 'all' || equipment.type === filters.type;
        const orgMatch = filters.org === '전체' || equipment.mapdscourseid === filters.org;
        return searchMatch && categoryMatch && typeMatch && orgMatch;
      })
      .sort((a, b) => {
        // 1. 분류 순서로 정렬
        const categoryOrder = Object.keys(dsEQCategoryTypeMAP);
        const categoryA = a.category || '';
        const categoryB = b.category || '';
        const categoryIndexA = categoryOrder.indexOf(categoryA);
        const categoryIndexB = categoryOrder.indexOf(categoryB);
        
        // 카테고리가 없는 경우 맨 뒤로
        if (categoryIndexA === -1 && categoryIndexB === -1) return 0;
        if (categoryIndexA === -1) return 1;
        if (categoryIndexB === -1) return -1;
        
        if (categoryIndexA !== categoryIndexB) {
          return categoryIndexA - categoryIndexB;
        }

        // 2. 같은 분류 내에서는 유형순
        const typeOrder = dsEQCategoryTypeMAP[categoryA] || [];
        const typeA = a.type || '';
        const typeB = b.type || '';
        const typeIndexA = typeOrder.indexOf(typeA);
        const typeIndexB = typeOrder.indexOf(typeB);
        
        // 유형이 없는 경우 맨 뒤로
        if (typeIndexA === -1 && typeIndexB === -1) return 0;
        if (typeIndexA === -1) return 1;
        if (typeIndexB === -1) return -1;
        
        if (typeIndexA !== typeIndexB) {
          return typeIndexA - typeIndexB;
        }

        // 3. 같은 유형 내에서는 이름순
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [globalEquipments, filters, searchTerm, dsEQCategoryTypeMAP]);

  // 이미지 URL을 가져오는 함수를 최적화
  const getImageUrl = async (equipment) => {
    const cacheKey = `${equipment.mapdscourseid}/${equipment.id}/${equipment.imageVersion || ''}`;
    
    if (imageUrlCache.has(cacheKey)) {
      return imageUrlCache.get(cacheKey);
    }

    try {
      setImageLoadingStates(prev => ({ ...prev, [equipment.id]: true }));
      const { url } = await getUrl({
        path: `public/equipment/${equipment.mapdscourseid}/${equipment.id}.png`,
        options: {
          cacheControl: '3600',
          expiresIn: 3600,
          validateObjectExistence: false
        }
      });
      
      imageUrlCache.set(cacheKey, url);
      setImageLoadingStates(prev => ({ ...prev, [equipment.id]: false }));
      return url;
    } catch (error) {
      setImageLoadingStates(prev => ({ ...prev, [equipment.id]: false }));
      return null;
    }
  };

  // 이미지 로딩 로직을 수정 버튼 클릭 시로 이동
  const handleEdit = async (equipment) => {
    // 이미지 URL 가져오기
    if (!equipmentImages[equipment.id]) {
      try {
        const imageURL = await getImageUrl(equipment);
        setEquipmentImages(prev => ({
          ...prev,
          [equipment.id]: imageURL
        }));
      } catch (error) {
        console.error('Error getting image URL:', error);
      }
    }
    
    // 수정 모달 열기
    setEditingEquipment({
      ...equipment,
      imageURL: equipmentImages[equipment.id]
    });
  };

  // 초기 데이터 로딩 수정
  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchGlobalEquipments();
        await fetchGlobalMaintenances();
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setDataLoaded(true);
      }
    };

    loadData();
  }, []);

  // 필터 변경 핸들러
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value,
      // 분류가 변경되면 유형을 'all'로 초기화
      ...(filterType === 'category' ? { type: 'all' } : {})
    }));
  };

  // 날짜 포맷 함수
  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('ko-KR');
  };

  // 금액 포맷 함수
  const formatCurrency = (amount) => {
    return amount?.toLocaleString('ko-KR') + '원';
  };

    // 선택된 장비의 유지보수 이력 필터링
    const getEquipmentMaintenances = (equipmentId) => {
      // return maintenances?.filter(m => m.equipment_id === equipmentId) || [];
      return globalMaintenances?.filter(m => m.equipment_id === equipmentId) || []; 
    };
  
  
    // 유지보수 이력 모달 열기
    const handleOpenMaintenance = (equipment) => {
      setSelectedEquipment(equipment);
      setIsMaintenanceModalOpen(true);
    };

  // 신규 장비 추가 핸들러
  const handleAddNew = () => {
    setEditingEquipment({
      category: '',
      type: '',
      name: '',
      modelNumber: '',
      manufacturer: '',
      seller: '',
      purchaseDate: '',
      cost: 0,
      owner: '',
      location: '',
      desc: '',
      id: '',
      mapdscourseid: ''
    });
    setIsAddModalOpen(true);
  };

  // 모달 닫기 핸들러
  const handleCloseModal = () => {
    setEditingEquipment(null);
    setIsAddModalOpen(false);
  };

  // mapdscourseid를 org로 변환하는 함수
  const getOrgName = (mapdscourseid) => {
    const org = dsOrgList.find(item => item.mapdscourseid === mapdscourseid);
    return org?.org || '-';
  };

  const handleDelete = async (id) => {
    if (window.confirm('정말 삭제하시겠습니까?')) {
      try {
        const result = await deleteGlobalEquipment(id);
        if (!result){
          alert('삭제에 실패했습니다.');
        }
      } catch (error) {
        console.error('Error deleting equipment:', error);
        alert('삭제 중 오류가 발생했습니다.');
      }
    }
  };

  // 전체 로딩 상태 확인 수정
  const isLoading = !dataLoaded || !globalEquipments;

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-4">
      {/* 검색 및 필터 UI */}
      <div className="mb-4">
        <div className="flex justify-between items-center">
          {/* 왼쪽: 제목과 검색창 */}
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold">장비정보</span>
            <div className="flex items-center gap-2">
              <span className="text-sm">검색:</span>
              <input
                type="text"
                placeholder="장비명으로 검색..."
                className="input input-bordered input-sm w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              className="btn btn-primary btn-sm"
              onClick={handleAddNew}
            >
              신규 추가
            </button>
          </div>

          {/* 오른쪽: 필터들 - 담당부서 필터 추가 */}
          <div className="flex items-center gap-4">
            <FilterSelect
              label="분류"
              value={filters.category}
              onChange={(value) => handleFilterChange('category', value)}
              options={filterOptions.category}
            />
            <FilterSelect
              label="유형"
              value={filters.type}
              onChange={(value) => handleFilterChange('type', value)}
              options={filterOptions.type}
            />
            <FilterSelect
              label="담당부서"
              value={filters.org}
              onChange={(value) => handleFilterChange('org', value)}
              options={filterOptions.org}
            />
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th className="w-12 text-center">No.</th>
              <th className="w-32">분류</th>
              <th className="w-24">유형</th>
              {/* <th className="w-16">이미지</th> */}
              <th>장비명</th>
              <th className="w-40">모델번호</th>
              <th className="w-40">제조사</th>
              <th className="w-40">구매처</th>
              <th className="w-40">구매일자</th>
              <th className="w-32 text-right">구매가격</th>
              <th className="w-24">소유자</th>
              <th className="w-32">담당 부서</th>
              <th className="w-24 text-center">보수이력</th>
              <th className="w-28">작업</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedEquipments.map((equipment, index) => (
              <tr key={equipment.id}>
                <td className="text-center">{index + 1}</td>
                <td>{equipment.category}</td>
                <td>{equipment.type}</td>
                {/* <td className="w-8 h-8">
                  <div className="relative w-8 h-8">
                    {imageLoadingStates[equipment.id] ? (
                      <div className="w-8 h-8 flex items-center justify-center">
                        <div className="loading loading-spinner loading-xs"></div>
                      </div>
                    ) : (
                      <img 
                        src={equipmentImages[equipment.id] || defaultImage} 
                        alt={equipment.name}
                        className="w-8 h-8 object-cover rounded"
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = defaultImage;
                        }}
                      />
                    )}
                  </div>
                </td> */}
                <td>{equipment.name}</td>
                <td>{equipment.modelNumber}</td>
                <td>{equipment.manufacturer}</td>
                <td>{equipment.seller}</td>
                <td>{formatDate(equipment.purchaseDate)}</td>
                <td className="text-right">{formatCurrency(equipment.cost)}</td>
                <td>{equipment.owner}</td>
                <td>{getOrgName(equipment.mapdscourseid)}</td>
                <td className="text-center">
                  <button 
                    className="badge bg-blue-900 text-white cursor-pointer hover:bg-blue-800"
                    onClick={() => handleOpenMaintenance(equipment)}
                  >
                    {getMaintenanceCount[equipment.id] || 0}건
                  </button>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button 
                      className="btn btn-xs btn-info"
                      onClick={() =>{ handleEdit(equipment)
                        console.log(equipment);}
                      }
                    >
                      수정
                    </button>
                    <button 
                      className="btn btn-xs btn-error"
                      onClick={(e) => {
                        e.stopPropagation();  // 더블클릭 이벤트 전파 방지
                        handleDelete(equipment.id);
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 편집 Modal */}
      <EditEquipmentDialog
        isOpen={!!editingEquipment || isAddModalOpen}
        equipment={editingEquipment ? {
          ...editingEquipment,
          imageURL: equipmentImages[editingEquipment.id]  // 이미지 URL 전달
        } : null}
        onClose={handleCloseModal}
        isAdd={isAddModalOpen}
      />

      {/* 유지보수 이력 Modal */}
      <ViewMaintenanceDialog
        isOpen={isMaintenanceModalOpen}
        onClose={() => setIsMaintenanceModalOpen(false)}
        equipment={selectedEquipment}
        maintenances={selectedEquipment ? getEquipmentMaintenances(selectedEquipment.id) : []}
      />
    </div>
  );
} 