import { useMemo, useState } from 'react';
import { useGlobalComponent } from '../context/GlobalComponentContext';
import {
  FIELD_LABELS,
  parseWarehouseExcel,
  compareWarehouses,
  toNewWarehouse,
  toUpdatedWarehouse,
  countChemicalsUsingName,
  findLocalWarehouseStatus,
  downloadWarehousesForEcount,
} from './warehouseExcel';
import { saveWarehouses } from './warehouseApi';

/**
 * 이카운트 창고등록 엑셀(ESA005M)을 올려 DB와 비교: 신규 / 변경 / 이카운트 미등록.
 * 변경 반영 시 이카운트 항목만 바꾸고 메모는 유지한다.
 * 창고명 변경은 약품·방제 기본정보의 창고 연결(이름 기준)을 끊을 수 있어 따로 경고한다.
 */
export default function WarehouseExcelCompareDialog({ isOpen, onClose, warehouses, onSaved }) {
  const { globalChemicals } = useGlobalComponent();
  const [excel, setExcel] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('added');
  const [selected, setSelected] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const result = useMemo(() => (excel ? compareWarehouses(excel.warehouses, warehouses) : null), [excel, warehouses]);
  const localStatus = useMemo(
    () => (excel ? findLocalWarehouseStatus(excel.allCodes, warehouses) : { unsynced: [], confirmed: [], conflicts: [] }),
    [excel, warehouses]
  );

  const reset = () => {
    setExcel(null);
    setError('');
    setSelected(new Set());
    setTab('added');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    reset();
    try {
      setExcel({ fileName: file.name, ...parseWarehouseExcel(await file.arrayBuffer()) });
    } catch (err) {
      console.error('Failed to parse warehouse excel:', err);
      setError(err.message);
    }
  };

  const rows = !result || tab === 'unsynced' ? [] : tab === 'added'
    ? result.added.map(after => ({ key: after.whcd, after }))
    : result.changed.map(change => ({ key: change.after.whcd, ...change }));

  const toggle = (code) => setSelected(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.key));
  const toggleAll = () => setSelected(prev => {
    const next = new Set(prev);
    rows.forEach(r => allSelected ? next.delete(r.key) : next.add(r.key));
    return next;
  });
  const switchTab = (next) => {
    setTab(next);
    setSelected(new Set());
  };

  const save = async (targets, label) => {
    if (targets.length === 0 || !window.confirm(`${targets.length}건을 ${label}하시겠습니까?`)) return;
    setIsSaving(true);
    try {
      await saveWarehouses(targets);
      onSaved(targets);
      setSelected(new Set());
    } catch (err) {
      console.error('Failed to save warehouses:', err);
      alert(`저장 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApply = () => (tab === 'added'
    ? save(result.added.filter(w => selected.has(w.whcd)).map(toNewWarehouse), '추가')
    : save(result.changed.filter(c => selected.has(c.after.whcd)).map(c => toUpdatedWarehouse(c.before, c.after)), '변경 반영'));

  const handleConfirmSynced = () => {
    const now = new Date().toISOString();
    save(localStatus.confirmed.map(w => ({ ...w, ecountSyncedAt: now })), '이카운트 등록 완료로 표시');
  };

  if (!isOpen) return null;

  const showValue = (field, value) => (field === 'active' ? (value === 'N' ? '미사용' : '사용') : value) || '-';

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-5xl">
        <h3 className="font-bold text-lg mb-2">이카운트 창고 엑셀 비교</h3>

        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <input type="file" accept=".xlsx,.xls" className="file-input file-input-bordered file-input-sm"
            onChange={handleFile} disabled={isSaving} />
          <span className="text-gray-500">이카운트 창고등록에서 내려받은 엑셀(ESA005M.xlsx)</span>
        </div>

        {error && <div className="alert alert-error text-sm my-2">{error}</div>}

        {result && (
          <>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
              <span>{excel.fileName}{excel.exportedAt && ` (${excel.exportedAt})`}</span>
              <span>엑셀 {excel.warehouses.length}건</span>
              <span>동일 {result.unchanged}건</span>
              {result.dbOnly.length > 0 && <span>DB에만 있음 {result.dbOnly.length}건</span>}
            </div>
            {excel.warnings.length > 0 && (
              <details className="text-xs text-warning mb-2">
                <summary>경고 {excel.warnings.length}건</summary>
                <ul className="list-disc ml-5">{excel.warnings.map(w => <li key={w}>{w}</li>)}</ul>
              </details>
            )}

            <div role="tablist" className="tabs tabs-boxed mb-2 w-fit">
              <button role="tab" className={`tab ${tab === 'added' ? 'tab-active' : ''}`} onClick={() => switchTab('added')}>
                신규 {result.added.length}
              </button>
              <button role="tab" className={`tab ${tab === 'changed' ? 'tab-active' : ''}`} onClick={() => switchTab('changed')}>
                변경 {result.changed.length}
              </button>
              <button role="tab" className={`tab ${tab === 'unsynced' ? 'tab-active' : ''}`} onClick={() => switchTab('unsynced')}>
                이카운트 미등록 {localStatus.unsynced.length}
                {localStatus.conflicts.length > 0 && <span className="badge badge-warning badge-sm ml-1">충돌 {localStatus.conflicts.length}</span>}
              </button>
            </div>

            {tab === 'unsynced' ? (
              <UnsyncedWarehouses status={localStatus} onConfirm={handleConfirmSynced} isSaving={isSaving} />
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                {tab === 'added' ? 'DB에 없는 창고가 없습니다.' : '바뀐 창고가 없습니다.'}
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[55vh]">
                <table className="table table-zebra table-sm w-full">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr>
                      <th className="w-10">
                        <input type="checkbox" className="checkbox checkbox-sm" checked={allSelected} onChange={toggleAll} />
                      </th>
                      <th className="w-24">창고코드</th>
                      <th>창고명</th>
                      {tab === 'added' ? (
                        <>
                          <th className="w-20">구분</th>
                          <th className="w-20">사용</th>
                          <th>추가사업장명</th>
                        </>
                      ) : (
                        <th>바뀐 항목 (DB → 엑셀)</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const renamed = tab === 'changed' && row.fields.includes('name');
                      const usedBy = renamed ? countChemicalsUsingName(globalChemicals, row.before.name) : 0;
                      return (
                        <tr key={row.key} className="cursor-pointer hover:bg-gray-100" onClick={() => toggle(row.key)}>
                          <td><input type="checkbox" className="checkbox checkbox-sm" checked={selected.has(row.key)} readOnly /></td>
                          <td className="text-xs">{row.key}</td>
                          <td className="text-sm">{row.after.name}</td>
                          {tab === 'added' ? (
                            <>
                              <td className="text-xs">{row.after.whType}</td>
                              <td className="text-xs">{showValue('active', row.after.active)}</td>
                              <td className="text-xs">{row.after.site}</td>
                            </>
                          ) : (
                            <td className="text-xs">
                              {row.fields.map(f => (
                                <div key={f}>
                                  <span className="text-gray-500">{FIELD_LABELS[f]}: </span>
                                  <span className="line-through text-gray-400">{showValue(f, row.before[f])}</span>
                                  {' → '}
                                  <span className="font-semibold">{showValue(f, row.after[f])}</span>
                                </div>
                              ))}
                              {renamed && (
                                <div className="text-warning font-semibold">
                                  ⚠ 창고명 변경: 약품 {usedBy}건과 방제 기본정보가 이전 이름 &lsquo;{row.before.name}&rsquo;으로 연결돼 있을 수 있습니다
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {tab !== 'unsynced' && (
              <p className="text-xs text-gray-500 mt-3">
                {tab === 'added'
                  ? '신규는 엑셀 값 그대로 추가됩니다.'
                  : '변경 반영은 이카운트 항목만 바꾸고 메모는 그대로 둡니다. 창고명을 바꾸면 약품·방제 기본정보의 창고명도 같이 고쳐야 합니다.'}
              </p>
            )}
          </>
        )}

        <div className="modal-action">
          {tab === 'unsynced' ? (
            <button className="btn btn-primary btn-sm" onClick={() => downloadWarehousesForEcount(localStatus.unsynced)}
              disabled={localStatus.unsynced.length === 0}>
              엑셀 다운로드 ({localStatus.unsynced.length})
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={handleApply} disabled={!result || selected.size === 0 || isSaving}>
              {isSaving ? '저장 중...' : tab === 'added' ? `선택 추가 (${selected.size})` : `선택 반영 (${selected.size})`}
            </button>
          )}
          <button className="btn btn-sm" onClick={handleClose} disabled={isSaving}>닫기</button>
        </div>
      </div>
    </dialog>
  );
}

// 여기서 만든 창고 중 이카운트에 없는 것 + 등록 확인 + 코드 충돌
function UnsyncedWarehouses({ status, onConfirm, isSaving }) {
  const { unsynced, confirmed, conflicts } = status;
  return (
    <>
      {confirmed.length > 0 && (
        <div className="alert alert-success text-sm mb-3 flex justify-between">
          <span>이카운트 등록 확인 {confirmed.length}건 ({confirmed.map(w => w.whcd).join(', ')})</span>
          <button className="btn btn-sm" onClick={onConfirm} disabled={isSaving}>등록 완료로 반영</button>
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="alert alert-warning text-sm mb-3 block">
          <p className="font-semibold mb-1">코드 충돌 {conflicts.length}건 — 같은 창고코드가 이카운트에 다른 이름으로 있습니다.</p>
          <ul className="list-disc ml-5">
            {conflicts.map(({ warehouse, ecountName }) => (
              <li key={warehouse.whcd}>{warehouse.whcd}: 여기 &lsquo;{warehouse.name}&rsquo; / 이카운트 &lsquo;{ecountName}&rsquo;</li>
            ))}
          </ul>
        </div>
      )}
      {unsynced.length === 0 ? (
        <div className="py-8 text-center text-gray-500">여기서 만든 창고 중 이카운트에 없는 것이 없습니다.</div>
      ) : (
        <table className="table table-zebra table-sm w-full">
          <thead>
            <tr><th className="w-24">창고코드</th><th>창고명</th><th className="w-20">구분</th><th className="w-28">만든 날</th></tr>
          </thead>
          <tbody>
            {unsynced.map(w => (
              <tr key={w.whcd}>
                <td className="text-xs">{w.whcd}</td>
                <td className="text-sm">{w.name}</td>
                <td className="text-xs">{w.whType}</td>
                <td className="text-xs">{w.createdAt ? new Date(w.createdAt).toLocaleDateString('ko-KR') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-gray-500 mt-3">
        엑셀로 내려받아 이카운트 창고등록에 올리세요. 이카운트에 등록되면 다음 비교에서 &lsquo;등록 완료로 반영&rsquo;할 수 있습니다.
      </p>
    </>
  );
}
