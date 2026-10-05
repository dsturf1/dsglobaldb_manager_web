import { useEffect, useMemo, useState } from 'react';
import { useGlobalComponent } from '../context/GlobalComponentContext';
import { fetchWarehouses, saveWarehouses, deleteWarehouse } from './warehouseApi';
import { FIELD_LABELS, countChemicalsUsingName } from './warehouseExcel';
import AddWarehouseDialog from './AddWarehouseDialog';
import WarehouseExcelCompareDialog from './WarehouseExcelCompareDialog';

/**
 * 창고 목록 (DynamoDB dswarehouses).
 * 이카운트 창고등록 엑셀로 추가·갱신하고, 메모만 여기서 관리한다.
 * '약품' 열은 창고명으로 연결된 약품 수 (약품.warehouse 가 창고명을 쓴다).
 */
export default function DSWarehouseTable() {
  const { globalChemicals } = useGlobalComponent();
  const [warehouses, setWarehouses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ active: 'all', origin: 'all' });
  const [editing, setEditing] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      setWarehouses(await fetchWarehouses());
    } catch (err) {
      console.error('Error fetching warehouses:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return warehouses
      .filter(w => (term === '' || [w.whcd, w.name, w.memo].some(v => (v || '').toLowerCase().includes(term)))
        && (filters.active === 'all' || w.active === filters.active)
        && (filters.origin === 'all' || (w.origin === 'local') === (filters.origin === 'local')))
      .sort((a, b) => a.whcd.localeCompare(b.whcd, 'ko', { numeric: true }));
  }, [warehouses, searchTerm, filters]);

  // 저장된 창고를 목록에 반영 (추가/수정 공통)
  const mergeSaved = (saved) => {
    const savedMap = new Map(saved.map(w => [w.whcd, w]));
    setWarehouses(prev => [
      ...prev.map(w => savedMap.get(w.whcd) || w),
      ...saved.filter(w => !prev.some(p => p.whcd === w.whcd)),
    ]);
  };

  const handleSaveMemo = async (warehouse) => {
    try {
      const updated = { ...warehouse, updatedAt: new Date().toISOString() };
      await saveWarehouses(updated);
      mergeSaved([updated]);
      setEditing(null);
    } catch (err) {
      console.error('Failed to save warehouse:', err);
      alert(`저장에 실패했습니다: ${err.message}`);
    }
  };

  const handleDelete = async (w) => {
    const usedBy = countChemicalsUsingName(globalChemicals, w.name);
    const warning = usedBy > 0 ? `\n이 창고명을 쓰는 약품이 ${usedBy}건 있습니다.` : '';
    if (!window.confirm(`${w.whcd} ${w.name} 을(를) 삭제하시겠습니까?${warning}`)) return;
    try {
      await deleteWarehouse(w.whcd);
      setWarehouses(prev => prev.filter(x => x.whcd !== w.whcd));
    } catch (err) {
      console.error('Failed to delete warehouse:', err);
      alert(`삭제에 실패했습니다: ${err.message}`);
    }
  };

  const FilterSelect = ({ value, onChange, options, labels = {} }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="select select-bordered select-sm">
      {options.map(o => <option key={o} value={o}>{o === 'all' ? '전체' : (labels[o] || o)}</option>)}
    </select>
  );

  return (
    <div className="p-4">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xl font-semibold">창고 목록</h2>
        <input
          type="text"
          placeholder="창고코드·창고명·메모 검색..."
          className="input input-bordered input-sm w-64"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" onClick={() => setIsAddOpen(true)}>신규 추가</button>
        <button className="btn btn-outline btn-sm" onClick={() => setIsCompareOpen(true)}>이카운트 엑셀 비교</button>
      </div>

      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">사용:</span>
          <FilterSelect value={filters.active} onChange={(v) => setFilters(p => ({ ...p, active: v }))}
            options={['all', 'Y', 'N']} labels={{ Y: '사용', N: '미사용' }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">출처:</span>
          <FilterSelect value={filters.origin} onChange={(v) => setFilters(p => ({ ...p, origin: v }))}
            options={['all', 'ecount', 'local']} labels={{ ecount: '이카운트', local: '자체 생성' }} />
        </div>
        <span className="text-sm text-gray-500">{filtered.length} / {warehouses.length}건</span>
      </div>

      {error && <div className="alert alert-error text-sm my-2">{error}</div>}
      {isLoading ? (
        <div className="py-8 text-center"><span className="loading loading-spinner"></span></div>
      ) : warehouses.length === 0 ? (
        <div className="py-8 text-center text-gray-500">
          창고가 없습니다. [이카운트 엑셀 비교]로 창고등록 엑셀(ESA005M)을 올려 추가하세요.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm w-full">
            <thead>
              <tr>
                <th className="w-24">창고코드</th>
                <th>창고명</th>
                <th className="w-16">구분</th>
                <th className="w-20">사용</th>
                <th className="w-20 text-right">약품</th>
                <th>추가사업장명</th>
                <th>메모</th>
                <th className="w-20">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(w => (
                <tr key={w.whcd} className="cursor-pointer hover:bg-gray-100" onDoubleClick={() => setEditing(w)}>
                  <td className="text-xs">
                    {w.whcd}
                    {w.origin === 'local' && (
                      <span className={`badge badge-xs ml-1 ${w.ecountSyncedAt ? 'badge-success' : 'badge-warning'}`}>
                        자체·{w.ecountSyncedAt ? '등록됨' : '미등록'}
                      </span>
                    )}
                  </td>
                  <td className="text-sm">{w.name}</td>
                  <td className="text-xs">{w.whType}</td>
                  <td className="text-xs">
                    <span className={`badge ${w.active === 'Y' ? 'badge-success' : 'badge-error'} text-xs`}>
                      {w.active === 'Y' ? '사용' : '미사용'}
                    </span>
                  </td>
                  <td className="text-xs text-right">{countChemicalsUsingName(globalChemicals, w.name) || ''}</td>
                  <td className="text-xs">{w.site}</td>
                  <td className="text-xs">{w.memo}</td>
                  <td>
                    <button className="btn btn-xs btn-error" onClick={(e) => { e.stopPropagation(); handleDelete(w); }}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <EditMemoDialog warehouse={editing} onClose={() => setEditing(null)} onSave={handleSaveMemo} />}
      <AddWarehouseDialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} warehouses={warehouses}
        onCreated={(w) => mergeSaved([w])} />
      <WarehouseExcelCompareDialog isOpen={isCompareOpen} onClose={() => setIsCompareOpen(false)}
        warehouses={warehouses} onSaved={mergeSaved} />
    </div>
  );
}

// 이카운트 항목은 읽기 전용(엑셀 비교로만 갱신), 메모만 수정
function EditMemoDialog({ warehouse, onClose, onSave }) {
  const [memo, setMemo] = useState(warehouse.memo || '');
  const rows = ['whcd', 'name', 'whType', 'process', 'outCust', 'site'];
  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h3 className="font-bold text-lg mb-4">창고 정보</h3>
        <div className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm mb-2">
          {rows.map(f => (
            <div key={f} className="contents">
              <span className="text-gray-500">{FIELD_LABELS[f]}</span>
              <span>{warehouse[f] || '-'}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mb-3">위 항목은 이카운트 엑셀 비교로만 바뀝니다.</p>
        <label className="label">메모</label>
        <textarea className="textarea textarea-bordered w-full" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
        <div className="modal-action">
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...warehouse, memo })}>저장</button>
        </div>
      </div>
    </dialog>
  );
}
