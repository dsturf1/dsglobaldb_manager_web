import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useGlobalComponent } from '../context/GlobalComponentContext'; 
import { useBase } from '../context/BaseContext';
import AddWorkforceDialog from './AddWorkforceDialog';
import { NumberInput, TextInput, UnitInput } from '../components/DSInputs';

export default function DSWorkforceTable() {
  const { globalWorkforces, updateGlobalWorkforce, deleteGlobalWorkforce, setGlobalWorkforces } = useGlobalComponent();
  const { dsOrgOrder, dsrankOrder, dsOrgList } = useBase();
  
  // 검색어 상태
  const [searchTerm, setSearchTerm] = useState('');
  
  // 필터 상태
  const [filters, setFilters] = useState({
    org: 'all',    
    category: 'all'
  });

  // 편집 상태 관리
  const [editingRows, setEditingRows] = useState(new Set());
  const [editedWorkforces, setEditedWorkforces] = useState({});
  const [savingRows, setSavingRows] = useState(new Set());

  // 고유한 필터 옵션 추출
  const filterOptions = useMemo(() => ({
    org: ['all', ...new Set(globalWorkforces.map(w => w.org))],
    category: ['all', ...new Set(globalWorkforces.map(w => w.category))]
  }), [globalWorkforces]);

  // 필터링 및 정렬된 데이터
  const filteredAndSortedWorkforces = useMemo(() => {
    return [...globalWorkforces]
      .filter(workforce => {
        const searchMatch = searchTerm === '' || 
          workforce.name.toLowerCase().includes(searchTerm.toLowerCase());
        const orgMatch = filters.org === 'all' || workforce.org === filters.org;
        const categoryMatch = filters.category === 'all' || workforce.category === filters.category;
        return searchMatch && orgMatch && categoryMatch;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [globalWorkforces, filters, searchTerm]);

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
      [filterType]: value
    }));
  };

  // 행 편집 시작
  const handleStartEdit = (id) => {
    setEditingRows(prev => new Set(prev).add(id));
    setEditedWorkforces(prev => ({
      ...prev,
      [id]: { ...globalWorkforces.find(w => w.id === id) }
    }));
  };

  // 편집 데이터 변경 핸들러
  const handleEditChange = (id, field, value) => {
    setEditedWorkforces(prev => {
      const updated = {
        ...prev,
        [id]: { 
          ...prev[id], 
          [field]: value,
          // 직급 변경 시 분류 자동 업데이트
          ...(field === 'rank' ? { category: getCategory(value) } : {}),
          // org 변경 시 mapdscpurseid 자동 업데이트
          ...(field === 'org' ? { 
            mapdscourseid: dsOrgList.find(org => org.org === value)?.mapdscourseid || ''
          } : {})
        }
      };
      return updated;
    });
  };

  // 직급에 따른 분류 결정
  const getCategory = (rank) => {
    if (rank === '계약직') return '계약직';
    if (rank === '일용남') return '일용남';
    if (rank === '일용여') return '일용여';
    return '정규직';
  };

  // 변경사항 저장
  const handleSave = async (id) => {
    setSavingRows(prev => new Set([...prev, id]));
    try {
      // 저장하기 전에 mapdscpurseid 업데이트
      const workforceToUpdate = {
        ...editedWorkforces[id],
        mapdscourseid: dsOrgList.find(org => org.org === editedWorkforces[id].org)?.mapdscourseid || ''
      };
      console.log('workforceToUpdate', workforceToUpdate);
      
      
      await updateGlobalWorkforce(workforceToUpdate);
      setEditingRows(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setEditedWorkforces(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // 편집 취소
  const handleCancel = (id) => {
    setEditingRows(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setEditedWorkforces(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleDelete = async (id) => {
    if (window.confirm('정말 삭제하시겠습니까?')) {
      try {
        const result = await deleteGlobalWorkforce(id);
        if (!result){
          alert('삭제에 실패했습니다.');
        }
      } catch (error) {
        console.error('Error deleting workforce:', error);
        alert('삭제 중 오류가 발생했습니다.');
      }
    }
  };

  // 행 렌더링 컴포넌트
  const TableRow = ({ workforce, index }) => {
    const isEditing = editingRows.has(workforce.id);
    const editedData = editedWorkforces[workforce.id];

    if (isEditing) {
      return (
        <tr>
          <td className="text-center">{index + 1}</td>
          <td>{workforce.id}</td>
          <td>
            <select
              className="select select-bordered select-sm w-full"
              value={editedData.org}
              onChange={(e) => handleEditChange(workforce.id, 'org', e.target.value)}
            >
              {dsOrgOrder.map(org => (
                <option key={org} value={org}>{org}</option>
              ))}
            </select>
          </td>
          <td>{editedData.category}</td>
          <td>
            <TextInput
              value={editedData.name}
              onChange={(value) => handleEditChange(workforce.id, 'name', value)}
              className="input input-bordered input-sm w-full"
            />
          </td>
          <td>
            <select
              className="select select-bordered select-sm w-full"
              value={editedData.rank}
              onChange={(e) => handleEditChange(workforce.id, 'rank', e.target.value)}
            >
              {dsrankOrder.map(rank => (
                <option key={rank} value={rank}>{rank}</option>
              ))}
            </select>
          </td>
          <td>
            <TextInput
              value={editedData.Email}
              onChange={(value) => handleEditChange(workforce.id, 'Email', value)}
              className="input input-bordered input-sm w-full"
            />
          </td>
          <td>
            <div className="flex gap-2">
              <button 
                className="btn btn-xs btn-primary"
                onClick={() => handleSave(workforce.id)}
                disabled={savingRows.has(workforce.id)}
              >
                {savingRows.has(workforce.id) ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    저장
                  </>
                ) : (
                  '저장'
                )}
              </button>
              <button 
                className="btn btn-xs"
                onClick={() => handleCancel(workforce.id)}
                disabled={savingRows.has(workforce.id)}
              >
                취소
              </button>
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr 
        key={workforce.id}
        onDoubleClick={() => handleStartEdit(workforce.id)}
        className="cursor-pointer hover:bg-gray-100"
      >
        <td className="text-center">{index + 1}</td>
        <td>{workforce.id}</td>
        <td>{workforce.org}</td>
        <td>{workforce.category}</td>
        <td>{workforce.name}</td>
        <td>{workforce.rank}</td>
        <td>{workforce.Email}</td>
        <td>
          <div className="flex gap-2">
            <button 
              className="btn btn-xs btn-error"
              onClick={(e) => {
                e.stopPropagation();  // 더블클릭 이벤트 전파 방지
                handleDelete(workforce.id);
              }}
            >
              삭제
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  return (
    <div className="p-4">
      {/* 검색 및 필터 UI */}
      <div className="mb-4">
        <div className="flex justify-between items-center">
          {/* 왼쪽: 제목과 검색창 */}
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold">인력정보</span>
            <div className="flex items-center gap-2">
              <span className="text-sm">검색:</span>
              <input
                type="text"
                placeholder="이름으로 검색..."
                className="input input-bordered input-sm w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => setIsAddModalOpen(true)}
            >
              신규 인력
            </button>
          </div>

          {/* 오른쪽: 필터들 */}
          <div className="flex items-center gap-4">
            <FilterSelect
              label="소속"
              value={filters.org}
              onChange={(value) => handleFilterChange('org', value)}
              options={filterOptions.org}
            />
            <FilterSelect
              label="분류"
              value={filters.category}
              onChange={(value) => handleFilterChange('category', value)}
              options={filterOptions.category}
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
              <th className="w-28">코드</th>
              <th className="w-32">소속</th>
              <th className="w-24">분류</th>
              <th className="w-80">이름</th>
              <th className="w-24">직급</th>
              <th className="w-48">이메일</th>
              <th className="w-28">작업</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedWorkforces.map((workforce, index) => (
              <TableRow 
                key={workforce.id} 
                workforce={workforce} 
                index={index}
              />
            ))}
          </tbody>
        </table>
      </div>

      <AddWorkforceDialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
} 