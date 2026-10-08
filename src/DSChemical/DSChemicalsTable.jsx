import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useGlobalComponent } from '../context/GlobalComponentContext'; // 전역 컴포넌트 컨텍스트 사용
import AddChemicalDialog from './AddChemicalDialog';
import EditChemicalDialog from './EditChemicalDialog';
import EcountCompareDialog from './EcountCompareDialog';
import ChemicalExcelUploadDialog from './ChemicalExcelUploadDialog';
import { downloadChemicalList } from './chemicalExcel';
import { NumberInput, TextInput, UnitInput } from '../components/DSInputs';

/**
 * 
 * 약품을 정보를 Edit, Add, Delete 할 수 있는 테이블
 * Add기능은 일단 로컬 메모리에 저장하고, 나중에 서버에 저장하는 하는것은 수정 저장과 같은 방식으로 처리.
 */


export default function DSChemicalsTable() {
  
  const { globalChemicals, setGlobalChemicals, updateGlobalChemical, deleteGlobalChemical } = useGlobalComponent();
  
  // 검색어 상태 추가
  const [searchTerm, setSearchTerm] = useState('');
  
  // 필터 상태
  const [filters, setFilters] = useState({
    infoL3: 'all',    // 중요도
    infoL2: 'all',    // 대분류
    infoL1: 'all',    // 중분류
    active: 'Y',      // 기본은 사용 중인 약품만
    flgWork: 'all',   
    flgOut: 'all'     
  });

  // 고유한 필터 옵션 추출
  const filterOptions = useMemo(() => {
    const defaultL3 = ['all', '중요도1', '중요도2', '중요도3', '중요도4', '중요도5'];
    const defaultL2 = ['all', '농약', '비료', '기타약재'];
    const defaultL1 = {
      '농약': ['all', '살균제', '살충제', '제초제'],
      '비료': ['all', '비료'],
      '기타약재': ['all', '기타약재']
    };
    
    const uniqueL3 = [...new Set(globalChemicals.map(c => c.infoL3))];
    const uniqueL2 = [...new Set(globalChemicals.map(c => c.infoL2))];
    const uniqueL1 = [...new Set(globalChemicals.map(c => c.infoL1))];
    
    const filteredL3 = uniqueL3.filter(item => !defaultL3.includes(item));
    const filteredL2 = uniqueL2.filter(item => !defaultL2.includes(item));
    const filteredL1 = uniqueL1.filter(item => !Object.values(defaultL1).flat().includes(item));

    // 현재 선택된 대분류에 따른 중분류 옵션 결정
    const getL1Options = (selectedL2) => {
      if (selectedL2 === 'all') {
        return ['all', ...new Set([
          ...defaultL1['농약'],
          ...defaultL1['비료'],
          ...defaultL1['기타약재'],
          ...filteredL1
        ].filter(item => item !== 'all'))];
      }
      return defaultL1[selectedL2] || ['all'];
    };

    return {
      infoL3: [...defaultL3, ...filteredL3],
      infoL2: [...defaultL2, ...filteredL2],
      infoL1: getL1Options(filters.infoL2)  // 현재 선택된 대분류에 따른 중분류 옵션
    };
  }, [globalChemicals, filters.infoL2]);  // filters.infoL2 의존성 추가

  // 필터 변경 핸들러
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  // 필터링 및 정렬된 데이터에 검색 기능 추가
  const filteredAndSortedChemicals = useMemo(() => {
    // 대분류 우선순위 정의
    const infoL2Priority = {
      '농약': 1,
      '비료': 2,
      '기타약재': 3,
      '': 9999
    };

    // 중분류 우선순위 정의
    const infoL1Priority = {
      '살균제': 1,
      '살충제': 2,
      '제초제': 3,
      '비료': 4,
      '기타약재': 5,
      '': 9999
    };

    return [...globalChemicals]
      .filter(chemical => {
        const searchMatch = searchTerm === '' || 
          chemical.name.toLowerCase().includes(searchTerm.toLowerCase());
        const activeMatch = filters.active === 'all' || chemical.active === filters.active;
        const workMatch = filters.flgWork === 'all' || chemical.flgWork === filters.flgWork;
        const outMatch = filters.flgOut === 'all' || chemical.flgOut === filters.flgOut;
        const infoL3Match = filters.infoL3 === 'all' || chemical.infoL3 === filters.infoL3;
        const infoL1Match = filters.infoL1 === 'all' || chemical.infoL1 === filters.infoL1;
        const infoL2Match = filters.infoL2 === 'all' || chemical.infoL2 === filters.infoL2;
        return searchMatch && activeMatch && workMatch && outMatch && 
               infoL3Match && infoL1Match && infoL2Match;
      })
      .sort((a, b) => {
        // 1. 중요도 순서로 정렬
        const priorityPattern = /중요도(\d+)/;
        const matchA = a.infoL3.match(priorityPattern);
        const matchB = b.infoL3.match(priorityPattern);
        
        const priorityA = matchA ? parseInt(matchA[1]) : 9999;
        const priorityB = matchB ? parseInt(matchB[1]) : 9999;
        
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // 2. 대분류 순서로 정렬
        const infoL2A = infoL2Priority[a.infoL2] || 9999;
        const infoL2B = infoL2Priority[b.infoL2] || 9999;
        if (infoL2A !== infoL2B) {
          return infoL2A - infoL2B;
        }

        // 3. 중분류 순서로 정렬
        const infoL1A = infoL1Priority[a.infoL1] || 9999;
        const infoL1B = infoL1Priority[b.infoL1] || 9999;
        if (infoL1A !== infoL1B) {
          return infoL1A - infoL1B;
        }

        // 4. 코드순
        return a.dsids.localeCompare(b.dsids);
      });
  }, [globalChemicals, filters, searchTerm]);

  // 필터 선택 컴포넌트
  const FilterSelect = ({ label, value, onChange, options }) => (
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
  );

  // 편집 관련 상태
  const [editingChemical, setEditingChemical] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // 행 편집 시작
  const handleStartEdit = (chemical) => {
    setEditingChemical(chemical);
    setIsEditModalOpen(true);
  };

  // 수정 API(/dschemical/update, alias)가 돌려준 최신 레코드를 목록에 반영
  const handleSaved = (saved) => {
    setGlobalChemicals(prev => prev.map(c => (c.dsids === saved.dsids ? saved : c)));
  };

  // 대분류·중분류 변경은 수정 API가 받지 않아 웹 전용 저장(전체 덮어쓰기)으로
  const handleSaveClass = async (chemical) => (await updateGlobalChemical(chemical)) === true;

  // ChemicalsTable 컴포넌트 내부에 상태 추가
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEcountModalOpen, setIsEcountModalOpen] = useState(false);
  const [isExcelUploadOpen, setIsExcelUploadOpen] = useState(false);

  // handleAddNew 함수 수정
  const handleAddNew = () => {
    setIsAddModalOpen(true);
  };

  // 삭제 핸들러 추가
  const handleDelete = async (dsids) => {
    if (window.confirm('정말 삭제하시겠습니까?')) {
      try {
        const result = await deleteGlobalChemical(dsids);
        if (!result)  {
          alert('삭제에 실패했습니다.');
        }
      } catch (error) {
        console.error('Error deleting chemical:', error);
        alert('삭제 중 오류가 발생했습니다.');
      }
    }
  };

  // 선택된 행 상태 추가
  const [selectedRow, setSelectedRow] = useState(null);

  // TableRow 컴포넌트 수정
  const TableRow = ({ chemical, index }) => {
    const isEditing = editingChemical && editingChemical.dsids === chemical.dsids;
    const isSelected = selectedRow === chemical.dsids;
    
    return (
      <tr 
        key={chemical.dsids}
        onClick={() => setSelectedRow(chemical.dsids)}
        onDoubleClick={() => handleStartEdit(chemical)}
        className={`cursor-pointer hover:bg-gray-100 ${
          isSelected || isEditing ? 'outline outline-2 outline-blue-500 relative z-10' : ''
        }`}
      >
        <td className="w-12 text-center text-xs">{index + 1}</td>
        <td className="text-xs">
          <span className="badge badge-ghost text-xs">{chemical.infoL3}</span>
        </td>
        <td className="w-32 text-xs">{chemical.infoL2}</td>
        <td className="w-32 text-xs">{chemical.infoL1}</td>
        <td className="w-28 text-sm">
          {chemical.dsids}
          {chemical.origin === 'local' && (
            <span
              className={`badge badge-xs ml-1 ${chemical.ecountSyncedAt ? 'badge-success' : 'badge-warning'}`}
              title={chemical.ecountSyncedAt
                ? `여기서 만든 약품 · 이카운트 등록 확인 ${new Date(chemical.ecountSyncedAt).toLocaleDateString('ko-KR')}`
                : '여기서 만든 약품 · 이카운트 미등록'}
            >
              자체·{chemical.ecountSyncedAt ? '등록됨' : '미등록'}
            </span>
          )}
        </td>
        <td className="text-sm">{chemical.name}</td>
        <td className="text-xs">{chemical.unit}</td>
        <td className="w-28 text-right text-xs">{chemical.IN_PRICE.toLocaleString()}원</td>
        <td className="w-28 text-right text-xs">{chemical.OUT_PRICE.toLocaleString()}원</td>
        <td className="w-28 text-right text-xs">{chemical.OUT_PRICE1.toLocaleString()}원</td>
        <td className="w-24 text-xs">
          <span className={`badge ${chemical.active === 'Y' ? 'badge-success' : 'badge-error'} text-xs`}>
            {chemical.active === 'Y' ? '사용' : '미사용'}
          </span>
        </td>
        <td className="w-24 text-xs">
          <span className={`badge ${chemical.flgWork === 'Y' ? 'badge-success' : 'badge-error'} text-xs`}>
            {chemical.flgWork === 'Y' ? '사용' : '미사용'}
          </span>
        </td>
        <td className="w-24 text-xs">
          <span className={`badge ${chemical.flgOut === 'Y' ? 'badge-success' : 'badge-error'} text-xs`}>
            {chemical.flgOut === 'Y' ? '사용' : '미사용'}
          </span>
        </td>
        <td className="w-24 text-xs">
          <button 
            className="btn btn-xs btn-error"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(chemical.dsids);
            }}
          >
            삭제
          </button>
        </td>
      </tr>
    );
  };

  // 다이얼로그가 닫힐 때 선택된 행 초기화
  const handleCloseEdit = () => {
    setIsEditModalOpen(false);
    setEditingChemical(null);
    // 선택된 행은 유지 (필요한 경우에만 초기화)
    // setSelectedRow(null);
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">약품 목록</h2>
          <div className="form-control">
            <input
              type="text"
              placeholder="제품명 검색..."
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
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setIsEcountModalOpen(true)}
          >
            이카운트 비교
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => downloadChemicalList(filteredAndSortedChemicals)}
            disabled={filteredAndSortedChemicals.length === 0}
            title="지금 보이는 목록(필터·정렬 그대로)을 엑셀로 내려받습니다"
          >
            엑셀 다운로드
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setIsExcelUploadOpen(true)}
            title="내려받아 고친 엑셀을 올려 일괄 수정합니다"
          >
            엑셀 업로드
          </button>
        </div>
      </div>
      <div className="flex items-center gap-4">
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm">중요도:</span>
            <FilterSelect
              value={filters.infoL3}
              onChange={(value) => handleFilterChange('infoL3', value)}
              options={filterOptions.infoL3}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">대분류:</span>
            <FilterSelect
              value={filters.infoL2}
              onChange={(value) => handleFilterChange('infoL2', value)}
              options={filterOptions.infoL2}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">중분류:</span>
            <FilterSelect
              value={filters.infoL1}
              onChange={(value) => handleFilterChange('infoL1', value)}
              options={filterOptions.infoL1}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">상태:</span>
            <FilterSelect
              value={filters.active}
              onChange={(value) => handleFilterChange('active', value)}
              options={['all', 'Y', 'N']}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">방제팀:</span>
            <FilterSelect
              value={filters.flgWork}
              onChange={(value) => handleFilterChange('flgWork', value)}
              options={['all', 'Y', 'N']}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">용역팀:</span>
            <FilterSelect
              value={filters.flgOut}
              onChange={(value) => handleFilterChange('flgOut', value)}
              options={['all', 'Y', 'N']}
            />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th className="w-12 text-center">No.</th>
              <th className="w-32">중요도</th>
              <th className="w-32">대분류</th>
              <th className="w-32">중분류</th>
              <th className="w-28">코드</th>
              <th>제품명</th>
              <th className="w-24">용량</th>
              <th className="w-32 text-right">구입가</th>
              <th className="w-32 text-right">용역판가</th>
              <th className="w-32 text-right">판가</th>
              <th className="w-24">Active</th>
              <th className="w-28">방제팀</th>
              <th className="w-28">용역팀</th>
              <th className="w-28">작업</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedChemicals.map((chemical, index) => (
              <TableRow 
                key={chemical.dsids} 
                chemical={chemical} 
                index={index}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 편집 다이얼로그 */}
      <EditChemicalDialog
        isOpen={isEditModalOpen}
        onClose={handleCloseEdit}
        chemical={editingChemical}
        onSaved={handleSaved}
        onSaveClass={handleSaveClass}
        filterOptions={filterOptions}
      />
      
      {/* 추가 다이얼로그 */}
      <AddChemicalDialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

      {/* 이카운트 비교 다이얼로그 */}
      <EcountCompareDialog
        isOpen={isEcountModalOpen}
        onClose={() => setIsEcountModalOpen(false)}
      />

      {/* 엑셀 일괄 수정 다이얼로그 */}
      <ChemicalExcelUploadDialog
        isOpen={isExcelUploadOpen}
        onClose={() => setIsExcelUploadOpen(false)}
      />
    </div>
  );
} 