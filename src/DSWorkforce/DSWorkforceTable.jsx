import React, { useMemo, useState } from 'react';
import { useComponent } from '../context/ComponentContext';

export default function DSWorkforceTable() {
  const { workforces } = useComponent();
  
  // 검색어 상태
  const [searchTerm, setSearchTerm] = useState('');
  
  // 필터 상태
  const [filters, setFilters] = useState({
    org: 'all',    
    category: 'all'
  });

  // 고유한 필터 옵션 추출
  const filterOptions = useMemo(() => ({
    org: ['all', ...new Set(workforces.map(w => w.org))],
    category: ['all', ...new Set(workforces.map(w => w.category))]
  }), [workforces]);

  // 필터링 및 정렬된 데이터
  const filteredAndSortedWorkforces = useMemo(() => {
    return [...workforces]
      .filter(workforce => {
        const searchMatch = searchTerm === '' || 
          workforce.name.toLowerCase().includes(searchTerm.toLowerCase());
        const orgMatch = filters.org === 'all' || workforce.org === filters.org;
        const categoryMatch = filters.category === 'all' || workforce.category === filters.category;
        return searchMatch && orgMatch && categoryMatch;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [workforces, filters, searchTerm]);

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
              <th>이름</th>
              <th className="w-24">직급</th>
              <th className="w-48">이메일</th>
              <th className="w-28">작업</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedWorkforces.map((workforce, index) => (
              <tr key={workforce.id}>
                <td className="text-center">{index + 1}</td>
                <td>{workforce.id}</td>
                <td>{workforce.org}</td>
                <td>{workforce.category}</td>
                <td>{workforce.name}</td>
                <td>{workforce.rank}</td>
                <td>{workforce.Email}</td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-xs btn-error">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 