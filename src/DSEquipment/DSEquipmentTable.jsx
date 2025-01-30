import React, { useMemo, useState } from 'react';
import { useGlobalComponent } from '../context/ComponentContext';
import { useBase } from '../context/BaseContext';
import EditEquipmentDialog from './EditEquipmentDialog';
import { NumberInput, TextInput, UnitInput, formatUTCToLocal } from '../components/DSInputs';

export default function DSEquipmentTable() {
  const { globalEquipments, updateGlobalEquipment, deleteGlobalEquipment, addGlobalEquipment } = useGlobalComponent();
  const { dsOrgList } = useBase();
  
  // 검색어 상태
  const [searchTerm, setSearchTerm] = useState('');
  
  // 편집 모달 상태
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // 필터 상태
  const [filters, setFilters] = useState({
    category: 'all',    
    type: 'all'
  });

  // 분류 우선순위 정의
  const categoryOrder = {
    '예지장비': 1,
    '갱신장비': 2,
    '배토장비': 3,
    '시약장비': 4,
    '기타장비': 5,
    '운반장비': 6,
    '이동장비': 7,
    '정리장비': 8,
    '청소장비': 9,
    '그외': 10
  };

  // 고유한 필터 옵션 추출
  const filterOptions = useMemo(() => {
    // 분류 옵션을 우선순위에 따라 정렬
    const categories = ['all', ...new Set(globalEquipments.map(e => e.category))]
      .sort((a, b) => {
        if (a === 'all') return -1;
        if (b === 'all') return 1;
        return (categoryOrder[a] || 999) - (categoryOrder[b] || 999);
      });
    
    // 선택된 카테고리에 따른 유형 옵션 추출
    const getTypeOptions = (selectedCategory) => {
      if (selectedCategory === 'all') {
        return ['all', ...new Set(globalEquipments.map(e => e.type))];
      }
      return ['all', ...new Set(
        globalEquipments
          .filter(e => e.category === selectedCategory)
          .map(e => e.type)
      )];
    };

    return {
      category: categories,
      type: getTypeOptions(filters.category)
    };
  }, [globalEquipments, filters.category]);

  // 필터링 및 정렬된 데이터
  const filteredAndSortedEquipments = useMemo(() => {
    return [...globalEquipments]
      .filter(equipment => {
        const searchMatch = searchTerm === '' || 
          equipment.name.toLowerCase().includes(searchTerm.toLowerCase());
        const categoryMatch = filters.category === 'all' || equipment.category === filters.category;
        const typeMatch = filters.type === 'all' || equipment.type === filters.type;
        return searchMatch && categoryMatch && typeMatch;
      })
      .sort((a, b) => {
        // 1. 분류 순서로 정렬
        const categoryDiff = (categoryOrder[a.category] || 999) - (categoryOrder[b.category] || 999);
        if (categoryDiff !== 0) return categoryDiff;

        // 2. 같은 분류 내에서는 유형순
        const typeDiff = (a.type || '').localeCompare(b.type || '');
        if (typeDiff !== 0) return typeDiff;

        // 3. 같은 유형 내에서는 이름순
        return a.name.localeCompare(b.name);
      });
  }, [globalEquipments, filters, searchTerm]);

  // 필터 선택 컴포넌트
  const FilterSelect = ({ label, value, onChange, options }) => (
    <div className="flex items-center gap-2">
      <span className="text-sm">{label}:</span>
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        className="select select-bordered select-sm"
      >
        {options.map(option => (
          <option key={option} value={option}>
            {option === 'all' ? '전체' : option}
          </option>
        ))}
      </select>
    </div>
  );

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

          {/* 오른쪽: 필터들 */}
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
              <th>장비명</th>
              <th className="w-32">모델번호</th>
              <th className="w-32">제조사</th>
              <th className="w-32">구매처</th>
              <th className="w-32">구매일자</th>
              <th className="w-32 text-right">구매가격</th>
              <th className="w-24">소유자</th>
              <th className="w-32">담당 부서</th>
              <th className="w-28">작업</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedEquipments.map((equipment, index) => (
              <tr key={equipment.id}>
                <td className="text-center">{index + 1}</td>
                <td>{equipment.category}</td>
                <td>{equipment.type}</td>
                <td>{equipment.name}</td>
                <td>{equipment.modelNumber}</td>
                <td>{equipment.manufacturer}</td>
                <td>{equipment.seller}</td>
                <td>{formatDate(equipment.purchaseDate)}</td>
                <td className="text-right">{formatCurrency(equipment.cost)}</td>
                <td>{equipment.owner}</td>
                <td>{getOrgName(equipment.mapdscourseid)}</td>
                <td>
                  <div className="flex gap-2">
                    <button 
                      className="btn btn-xs btn-info"
                      onClick={() => setEditingEquipment(equipment)}
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
        equipment={editingEquipment}
        onClose={handleCloseModal}
        isAdd={isAddModalOpen}
      />
    </div>
  );
} 