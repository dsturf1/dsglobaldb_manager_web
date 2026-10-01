import React, { useMemo, useState } from 'react';
import { useGlobalComponent } from '../context/GlobalComponentContext';
import {
  ECOUNT_PREFIX_CLASS,
  fetchEcountProducts,
  parseEcountProductExcel,
  findNewEcountProducts,
  ecountToChemical,
} from './ecountCompare';

/**
 * 이카운트 품목 중 약품 DB에 없는 것(신규)을 보여주고, 선택한 품목을 약품으로 추가한다.
 * 이카운트 데이터는 품목등록 엑셀(ESA009M) 또는 서버(fetch_products.py 로 올린 파일)에서 읽는다.
 * 추가 시 구입가만 이카운트 값을 쓰고, 판가는 0으로 넣는다 (DB에서 직접 입력).
 */
export default function EcountCompareDialog({ isOpen, onClose }) {
  const { globalChemicals, addGlobalChemical } = useGlobalComponent();

  const [ecount, setEcount] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [prefixFilter, setPrefixFilter] = useState('all');

  const load = async (loader) => {
    setIsLoading(true);
    setError('');
    setEcount(null);
    setSelected(new Set());
    try {
      setEcount(await loader());
    } catch (err) {
      console.error('Failed to load ecount products:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) load(async () => parseEcountProductExcel(await file.arrayBuffer(), file.name));
  };

  const handleClose = () => {
    setEcount(null);
    setError('');
    setSelected(new Set());
    onClose();
  };

  const newItems = useMemo(
    () => (ecount ? findNewEcountProducts(ecount.items, globalChemicals) : []),
    [ecount, globalChemicals]
  );

  const visibleItems = useMemo(
    () => newItems.filter(item => prefixFilter === 'all' || item.PROD_CD.startsWith(prefixFilter)),
    [newItems, prefixFilter]
  );

  const toggle = (code) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(item => selected.has(item.PROD_CD));
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      visibleItems.forEach(item => allVisibleSelected ? next.delete(item.PROD_CD) : next.add(item.PROD_CD));
      return next;
    });
  };

  const handleAdd = async () => {
    const targets = newItems.filter(item => selected.has(item.PROD_CD));
    if (targets.length === 0) return;
    if (!window.confirm(`${targets.length}건을 약품 목록에 추가하시겠습니까?`)) return;

    setIsSaving(true);
    const failed = [];
    for (const item of targets) {
      const ok = await addGlobalChemical(ecountToChemical(item));
      if (!ok) failed.push(item.PROD_CD);
    }
    setIsSaving(false);
    setSelected(new Set(failed));
    if (failed.length > 0) {
      alert(`${failed.length}건 추가에 실패했습니다: ${failed.join(', ')}`);
    }
  };

  if (!isOpen) return null;

  return (
    <dialog className={`modal ${isOpen ? 'modal-open' : ''}`}>
      <div className="modal-box max-w-5xl">
        <h3 className="font-bold text-lg mb-2">이카운트 비교 — 신규 품목</h3>

        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <input
            type="file"
            accept=".xlsx,.xls"
            className="file-input file-input-bordered file-input-sm"
            onChange={handleFile}
            disabled={isLoading || isSaving}
          />
          <span className="text-gray-500">품목등록 엑셀(ESA009M.xlsx)</span>
          <span className="text-gray-300">또는</span>
          <button
            className="btn btn-sm"
            onClick={() => load(fetchEcountProducts)}
            disabled={isLoading || isSaving}
          >
            서버 데이터 불러오기
          </button>
        </div>

        {isLoading && <div className="py-8 text-center"><span className="loading loading-spinner"></span></div>}
        {error && <div className="alert alert-error text-sm my-2">{error}</div>}

        {ecount && !isLoading && (
          <>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
              <span>{ecount.sourceLabel}</span>
              <span>비교 대상 {ecount.items.length.toLocaleString()}건</span>
              <span className="font-semibold text-blue-600">신규 {newItems.length}건</span>
              <select
                className="select select-bordered select-sm"
                value={prefixFilter}
                onChange={(e) => setPrefixFilter(e.target.value)}
              >
                <option value="all">전체 분류</option>
                {Object.entries(ECOUNT_PREFIX_CLASS).map(([prefix, cls]) => (
                  <option key={prefix} value={prefix}>
                    {prefix} {cls.infoL2}{cls.infoL1 !== cls.infoL2 ? `/${cls.infoL1}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {newItems.length === 0 ? (
              <div className="py-8 text-center text-gray-500">약품 목록에 없는 이카운트 품목이 없습니다.</div>
            ) : (
              <div className="overflow-y-auto max-h-[60vh]">
                <table className="table table-zebra table-sm w-full">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="w-10">
                        <input type="checkbox" className="checkbox checkbox-sm" checked={allVisibleSelected} onChange={toggleAll} />
                      </th>
                      <th className="w-24">코드</th>
                      <th className="w-24">대분류</th>
                      <th className="w-24">중분류</th>
                      <th>제품명</th>
                      <th className="w-24">용량</th>
                      <th className="w-28 text-right">구입가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map(item => {
                      const cls = ECOUNT_PREFIX_CLASS[item.PROD_CD.slice(0, 2)];
                      return (
                        <tr key={item.PROD_CD} className="cursor-pointer hover:bg-gray-100" onClick={() => toggle(item.PROD_CD)}>
                          <td>
                            <input type="checkbox" className="checkbox checkbox-sm" checked={selected.has(item.PROD_CD)} readOnly />
                          </td>
                          <td className="text-sm">{item.PROD_CD}</td>
                          <td className="text-xs">{cls.infoL2}</td>
                          <td className="text-xs">{cls.infoL1}</td>
                          <td className="text-sm">{item.PROD_DES}</td>
                          <td className="text-xs">{item.SIZE_DES}</td>
                          <td className="text-right text-xs">{Number(item.IN_PRICE).toLocaleString()}원</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-3">
              추가 시 중요도는 &lsquo;신규구매&rsquo;, 방제팀·용역팀은 미사용, 판가는 0으로 들어갑니다. 추가 후 약품 목록에서 수정하세요.
            </p>
          </>
        )}

        <div className="modal-action">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAdd}
            disabled={selected.size === 0 || isSaving}
          >
            {isSaving ? '추가 중...' : `선택 추가 (${selected.size})`}
          </button>
          <button className="btn btn-sm" onClick={handleClose} disabled={isSaving}>닫기</button>
        </div>
      </div>
    </dialog>
  );
}
