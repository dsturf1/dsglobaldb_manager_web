import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useGlobalComponent } from '../context/GlobalComponentContext'; // 전역 컴포넌트 컨텍스트 사용
import AddChemicalDialog from './AddChemicalDialog';
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
    active: 'all',    
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

  const [editingRows, setEditingRows] = useState(new Set());
  const [editedChemicals, setEditedChemicals] = useState({});
  const [savingRows, setSavingRows] = useState(new Set());  // 저장 중인 행 추적

  // 행 편집 시작
  const handleStartEdit = (dsids) => {
    setEditingRows(prev => new Set(prev).add(dsids));
    setEditedChemicals(prev => ({
      ...prev,
      [dsids]: { ...globalChemicals.find(c => c.dsids === dsids) }
    }));
  };

  // 편집 데이터 변경 핸들러
  const handleEditChange = (dsids, field, value) => {
    setEditedChemicals(prev => ({
      ...prev,
      [dsids]: { ...prev[dsids], [field]: value }
    }));
  };

  // 변경사항 저장
  const handleSave = async (dsids) => {
    setSavingRows(prev => new Set([...prev, dsids]));
    try {
      const success = await updateGlobalChemical(editedChemicals[dsids]);
      if (success) {
        setEditingRows(prev => {
          const next = new Set(prev);
          next.delete(dsids);
          return next;
        });
        setEditedChemicals(prev => {
          const next = { ...prev };
          delete next[dsids];
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSavingRows(prev => {
        const next = new Set(prev);
        next.delete(dsids);
        return next;
      });
    }
  };

  // 편집 취소
  const handleCancel = (dsids) => {
    setEditingRows(prev => {
      const next = new Set(prev);
      next.delete(dsids);
      return next;
    });
    setEditedChemicals(prev => {
      const { [dsids]: removed, ...rest } = prev;
      return rest;
    });
  };

  // getFirstOption 함수 추가
  const getFirstOption = (options) => {
    const realOptions = options.filter(opt => opt !== 'all');
    return realOptions.length > 0 ? realOptions[0] : '';
  };

  // ChemicalsTable 컴포넌트 내부에 상태 추가
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // handleAddNew 함수 수정
  const handleAddNew = () => {
    setIsAddModalOpen(true);
  };

  // 실제 추가 처리 함수
  const handleAddConfirm = (formData) => {
    console.log('Form Data:', formData);
    const newChemical = createNewChemical({
      ...formData,
      infoL2: formData.infoL2,
      infoL1: formData.infoL1,
      name: formData.name.trim(),
      unit: `${formData.unit}${formData.unitType}`,  // 여기서만 결합
      IN_PRICE: Number(formData.IN_PRICE),
      OUT_PRICE: Number(formData.OUT_PRICE),
      OUT_PRICE1: Number(formData.OUT_PRICE1)
    });
    
    setGlobalChemicals(prev => [newChemical, ...prev]);
    console.log('New Chemical:', newChemical);
    setIsAddModalOpen(false);
  };

  // createNewChemical 함수 수정
  const createNewChemical = (formData) => {
    // 첫 번째 문자 결정 (infoL2 기반)
    const getFirstChar = (infoL2) => {
      switch(infoL2) {
        case '농약': return 'A';
        case '비료': return 'B';
        case '기타약재': return 'C';
        default: return 'A';
      }
    };

    // 두 번째 숫자 결정 (infoL1 기반)
    const getSecondDigit = (infoL1, infoL2) => {
      if (infoL2 === '농약') {
        switch(infoL1) {
          case '살균제': return '1';
          case '살충제': return '2';
          case '제초제': return '3';
          default: return '0';
        }
      }
      return '0';  // 비료나 기타약재의 경우
    };

    // 3~5 digit 생성 (기존 코드 중 가장 큰 번호 + 1)
    const getNextSequence = () => {
      const sequences = globalChemicals
        .map(c => {
          const match = c.dsids.match(/^[A-C][0-3](\d{3})/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => !isNaN(num));

      const maxSeq = Math.max(0, ...sequences);
      return (maxSeq + 1).toString().padStart(3, '0');
    };

    // 마지막 digit 결정 (같은 이름의 용량 다른 제품 순서)
    const getLastDigit = (name) => {
      const sameNameItems = globalChemicals
        .filter(c => c.name === name)
        .map(c => {
          const lastDigit = c.dsids.slice(-1);
          return parseInt(lastDigit) || 0;
        });

      if (sameNameItems.length === 0) return '1';
      return (Math.max(...sameNameItems) + 1).toString();
    };

    const firstChar = getFirstChar(formData.infoL2);
    const secondDigit = getSecondDigit(formData.infoL1, formData.infoL2);
    const sequence = getNextSequence();
    const lastDigit = getLastDigit(formData.name);

    const newDsids = `${firstChar}${secondDigit}${sequence}${lastDigit}`;

    return {
      dsids: newDsids,
      infoL3: '중요도1',
      infoL2: formData.infoL2,
      infoL1: formData.infoL1,
      name: formData.name,
      unit: formData.unit,          // 이미 결합된 형태로 받음
      IN_PRICE: formData.IN_PRICE,
      OUT_PRICE: formData.OUT_PRICE,
      OUT_PRICE1: formData.OUT_PRICE1,
      active: 'Y',
      flgWork: 'Y',
      flgOut: 'Y'
    };
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

  // 행 렌더링 컴포넌트
  const TableRow = ({ chemical, index }) => {
    const isEditing = editingRows.has(chemical.dsids);
    const editedData = editedChemicals[chemical.dsids];

    if (isEditing) {
      return (
        <tr key={chemical.dsids}>
          <td className="w-12 text-center text-xs">{index + 1}</td>
          <td className="w-32">
            <select 
              className="select select-bordered select-xs w-full text-xs"
              value={editedData.infoL3}
              onChange={(e) => handleEditChange(chemical.dsids, 'infoL3', e.target.value)}
            >
              {filterOptions.infoL3.filter(opt => opt !== 'all').map(option => (
                <option className="text-xs" key={option} value={option}>{option}</option>
              ))}
            </select>
          </td>
          <td className="w-32">
            <select 
              className="select select-bordered select-xs w-full text-xs"
              value={editedData.infoL2}
              onChange={(e) => handleEditChange(chemical.dsids, 'infoL2', e.target.value)}
            >
              {filterOptions.infoL2.filter(opt => opt !== 'all').map(option => (
                <option className="text-xs" key={option} value={option}>{option}</option>
              ))}
            </select>
          </td>
          <td className="w-32">
            <select 
              className="select select-bordered select-xs w-full text-xs"
              value={editedData.infoL1}
              onChange={(e) => handleEditChange(chemical.dsids, 'infoL1', e.target.value)}
            >
              {filterOptions.infoL1.filter(opt => opt !== 'all').map(option => (
                <option className="text-xs" key={option} value={option}>{option}</option>
              ))}
            </select>
          </td>
          <td className="w-28">{chemical.dsids}</td>
          <td>
            <TextInput
              key={`name-${chemical.dsids}`}
              value={editedData.name}
              onChange={(value) => handleEditChange(chemical.dsids, 'name', value)}
              className="input input-bordered input-xs w-full text-xs"
            />
          </td>
          <td className="w-24">
            <UnitInput
              key={`unit-${chemical.dsids}`}
              value={editedData.unit}
              onChange={(value) => handleEditChange(chemical.dsids, 'unit', value)} 
              className="input input-bordered input-xs w-full text-xs"
              classNameUnit="select select-bordered select-xs w-16 text-xs"
            />
          </td>
          <td className="w-32">
            <NumberInput
              key={`IN_PRICE-${chemical.dsids}`}
              value={editedData.IN_PRICE}
              onChange={(value) => handleEditChange(chemical.dsids, 'IN_PRICE', value)}
              className="input input-bordered input-xs w-full text-xs text-right"
            />
          </td>
          <td className="w-32">
            <NumberInput
              key={`OUT_PRICE-${chemical.dsids}`}
              value={editedData.OUT_PRICE}
              onChange={(value) => handleEditChange(chemical.dsids, 'OUT_PRICE', value)}
              className="input input-bordered input-xs w-full text-xs text-right"
            />
          </td>
          <td className="w-32">
            <NumberInput
              key={`OUT_PRICE1-${chemical.dsids}`}
              value={editedData.OUT_PRICE1}
              onChange={(value) => handleEditChange(chemical.dsids, 'OUT_PRICE1', value)}
              className="input input-bordered input-xs w-full text-xs text-right"
            />
          </td>
          <td className="w-24">
            <select 
              className="select select-bordered select-xs w-full text-xs"
              value={editedData.active}
              onChange={(e) => handleEditChange(chemical.dsids, 'active', e.target.value)}
            >
              <option className="text-xs" value="Y">사용</option>
              <option className="text-xs" value="N">미사용</option>
            </select>
          </td>
          <td className="w-28">
            <select 
              className="select select-bordered select-xs w-full text-xs"
              value={editedData.flgWork}
              onChange={(e) => handleEditChange(chemical.dsids, 'flgWork', e.target.value)}
            >
              <option className="text-xs" value="Y">사용</option>
              <option className="text-xs" value="N">미사용</option>
            </select>
          </td>
          <td className="w-28">
            <select 
              className="select select-bordered select-xs w-full text-xs"
              value={editedData.flgOut}
              onChange={(e) => handleEditChange(chemical.dsids, 'flgOut', e.target.value)}
            >
              <option className="text-xs" value="Y">사용</option>
              <option className="text-xs" value="N">미사용</option>
            </select>
          </td>
          <td className="w-28">
            <div className="flex gap-2">
              <button 
                className="btn btn-xs btn-primary text-xs"
                onClick={() => handleSave(chemical.dsids)}
                disabled={savingRows.has(chemical.dsids)}
              >
                {savingRows.has(chemical.dsids) ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    저장
                  </>
                ) : (
                  '저장'
                )}
              </button>
              <button 
                className="btn btn-xs btn-error text-xs"
                onClick={() => handleCancel(chemical.dsids)}
                disabled={savingRows.has(chemical.dsids)}
              >
                취소
              </button>
            </div>
          </td>
        </tr>
      );
    }

    // 일반 행 렌더링 (기존 코드)
    return (
      <tr 
        key={chemical.dsids}
        onDoubleClick={() => handleStartEdit(chemical.dsids)}
        className="cursor-pointer hover:bg-gray-100"
      >
        <td className="w-12 text-center text-xs">{index + 1}</td>
        <td className="text-xs">
          <span className="badge badge-ghost text-xs">{chemical.infoL3}</span>
        </td>
        <td className="w-32 text-xs">{chemical.infoL2}</td>
        <td className="w-32 text-xs">{chemical.infoL1}</td>
        <td className="w-28 text-sm">{chemical.dsids}</td>
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
          <div className="flex gap-2">
            <button 
              className="btn btn-xs btn-error"
              onClick={(e) => {
                e.stopPropagation();  // 더블클릭 이벤트 전파 방지
                handleDelete(chemical.dsids);
              }}
            >
              삭제
            </button>
          </div>
        </td>
      </tr>
    );
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
      <AddChemicalDialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
} 