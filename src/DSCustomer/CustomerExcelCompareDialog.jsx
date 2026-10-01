import { useMemo, useState } from 'react';
import {
  FIELD_LABELS,
  parseCustomerExcel,
  compareCustomers,
  toNewCustomer,
  toUpdatedCustomer,
  guessCategory,
  formatAliases,
  findLocalCustomerStatus,
  downloadCustomersForEcount,
  CUSTOMER_TYPES,
} from './customerExcel';
import { saveCustomers } from './customerApi';

/**
 * 이카운트 거래처등록 엑셀(ESA001M)을 올려 DB와 비교: 신규 / 변경 → 선택 반영.
 * 변경 반영 시 이카운트 필드만 바꾸고 분류·사용·메모는 유지한다.
 * '이카운트 미등록' 탭: 여기서 만든 거래처(origin=local) 중 엑셀에 없는 것 → 엑셀로 내려받아 이카운트에 등록.
 *   이카운트에 등록된 것이 확인되면 [등록 완료로 반영] → ecountSyncedAt 기록 (이후 미등록·다운로드 대상에서 제외)
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
  const localStatus = useMemo(
    () => (excel ? findLocalCustomerStatus(excel.allCodes, customers) : { unsynced: [], confirmed: [], conflicts: [] }),
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

  const rows = !result || tab === 'unsynced' ? [] : tab === 'added'
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

  // 이카운트에 등록된 것으로 확인된 자체 거래처에 ecountSyncedAt 기록
  const handleConfirmSynced = async () => {
    const now = new Date().toISOString();
    const targets = localStatus.confirmed.map(c => ({ ...c, ecountSyncedAt: now }));
    if (!window.confirm(`${targets.length}건을 이카운트 등록 완료로 표시하시겠습니까?`)) return;

    setProgress({ done: 0, total: targets.length });
    try {
      await saveCustomers(targets, (done, total) => setProgress({ done, total }));
      onSaved(targets);
    } catch (err) {
      console.error('Failed to mark customers synced:', err);
      alert(`저장 중 오류가 발생했습니다: ${err.message}`);
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
              <button role="tab" className={`tab ${tab === 'unsynced' ? 'tab-active' : ''}`} onClick={() => switchTab('unsynced')}>
                이카운트 미등록 {localStatus.unsynced.length}
                {localStatus.conflicts.length > 0 && <span className="badge badge-warning badge-sm ml-1">충돌 {localStatus.conflicts.length}</span>}
              </button>
            </div>

            {tab === 'unsynced' ? (
              <UnsyncedCustomers status={localStatus} onConfirm={handleConfirmSynced} isSaving={isSaving} />
            ) : rows.length === 0 ? (
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

            {tab !== 'unsynced' && (
              <p className="text-xs text-gray-500 mt-3">
                {tab === 'added'
                  ? '신규는 분류(추정값), 사용 Y로 추가됩니다. 추가 후 목록에서 수정하세요.'
                  : '변경 반영은 이카운트 항목만 바꾸고 분류·사용·메모는 그대로 둡니다.'}
              </p>
            )}
          </>
        )}

        <div className="modal-action">
          {progress && (
            <span className="text-sm text-gray-500 self-center">
              저장 중 {progress.done}/{progress.total}
            </span>
          )}
          {tab === 'unsynced' ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => downloadCustomersForEcount(localStatus.unsynced)}
              disabled={localStatus.unsynced.length === 0}
            >
              엑셀 다운로드 ({localStatus.unsynced.length})
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleApply}
              disabled={!result || selected.size === 0 || isSaving}
            >
              {tab === 'added' ? `선택 추가 (${selected.size})` : `선택 반영 (${selected.size})`}
            </button>
          )}
          <button className="btn btn-sm" onClick={handleClose} disabled={isSaving}>닫기</button>
        </div>
      </div>
    </dialog>
  );
}

// 여기서 만든 거래처 중 이카운트에 없는 것 + 코드 충돌
function UnsyncedCustomers({ status, onConfirm, isSaving }) {
  const { unsynced, confirmed, conflicts } = status;
  return (
    <>
      {confirmed.length > 0 && (
        <div className="alert alert-success text-sm mb-3 flex justify-between">
          <span>
            이카운트 등록 확인 {confirmed.length}건 — 여기서 만든 거래처가 이카운트에 같은 코드·이름으로 있습니다.
            ({confirmed.slice(0, 5).map(c => c.custcd).join(', ')}{confirmed.length > 5 ? ' …' : ''})
          </span>
          <button className="btn btn-sm" onClick={onConfirm} disabled={isSaving}>
            {isSaving ? '저장 중...' : '등록 완료로 반영'}
          </button>
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="alert alert-warning text-sm mb-3 block">
          <p className="font-semibold mb-1">코드 충돌 {conflicts.length}건 — 같은 코드가 이카운트에 다른 거래처로 있습니다.</p>
          <ul className="list-disc ml-5">
            {conflicts.map(({ customer, ecountName }) => (
              <li key={customer.custcd}>{customer.custcd}: 여기 &lsquo;{customer.name}&rsquo; / 이카운트 &lsquo;{ecountName}&rsquo;</li>
            ))}
          </ul>
        </div>
      )}
      {unsynced.length === 0 ? (
        <div className="py-8 text-center text-gray-500">여기서 만든 거래처 중 이카운트에 없는 것이 없습니다.</div>
      ) : (
        <div className="overflow-y-auto max-h-[55vh]">
          <table className="table table-zebra table-sm w-full">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="w-32">거래처코드</th>
                <th className="w-16">구분</th>
                <th>거래처명</th>
                <th>대표자</th>
                <th>업태</th>
                <th>전화</th>
                <th className="w-28">만든 날</th>
              </tr>
            </thead>
            <tbody>
              {unsynced.map(c => (
                <tr key={c.custcd}>
                  <td className="text-xs">{c.custcd}</td>
                  <td className="text-xs">{CUSTOMER_TYPES[c.custType] || ''}</td>
                  <td className="text-sm">{c.name}</td>
                  <td className="text-xs">{c.ceo}</td>
                  <td className="text-xs">{c.bizType}</td>
                  <td className="text-xs">{c.tel}</td>
                  <td className="text-xs">{c.createdAt ? new Date(c.createdAt).toLocaleDateString('ko-KR') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-500 mt-3">
        엑셀로 내려받아 이카운트 거래처등록에 올리세요. 이카운트에 등록되면 다음 비교부터 이 목록에서 빠집니다.
      </p>
    </>
  );
}
