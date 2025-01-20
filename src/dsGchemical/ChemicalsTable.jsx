import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useComponent } from '../context/ComponentContext';

export default function ChemicalsTable() {
  const { chemicals, setChemicals, updateChemical, deleteChemical } = useComponent();
  
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
  const filterOptions = useMemo(() => ({
    infoL3: ['all', ...new Set(chemicals.map(c => c.infoL3))],
    infoL2: ['all', ...new Set(chemicals.map(c => c.infoL2))], // 대분류
    infoL1: ['all', ...new Set(chemicals.map(c => c.infoL1))]  // 중분류
  }), [chemicals]);

  // 필터 변경 핸들러
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  // 필터링 및 정렬된 데이터에 검색 기능 추가
  const filteredAndSortedChemicals = useMemo(() => {
    return [...chemicals]
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
        // 새로 추가된 항목 (임시 ID를 가진 항목)을 먼저 표시
        const isNewA = a.dsids.toString().length >= 13; // timestamp 길이
        const isNewB = b.dsids.toString().length >= 13;
        if (isNewA && !isNewB) return -1;
        if (!isNewA && isNewB) return 1;

        // 기존 정렬 로직
        const priorityPattern = /중요도(\d+)/;
        const matchA = a.infoL3.match(priorityPattern);
        const matchB = b.infoL3.match(priorityPattern);

        if (matchA && matchB) return parseInt(matchA[1]) - parseInt(matchB[1]);
        if (matchA) return -1;
        if (matchB) return 1;
        return a.infoL3.localeCompare(b.infoL3);
      });
  }, [chemicals, filters, searchTerm]);

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

  const [editingRows, setEditingRows] = useState(new Set());  // 편집 중인 행들의 ID를 저장
  const [editedChemicals, setEditedChemicals] = useState({});  // 편집된 데이터를 저장

  // 행 편집 시작
  const handleStartEdit = (dsids) => {
    setEditingRows(prev => new Set(prev).add(dsids));
    setEditedChemicals(prev => ({
      ...prev,
      [dsids]: { ...chemicals.find(c => c.dsids === dsids) }
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
    try {
      const updatedChemical = editedChemicals[dsids];
      const result = await updateChemical(updatedChemical);
      
      if (result) {  // 성공 시에만 로컬 상태 업데이트
        // 로컬 상태 업데이트
        setChemicals(prev => 
          prev.map(chemical => 
            chemical.dsids === dsids ? updatedChemical : chemical
          )
        );
        
        // 편집 상태 초기화
        setEditingRows(prev => {
          const next = new Set(prev);
          next.delete(dsids);
          return next;
        });
        setEditedChemicals(prev => {
          const { [dsids]: removed, ...rest } = prev;
          return rest;
        });
      } else {
        console.error('Failed to update chemical');
        alert('저장에 실패했습니다.');  // 사용자에게 실패 알림
      }
    } catch (error) {
      console.error('Error saving chemical:', error);
      alert('저장 중 오류가 발생했습니다.');  // 사용자에게 에러 알림
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

  // PriceInput 컴포넌트 수정
  const PriceInput = React.memo(({ value = 0, onChange }) => {
    const [localValue, setLocalValue] = useState(value.toString());
    const inputRef = useRef(null);

    const handleChange = (e) => {
      // 숫자와 쉼표만 허용
      const sanitizedValue = e.target.value.replace(/[^\d,]/g, '');
      setLocalValue(sanitizedValue);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        const numericValue = Number(localValue.replace(/,/g, ''));
        onChange(numericValue);
        inputRef.current?.blur();
      }
    };

    const handleBlur = () => {
      const numericValue = Number(localValue.replace(/,/g, ''));
      onChange(numericValue);
      setLocalValue(numericValue.toLocaleString());
    };

    // 외부 value가 변경되면 localValue 업데이트
    useEffect(() => {
      setLocalValue(value.toLocaleString());
    }, [value]);

    return (
      <input
        ref={inputRef}
        type="text"
        className="input input-bordered input-sm w-full text-right"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    );
  });

  // TextInput 컴포넌트 수정
  const TextInput = React.memo(({ value = '', onChange }) => {
    const [localValue, setLocalValue] = useState(value);
    const inputRef = useRef(null);

    const handleChange = (e) => {
      setLocalValue(e.target.value);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        onChange(localValue);
        inputRef.current?.blur();
      }
    };

    const handleBlur = () => {
      onChange(localValue);
    };

    useEffect(() => {
      setLocalValue(value);
    }, [value]);

    return (
      <input
        ref={inputRef}
        type="text"
        className="input input-bordered input-sm w-full"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    );
  });

  // UnitInput 컴포넌트 수정
  const UnitInput = React.memo(({ value = '0ｇ', onChange }) => {
    // 숫자와 단위 분리
    const parseUnit = (str = '0ｇ') => {
      const match = str.toString().match(/^(\d+)(.*)$/);
      return match ? { number: parseInt(match[1]), unit: match[2] } : { number: 0, unit: 'ｇ' };
    };

    const { number, unit } = parseUnit(value);
    const [localNumber, setLocalNumber] = useState(number);
    const inputRef = useRef(null);

    const handleNumberChange = (e) => {
      // 숫자만 허용
      const sanitizedValue = e.target.value.replace(/[^\d]/g, '');
      setLocalNumber(sanitizedValue);
    };

    const handleNumberKeyDown = (e) => {
      if (e.key === 'Enter') {
        onChange(`${localNumber}${unit}`);
        inputRef.current?.blur();
      }
    };

    const handleNumberBlur = () => {
      onChange(`${localNumber}${unit}`);
    };

    const handleUnitChange = (newUnit) => {
      onChange(`${localNumber}${newUnit}`);
    };

    useEffect(() => {
      const { number: newNumber } = parseUnit(value);
      setLocalNumber(newNumber);
    }, [value]);

    return (
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          className="input input-bordered input-sm w-20 text-right"
          value={localNumber}
          onChange={handleNumberChange}
          onKeyDown={handleNumberKeyDown}
          onBlur={handleNumberBlur}
        />
        <select
          className="select select-bordered select-sm w-16"
          value={unit}
          onChange={(e) => handleUnitChange(e.target.value)}
        >
          <option value="Ton">Ton</option>
          <option value="㎏">㎏</option>
          <option value="ｇ">ｇ</option>
          <option value="㎎">㎎</option>
          <option value="ℓ">ℓ</option>
          <option value="㎖">㎖</option>
          <option value="㎡">㎡</option>
        </select>
      </div>
    );
  });

  // getFirstOption 함수 추가
  const getFirstOption = (options) => {
    const realOptions = options.filter(opt => opt !== 'all');
    return realOptions.length > 0 ? realOptions[0] : '';
  };

  // 신규 추가를 위한 모달 컴포넌트 추가
  const AddChemicalModal = ({ isOpen, onClose, onAdd }) => {
    const [form, setForm] = useState({
      infoL2: '농약',
      infoL1: '살균제',
      name: '',
      unit: '100',
      unitType: 'ｇ',
      IN_PRICE: 0,
      OUT_PRICE: 0,
      OUT_PRICE1: 0,
    });

    // 예상 코드 생성
    const getPreviewCode = () => {
      const firstChar = form.infoL2 === '농약' ? 'A' : 
                       form.infoL2 === '비료' ? 'B' : 'C';
      
      const secondDigit = form.infoL2 === '농약' ? 
        (form.infoL1 === '살균제' ? '1' : 
         form.infoL1 === '살충제' ? '2' : 
         form.infoL1 === '제초제' ? '3' : '0') : '0';

      return `${firstChar}${secondDigit}xxx1`;
    };

    const handleSubmit = () => {
      if (!form.name.trim()) {
        alert('제품명을 입력해주세요.');
        return;
      }
      onAdd({
        ...form,  // unit과 unitType은 따로 전달
      });
    };

    return (
      <dialog className={`modal ${isOpen ? 'modal-open' : ''}`}>
        <div className="modal-box max-w-2xl">
          <h3 className="font-bold text-lg mb-4">신규 약품 등록</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">대분류</label>
              <select 
                className="select select-bordered w-full"
                value={form.infoL2}
                onChange={(e) => setForm(prev => ({ ...prev, infoL2: e.target.value }))}
              >
                <option value="농약">농약</option>
                <option value="비료">비료</option>
                <option value="기타약재">기타약재</option>
              </select>
            </div>
            
            {form.infoL2 === '농약' && (
              <div>
                <label className="label">중분류</label>
                <select 
                  className="select select-bordered w-full"
                  value={form.infoL1}
                  onChange={(e) => setForm(prev => ({ ...prev, infoL1: e.target.value }))}
                >
                  <option value="살균제">살균제</option>
                  <option value="살충제">살충제</option>
                  <option value="제초제">제초제</option>
                </select>
              </div>
            )}

            <div>
              <label className="label">제품명</label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">용량</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="input input-bordered w-full"
                  value={form.unit}
                  onChange={(e) => setForm(prev => ({ ...prev, unit: e.target.value }))}
                />
                <select
                  className="select select-bordered w-32"
                  value={form.unitType}
                  onChange={(e) => setForm(prev => ({ ...prev, unitType: e.target.value }))}
                >
                  <option value="Ton">Ton</option>
                  <option value="㎏">㎏</option>
                  <option value="ｇ">ｇ</option>
                  <option value="㎎">㎎</option>
                  <option value="ℓ">ℓ</option>
                  <option value="㎖">㎖</option>
                  <option value="㎡">㎡</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">구입가</label>
              <input
                type="number"
                className="input input-bordered w-full"
                value={form.IN_PRICE}
                onChange={(e) => setForm(prev => ({ ...prev, IN_PRICE: Number(e.target.value) }))}
              />
            </div>

            <div>
              <label className="label">용역판가</label>
              <input
                type="number"
                className="input input-bordered w-full"
                value={form.OUT_PRICE}
                onChange={(e) => setForm(prev => ({ ...prev, OUT_PRICE: Number(e.target.value) }))}
              />
            </div>

            <div>
              <label className="label">판가</label>
              <input
                type="number"
                className="input input-bordered w-full"
                value={form.OUT_PRICE1}
                onChange={(e) => setForm(prev => ({ ...prev, OUT_PRICE1: Number(e.target.value) }))}
              />
            </div>

            <div>
              <label className="label">예상 코드</label>
              <div className="text-lg font-mono bg-base-200 p-2 rounded">
                {getPreviewCode()}
              </div>
            </div>
          </div>

          <div className="modal-action">
            <button className="btn btn-primary" onClick={handleSubmit}>
              등록
            </button>
            <button className="btn" onClick={onClose}>
              취소
            </button>
          </div>
        </div>
      </dialog>
    );
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
    
    setChemicals(prev => [newChemical, ...prev]);
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
      const sequences = chemicals
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
      const sameNameItems = chemicals
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
        const result = await deleteChemical(dsids);
        if (result) {
          setChemicals(prev => prev.filter(chemical => chemical.dsids !== dsids));
        } else {
          alert('삭제에 실패했습니다.');
        }
      } catch (error) {
        console.error('Error deleting chemical:', error);
        alert('삭제 중 오류가 발생했습니다.');
      }
    }
  };

  // 행 렌더링 컴포넌트
  const TableRow = ({ chemical }) => {
    const isEditing = editingRows.has(chemical.dsids);
    const editedData = editedChemicals[chemical.dsids];

    if (isEditing) {
      return (
        <tr key={chemical.dsids}>
          <td className="w-32">
            <select 
              className="select select-bordered select-sm w-full"
              value={editedData.infoL3}
              onChange={(e) => handleEditChange(chemical.dsids, 'infoL3', e.target.value)}
            >
              {filterOptions.infoL3.filter(opt => opt !== 'all').map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </td>
          <td className="w-32">
            <select 
              className="select select-bordered select-sm w-full"
              value={editedData.infoL2}
              onChange={(e) => handleEditChange(chemical.dsids, 'infoL2', e.target.value)}
            >
              {filterOptions.infoL2.filter(opt => opt !== 'all').map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </td>
          <td className="w-32">
            <select 
              className="select select-bordered select-sm w-full"
              value={editedData.infoL1}
              onChange={(e) => handleEditChange(chemical.dsids, 'infoL1', e.target.value)}
            >
              {filterOptions.infoL1.filter(opt => opt !== 'all').map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </td>
          <td className="w-28">{chemical.dsids}</td>
          <td>
            <TextInput
              key={`name-${chemical.dsids}`}
              value={editedData.name}
              onChange={(value) => handleEditChange(chemical.dsids, 'name', value)}
            />
          </td>
          <td className="w-24">
            <UnitInput
              key={`unit-${chemical.dsids}`}
              value={editedData.unit}
              onChange={(value) => handleEditChange(chemical.dsids, 'unit', value)}
            />
          </td>
          <td className="w-32">
            <PriceInput
              key={`IN_PRICE-${chemical.dsids}`}
              value={editedData.IN_PRICE}
              onChange={(value) => handleEditChange(chemical.dsids, 'IN_PRICE', value)}
            />
          </td>
          <td className="w-32">
            <PriceInput
              key={`OUT_PRICE-${chemical.dsids}`}
              value={editedData.OUT_PRICE}
              onChange={(value) => handleEditChange(chemical.dsids, 'OUT_PRICE', value)}
            />
          </td>
          <td className="w-32">
            <PriceInput
              key={`OUT_PRICE1-${chemical.dsids}`}
              value={editedData.OUT_PRICE1}
              onChange={(value) => handleEditChange(chemical.dsids, 'OUT_PRICE1', value)}
            />
          </td>
          <td className="w-24">
            <select 
              className="select select-bordered select-sm w-full"
              value={editedData.active}
              onChange={(e) => handleEditChange(chemical.dsids, 'active', e.target.value)}
            >
              <option value="Y">사용</option>
              <option value="N">미사용</option>
            </select>
          </td>
          <td className="w-28">
            <select 
              className="select select-bordered select-sm w-full"
              value={editedData.flgWork}
              onChange={(e) => handleEditChange(chemical.dsids, 'flgWork', e.target.value)}
            >
              <option value="Y">사용</option>
              <option value="N">미사용</option>
            </select>
          </td>
          <td className="w-28">
            <select 
              className="select select-bordered select-sm w-full"
              value={editedData.flgOut}
              onChange={(e) => handleEditChange(chemical.dsids, 'flgOut', e.target.value)}
            >
              <option value="Y">사용</option>
              <option value="N">미사용</option>
            </select>
          </td>
          <td className="w-28">
            <div className="flex gap-2">
              <button 
                className="btn btn-xs btn-success"
                onClick={() => handleSave(chemical.dsids)}
              >
                저장
              </button>
              <button 
                className="btn btn-xs btn-error"
                onClick={() => handleCancel(chemical.dsids)}
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
        <td className="w-32">
          <span className="badge badge-ghost">{chemical.infoL3}</span>
        </td>
        <td className="w-32">{chemical.infoL2}</td>
        <td className="w-32">{chemical.infoL1}</td>
        <td className="w-28">{chemical.dsids}</td>
        <td>{chemical.name}</td>
        <td className="w-24">{chemical.unit}</td>
        <td className="w-32 text-right">{chemical.IN_PRICE.toLocaleString()}원</td>
        <td className="w-32 text-right">{chemical.OUT_PRICE.toLocaleString()}원</td>
        <td className="w-32 text-right">{chemical.OUT_PRICE1.toLocaleString()}원</td>
        <td className="w-24">
          <span className={`badge ${chemical.active === 'Y' ? 'badge-success' : 'badge-error'}`}>
            {chemical.active === 'Y' ? '사용' : '미사용'}
          </span>
        </td>
        <td className="w-28">
          <span className={`badge ${chemical.flgWork === 'Y' ? 'badge-success' : 'badge-error'}`}>
            {chemical.flgWork === 'Y' ? '사용' : '미사용'}
          </span>
        </td>
        <td className="w-28">
          <span className={`badge ${chemical.flgOut === 'Y' ? 'badge-success' : 'badge-error'}`}>
            {chemical.flgOut === 'Y' ? '사용' : '미사용'}
          </span>
        </td>
        <td className="w-28">
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
              <th className="w-32">중요도</th>
              <th className="w-32">대분류</th>
              <th className="w-32">중분류</th>
              <th className="w-28">코드</th>
              <th>제품명</th>
              <th className="w-24">용량</th>
              <th className="w-32 text-right">구입가</th>
              <th className="w-32 text-right">용역판가</th>
              <th className="w-32 text-right">판가</th>
              <th className="w-24">상태</th>
              <th className="w-28">방제팀 사용</th>
              <th className="w-28">용역팀 사용</th>
              <th className="w-28">작업</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedChemicals.map((chemical) => (
              <TableRow key={chemical.dsids} chemical={chemical} />
            ))}
          </tbody>
        </table>
      </div>
      <AddChemicalModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddConfirm}
      />
    </div>
  );
} 