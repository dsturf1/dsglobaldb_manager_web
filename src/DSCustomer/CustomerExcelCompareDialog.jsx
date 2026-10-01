import { useMemo, useState } from 'react';
import {
  FIELD_LABELS,
  parseCustomerExcel,
  compareCustomers,
  toNewCustomer,
  toUpdatedCustomer,
  guessCategory,
  formatAliases,
} from './customerExcel';
import { saveCustomers } from './customerApi';

/**
 * 이카운트 거래처등록 엑셀(ESA001M)을 올려 DB와 비교: 신규 / 변경 → 선택 반영.
 * 변경 반영 시 이카운트 필드만 바꾸고 분류·사용·메모는 유지한다.
 */
export default function CustomerExcelCompareDialog({ isOpen, onClose, customers, onSaved }) {
  const [excel, setExcel] = useState(null);       // { fileName, customers, warnings, exportedAt }
  const [error, setError] = useState('');
  const [tab, setTab] = useState('added');
  const [selected, setSelected] = useState(new Set());
  const [progress, setProgress] = useState(null);  // { done, total }

  const result = useMemo(
    () => (excel ? compareCustomers(excel.customers, customers) : null),
    [excel, customers]
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
      const parsed = parseCustomerExcel(await file.arrayBuffer());
      setExcel({ fileName: file.name, ...parsed });
    } catch (err) {
      console.error('Failed to parse customer excel:', err);
      setError(err.message);
    }
  };

  const rows = !result ? [] : tab === 'added'
    ? result.added.map(after => ({ key: after.custcd, after }))
    : result.changed.map(change => ({ key: change.after.custcd, ...change }));

  const toggle = (code) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.key));
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      rows.forEach(r => allSelected ? next.delete(r.key) : next.add(r.key));
      return next;
    });
  };

  const switchTab = (next) => {
    setTab(next);
    setSelected(new Set());
  };

  const handleApply = async () => {
    const targets = tab === 'added'
      ? result.added.filter(c => selected.has(c.custcd)).map(toNewCustomer)
      : result.changed.filter(c => selected.has(c.after.custcd)).map(c => toUpdatedCustomer(c.before, c.after));
    if (targets.length === 0) return;
    const label = tab === 'added' ? '추가' : '변경 반영';
    if (!window.confirm(`${targets.length}건을 ${label}하시겠습니까?`)) return;

    setProgress({ done: 0, total: targets.length });
    try {
      await saveCustomers(targets, (done, total) => setProgress({ done, total }));
      onSaved(targets);
      setSelected(new Set());
    } catch (err) {
      console.error('Failed to save customers:', err);
      alert(`저장 중 오류가 발생했습니다: ${err.message}\n저장된 건은 목록을 새로고침하면 보입니다.`);
    } finally {
      setProgress(null);
    }
  };

  if (!isOpen) return null;

  const isSaving = progress !== null;
  const showValue = (field, value) => (field === 'aliases' ? formatAliases(value) : value) || '-';

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-6xl">
        <h3 className="font-bold text-lg mb-2">이카운트 거래처 엑셀 비교</h3>

        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <input
            type="file"
            accept=".xlsx,.xls"
            className="file-input file-input-bordered file-input-sm"
            onChange={handleFile}
            disabled={isSaving}
          />
          <span className="text-gray-500">이카운트 거래처등록에서 내려받은 엑셀(ESA001M.xlsx)</span>
        </div>

        {error && <div className="alert alert-error text-sm my-2">{error}</div>}

        {result && (
          <>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
              <span>{excel.fileName}{excel.exportedAt && ` (${excel.exportedAt})`}</span>
              <span>엑셀 {excel.customers.length.toLocaleString()}건</span>
              <span>동일 {result.unchanged.toLocaleString()}건</span>
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
            </div>

            {rows.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                {tab === 'added' ? 'DB에 없는 거래처가 없습니다.' : '바뀐 거래처가 없습니다.'}
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[55vh]">
                <table className="table table-zebra table-sm w-full">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr>
                      <th className="w-10">
                        <input type="checkbox" className="checkbox checkbox-sm" checked={allSelected} onChange={toggleAll} />
                      </th>
                      <th className="w-32">거래처코드</th>
                      <th>거래처명</th>
                      {tab === 'added' ? (
                        <>
                          <th>대표자</th>
                          <th>업태</th>
                          <th>전화</th>
                          <th>별칭</th>
                          <th className="w-20">분류(추정)</th>
                        </>
                      ) : (
                        <th>바뀐 항목 (DB → 엑셀)</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.key} className="cursor-pointer hover:bg-gray-100" onClick={() => toggle(row.key)}>
                        <td>
                          <input type="checkbox" className="checkbox checkbox-sm" checked={selected.has(row.key)} readOnly />
                        </td>
                        <td className="text-xs">{row.key}</td>
                        <td className="text-sm">{row.after.name}</td>
                        {tab === 'added' ? (
                          <>
                            <td className="text-xs">{row.after.ceo}</td>
                            <td className="text-xs">{row.after.bizType}</td>
                            <td className="text-xs">{row.after.tel}</td>
                            <td className="text-xs">{formatAliases(row.after.aliases)}</td>
                            <td className="text-xs">{guessCategory(row.after)}</td>
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
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-3">
              {tab === 'added'
                ? '신규는 분류(추정값), 사용 Y로 추가됩니다. 추가 후 목록에서 수정하세요.'
                : '변경 반영은 이카운트 항목만 바꾸고 분류·사용·메모는 그대로 둡니다.'}
            </p>
          </>
        )}

        <div className="modal-action">
          {progress && (
            <span className="text-sm text-gray-500 self-center">
              저장 중 {progress.done}/{progress.total}
            </span>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleApply}
            disabled={!result || selected.size === 0 || isSaving}
          >
            {tab === 'added' ? `선택 추가 (${selected.size})` : `선택 반영 (${selected.size})`}
          </button>
          <button className="btn btn-sm" onClick={handleClose} disabled={isSaving}>닫기</button>
        </div>
      </div>
    </dialog>
  );
}
