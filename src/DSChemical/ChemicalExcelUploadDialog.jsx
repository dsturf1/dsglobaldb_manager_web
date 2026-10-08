import React, { useEffect, useState } from 'react';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { useGlobalComponent } from '../context/GlobalComponentContext';
import { updateChemical } from './chemicalApi';
import { compareChemicalExcel, FIELD_LABELS, PRICE_FIELDS } from './chemicalExcel';

/**
 * 약품 목록 엑셀(화면에서 내려받아 고친 것)을 올려 일괄 수정.
 * 바뀐 약품을 먼저 보여 주고, 고른 것만 저장한다. 결과는 약품마다 표시한다.
 */
const show = (field, value) => (PRICE_FIELDS.includes(field) ? Number(value || 0).toLocaleString() : String(value ?? '') || '-');

export default function ChemicalExcelUploadDialog({ isOpen, onClose }) {
  const { globalChemicals, setGlobalChemicals, updateGlobalChemical } = useGlobalComponent();

  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [saveClass, setSaveClass] = useState(false);
  const [status, setStatus] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [userTag, setUserTag] = useState('web');

  useEffect(() => {
    fetchUserAttributes()
      .then(attrs => setUserTag(`web:${attrs.email || attrs.sub}`))
      .catch(() => setUserTag('web'));
  }, []);

  if (!isOpen) return null;

  const reset = () => {
    setResult(null);
    setError('');
    setSelected(new Set());
    setSaveClass(false);
    setStatus({});
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
      const compared = compareChemicalExcel(await file.arrayBuffer(), globalChemicals);
      setResult(compared);
      // 내려받은 뒤 다른 곳에서 고친 약품은 기본으로 빼 둔다 (덮어쓰지 않도록)
      setSelected(new Set(compared.changes.filter(c => !c.stale).map(c => c.chemical.dsids)));
    } catch (err) {
      console.error('Failed to read chemical excel:', err);
      setError(err.message);
    }
  };

  const toggle = (dsids) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(dsids)) next.delete(dsids); else next.add(dsids);
    return next;
  });

  const replaceChemical = (saved) => setGlobalChemicals(prev => prev.map(c => (c.dsids === saved.dsids ? saved : c)));

  const saveOne = async ({ chemical, set, classSet }) => {
    if (Object.keys(set).length === 0 && !saveClass) return { ok: false, message: '대분류·중분류만 바뀌어 저장하지 않았습니다' };
    let saved = chemical;
    if (Object.keys(set).length > 0) {
      const { status: code, body } = await updateChemical(chemical, set, `${userTag}·엑셀`);
      if (code === 409) {
        replaceChemical(body.current);
        return { ok: false, message: '다른 곳에서 먼저 고쳤습니다. 다시 내려받아 고쳐 주세요' };
      }
      if (code !== 200) return { ok: false, message: body?.message || `오류 ${code}` };
      saved = body;
      replaceChemical(saved);
    }
    if (saveClass && Object.keys(classSet).length > 0) {
      const next = { ...saved, ...classSet, updatedAt: new Date().toISOString(), updatedBy: `${userTag}·엑셀` };
      if (!(await updateGlobalChemical(next))) return { ok: false, message: '정보는 저장했지만 대분류·중분류는 저장하지 못했습니다' };
    }
    return { ok: true, message: '저장함' };
  };

  const handleSave = async () => {
    const targets = result.changes.filter(c => selected.has(c.chemical.dsids));
    if (targets.length === 0) return;
    const classCount = targets.filter(c => Object.keys(c.classSet).length > 0).length;
    if (saveClass && classCount > 0 && !window.confirm(
      `대분류·중분류를 바꾸는 약품이 ${classCount}개 있습니다. 약품 코드의 분류와 맞지 않게 됩니다.\n그래도 저장하시겠습니까?`)) return;

    setIsSaving(true);
    for (const change of targets) {
      const dsids = change.chemical.dsids;
      setStatus(prev => ({ ...prev, [dsids]: { ok: null, message: '저장 중...' } }));
      let outcome;
      try {
        outcome = await saveOne(change);
      } catch (err) {
        console.error('Failed to update chemical from excel:', err);
        outcome = { ok: false, message: err.message };
      }
      setStatus(prev => ({ ...prev, [dsids]: outcome }));
    }
    setSelected(new Set());
    setIsSaving(false);
  };

  const changes = result?.changes || [];
  const hasClassChanges = changes.some(c => Object.keys(c.classSet).length > 0);
  const savedCount = Object.values(status).filter(s => s.ok).length;
  const failedCount = Object.values(status).filter(s => s.ok === false).length;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-5xl">
        <h3 className="font-bold text-lg mb-1">엑셀로 약품 일괄 수정</h3>
        <p className="text-xs text-gray-500 mb-3">
          [엑셀 다운로드]로 받은 파일을 고쳐서 올리세요. 코드로 약품을 찾아 바뀐 칸만 저장합니다.
          코드·마지막 수정 열은 고치지 마세요. 새 약품 추가와 삭제는 하지 않습니다.
        </p>

        <div className="flex items-center gap-2 mb-3">
          <input type="file" accept=".xlsx,.xls" className="file-input file-input-bordered file-input-sm"
            onChange={handleFile} disabled={isSaving} />
          {result && (
            <span className="text-sm text-gray-600">
              바뀐 약품 {changes.length} · 그대로 {result.unchanged} · 문제 {result.errors.length}
              {(savedCount + failedCount) > 0 && ` — 저장 ${savedCount}, 실패 ${failedCount}`}
            </span>
          )}
        </div>
        {error && <div className="alert alert-error text-sm mb-3">{error}</div>}

        {result && result.errors.length > 0 && (
          <details className="mb-3" open>
            <summary className="text-sm cursor-pointer text-error">저장하지 않는 줄 ({result.errors.length})</summary>
            <ul className="text-xs mt-1 max-h-32 overflow-y-auto">
              {result.errors.map(e => <li key={`${e.row}-${e.code}`}>{e.row}행 · {e.code} — {e.message}</li>)}
            </ul>
          </details>
        )}

        {changes.length > 0 && (
          <div className="overflow-x-auto max-h-[50vh]">
            <table className="table table-xs table-pin-rows">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" className="checkbox checkbox-xs" disabled={isSaving}
                      checked={selected.size > 0 && selected.size === changes.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(changes.map(c => c.chemical.dsids)) : new Set())} />
                  </th>
                  <th>코드</th>
                  <th>제품명</th>
                  <th>바뀌는 내용</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {changes.map(({ chemical, set, classSet, stale }) => {
                  const s = status[chemical.dsids];
                  return (
                    <tr key={chemical.dsids}>
                      <td>
                        <input type="checkbox" className="checkbox checkbox-xs" disabled={isSaving || s?.ok}
                          checked={selected.has(chemical.dsids)} onChange={() => toggle(chemical.dsids)} />
                      </td>
                      <td>{chemical.dsids}</td>
                      <td>{chemical.name}</td>
                      <td>
                        {stale && <span className="badge badge-warning badge-xs mr-1" title="엑셀을 내려받은 뒤 다른 곳에서 고친 약품입니다. 저장하면 그 수정 위에 엑셀 값을 씁니다">다운로드 후 수정됨</span>}
                        {Object.entries(set).map(([f, v]) => (
                          <span key={f} className="mr-2">{FIELD_LABELS[f]}: {show(f, chemical[f])} → <b>{show(f, v)}</b></span>
                        ))}
                        {Object.entries(classSet).map(([f, v]) => (
                          <span key={f} className={`mr-2 ${saveClass ? '' : 'line-through text-gray-400'}`}>
                            {FIELD_LABELS[f]}: {show(f, chemical[f])} → <b>{show(f, v)}</b>
                          </span>
                        ))}
                      </td>
                      <td className={s?.ok ? 'text-success' : s?.ok === false ? 'text-error' : ''}>{s?.message || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasClassChanges && (
          <label className="flex items-center gap-2 mt-2 text-sm">
            <input type="checkbox" className="checkbox checkbox-xs" checked={saveClass} disabled={isSaving}
              onChange={(e) => setSaveClass(e.target.checked)} />
            대분류·중분류 변경도 저장 (코드 체계와 맞지 않을 수 있음)
          </label>
        )}

        <div className="modal-action">
          <button className="btn" onClick={handleClose} disabled={isSaving}>닫기</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving || selected.size === 0}>
            {isSaving ? '저장 중...' : `선택 저장 (${selected.size})`}
          </button>
        </div>
      </div>
    </dialog>
  );
}
