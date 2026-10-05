import { useEffect, useMemo, useState } from 'react';
import { fetchCustomers, saveCustomers, deleteCustomer } from './customerApi';
import { CUSTOMER_CATEGORIES, CUSTOMER_TYPES, formatAliases } from './customerExcel';
import EditCustomerDialog from './EditCustomerDialog';
import AddCustomerDialog from './AddCustomerDialog';
import CustomerExcelCompareDialog from './CustomerExcelCompareDialog';

/**
 * 거래처 목록 (DynamoDB dscustomers).
 * 이카운트 거래처등록 엑셀로 추가/갱신하고, 분류·사용·메모는 여기서 관리한다.
 */
export default function DSCustomerTable() {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ category: 'all', active: 'all', origin: 'all' });
  const [selectedRow, setSelectedRow] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      setCustomers(await fetchCustomers());
    } catch (err) {
      console.error('Error fetching customers:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return customers
      .filter(c => {
        const searchMatch = term === '' ||
          [c.name, c.custcd, c.ceo, c.bizType, c.bizItem, formatAliases(c.aliases)]
            .some(v => (v || '').toLowerCase().includes(term));
        const categoryMatch = filters.category === 'all' || c.category === filters.category;
        const activeMatch = filters.active === 'all' || c.active === filters.active;
        const originMatch = filters.origin === 'all' || (c.origin === 'local') === (filters.origin === 'local');
        return searchMatch && categoryMatch && activeMatch && originMatch;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  }, [customers, searchTerm, filters]);

  // 저장된 거래처를 목록에 반영 (추가/수정 공통)
  const mergeSaved = (saved) => {
    const savedMap = new Map(saved.map(c => [c.custcd, c]));
    setCustomers(prev => [
      ...prev.map(c => savedMap.get(c.custcd) || c),
      ...saved.filter(c => !prev.some(p => p.custcd === c.custcd)),
    ]);
  };

  const handleSave = async (customer) => {
    try {
      await saveCustomers(customer);
      mergeSaved([customer]);
      return true;
    } catch (err) {
      console.error('Failed to save customer:', err);
      alert(`저장에 실패했습니다: ${err.message}`);
      return false;
    }
  };

  const handleDelete = async (customer) => {
    if (!window.confirm(`${customer.name} (${customer.custcd}) 을(를) 삭제하시겠습니까?`)) return;
    try {
      await deleteCustomer(customer.custcd);
      setCustomers(prev => prev.filter(c => c.custcd !== customer.custcd));
    } catch (err) {
      console.error('Failed to delete customer:', err);
      alert(`삭제에 실패했습니다: ${err.message}`);
    }
  };

  const FilterSelect = ({ value, onChange, options, labels = {} }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="select select-bordered select-sm">
      {options.map(option => (
        <option key={option} value={option}>{option === 'all' ? '전체' : (labels[option] || option)}</option>
      ))}
    </select>
  );

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">거래처 목록</h2>
          <input
            type="text"
            placeholder="거래처명·코드·대표자·별칭 검색..."
            className="input input-bordered input-sm w-72"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={() => setIsAddOpen(true)}>
            신규 추가
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setIsCompareOpen(true)}>
            이카운트 엑셀 비교
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">분류:</span>
          <FilterSelect
            value={filters.category}
            onChange={(v) => setFilters(prev => ({ ...prev, category: v }))}
            options={['all', ...CUSTOMER_CATEGORIES]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">사용:</span>
          <FilterSelect
            value={filters.active}
            onChange={(v) => setFilters(prev => ({ ...prev, active: v }))}
            options={['all', 'Y', 'N']}
            labels={{ Y: '사용', N: '미사용' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">출처:</span>
          <FilterSelect
            value={filters.origin}
            onChange={(v) => setFilters(prev => ({ ...prev, origin: v }))}
            options={['all', 'ecount', 'local']}
            labels={{ ecount: '이카운트', local: '자체 생성' }}
          />
        </div>
        <span className="text-sm text-gray-500">
          {filteredCustomers.length.toLocaleString()} / {customers.length.toLocaleString()}건
        </span>
      </div>

      {error && <div className="alert alert-error text-sm my-2">{error}</div>}
      {isLoading ? (
        <div className="py-8 text-center"><span className="loading loading-spinner"></span></div>
      ) : customers.length === 0 ? (
        <div className="py-8 text-center text-gray-500">
          거래처가 없습니다. [이카운트 엑셀 비교]로 거래처등록 엑셀을 올려 추가하세요.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm w-full">
            <thead>
              <tr>
                <th className="w-12 text-center">No.</th>
                <th className="w-32">거래처코드</th>
                <th>거래처명</th>
                <th className="w-24">대표자</th>
                <th>업태</th>
                <th>종목</th>
                <th className="w-32">전화</th>
                <th>별칭</th>
                <th className="w-20">분류</th>
                <th className="w-20">사용</th>
                <th className="w-20">작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c, index) => (
                <tr
                  key={c.custcd}
                  onClick={() => setSelectedRow(c.custcd)}
                  onDoubleClick={() => setEditingCustomer(c)}
                  className={`cursor-pointer hover:bg-gray-100 ${
                    selectedRow === c.custcd ? 'outline outline-2 outline-blue-500 relative z-10' : ''
                  }`}
                >
                  <td className="text-center text-xs">{index + 1}</td>
                  <td className="text-xs">
                    {c.custcd}
                    {c.origin === 'local' && (
                      <span
                        className={`badge badge-xs ml-1 ${c.ecountSyncedAt ? 'badge-success' : 'badge-warning'}`}
                        title={c.ecountSyncedAt
                          ? `여기서 만든 거래처 · 이카운트 등록 확인 ${new Date(c.ecountSyncedAt).toLocaleDateString('ko-KR')}`
                          : '여기서 만든 거래처 · 이카운트 미등록'}
                      >
                        자체{c.custType ? `·${CUSTOMER_TYPES[c.custType]}` : ''}·{c.ecountSyncedAt ? '등록됨' : '미등록'}
                      </span>
                    )}
                  </td>
                  <td className="text-sm">{c.name}</td>
                  <td className="text-xs">{c.ceo}</td>
                  <td className="text-xs">{c.bizType}</td>
                  <td className="text-xs">{c.bizItem}</td>
                  <td className="text-xs">{c.tel}</td>
                  <td className="text-xs">{formatAliases(c.aliases)}</td>
                  <td className="text-xs"><span className="badge badge-ghost text-xs">{c.category}</span></td>
                  <td className="text-xs">
                    <span className={`badge ${c.active === 'Y' ? 'badge-success' : 'badge-error'} text-xs`}>
                      {c.active === 'Y' ? '사용' : '미사용'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-xs btn-error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(c);
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditCustomerDialog
        customer={editingCustomer}
        onClose={() => setEditingCustomer(null)}
        onSave={handleSave}
      />

      <AddCustomerDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        customers={customers}
        onCreated={(customer) => mergeSaved([customer])}
      />

      <CustomerExcelCompareDialog
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        customers={customers}
        onSaved={mergeSaved}
      />
    </div>
  );
}
