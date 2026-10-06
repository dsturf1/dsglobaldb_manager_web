import React, { useEffect, useState } from 'react';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { NumberInput, TextInput, UnitInput } from '../components/DSInputs';
import { updateChemical, updateChemicalAliases, fetchChemicalHistory } from './chemicalApi';

/**
 * 약품 수정 — 외부 앱(재고 봇 등)과 같은 API를 쓴다 (docs/gdb-update-api-request.md 4장).
 * - 정보: 바뀐 필드만 POST /dschemical/update. 불러온 뒤 다른 곳에서 고쳤으면 409 → 최신 내용을 다시 보여준다
 * - 대분류·중분류는 코드 체계와 묶여 있어 수정 API가 받지 않는다. 바꾸면 확인 후 웹 전용 저장(PUT)으로 따로 저장한다
 * - 별칭: POST /dschemical/alias 로 바로 더하고 뺀다 / 변경 이력: GET /dschemical/history
 */
const UPDATE_FIELDS = ['name', 'unit', 'infoL3', 'IN_PRICE', 'OUT_PRICE', 'OUT_PRICE1', 'active', 'flgWork', 'flgOut'];
const PRICE_FIELDS = ['IN_PRICE', 'OUT_PRICE', 'OUT_PRICE1'];
const CLASS_FIELDS = ['infoL2', 'infoL1'];
const LABELS = {
  name: '제품명', unit: '용량', infoL3: '중요도', IN_PRICE: '구입가', OUT_PRICE: '용역판가', OUT_PRICE1: '판가',
  active: '상태', flgWork: '방제팀', flgOut: '용역팀', vendors: '구매처', aliases: '별칭', infoL1: '중분류', infoL2: '대분류',
};

const same = (field, a, b) => (PRICE_FIELDS.includes(field) ? Number(a || 0) === Number(b || 0) : String(a ?? '').trim() === String(b ?? '').trim());

export default function EditChemicalDialog({ isOpen, onClose, chemical, onSaved, onSaveClass, filterOptions }) {
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(null);
  const [newAlias, setNewAlias] = useState('');
  const [history, setHistory] = useState([]);
  const [userTag, setUserTag] = useState('web');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setRecord(chemical);
    setForm(chemical ? { ...chemical } : null);
    setNewAlias('');
    if (chemical) loadHistory(chemical.dsids);
  }, [chemical]);

  useEffect(() => {
    fetchUserAttributes()
      .then(attrs => setUserTag(`web:${attrs.email || attrs.sub}`))
      .catch(() => setUserTag('web'));
  }, []);

  const loadHistory = async (dsids) => {
    try {
      setHistory(await fetchChemicalHistory(dsids));
    } catch (err) {
      console.error('Failed to load chemical history:', err);
      setHistory([]);
    }
  };

  const applyRecord = (saved, { resetForm = true } = {}) => {
    setRecord(saved);
    if (resetForm) setForm({ ...saved });
    onSaved(saved);
    loadHistory(saved.dsids);
  };

  if (!isOpen || !record || !form) return null;

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const changed = UPDATE_FIELDS.filter(f => !same(f, form[f], record[f]));
  const classChanged = CLASS_FIELDS.filter(f => !same(f, form[f], record[f]));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (changed.length === 0 && classChanged.length === 0) return onClose();
    if (classChanged.length > 0 && !window.confirm(
      `대분류·중분류를 바꾸면 약품 코드(${record.dsids})의 분류와 맞지 않게 됩니다.\n그래도 바꾸시겠습니까?`)) return;

    setIsSaving(true);
    try {
      let saved = record;
      if (changed.length > 0) {
        const set = Object.fromEntries(changed.map(f => [f, PRICE_FIELDS.includes(f) ? Number(form[f] || 0) : String(form[f] ?? '')]));
        const { status, body } = await updateChemical(record, set, userTag);
        if (status === 409) {
          alert('다른 곳에서 먼저 고쳤습니다. 최신 내용을 다시 불러왔으니 확인하고 다시 고치세요.');
          applyRecord(body.current);
          return;
        }
        if (status !== 200) {
          alert(`저장하지 못했습니다: ${body?.message || status}`);
          return;
        }
        saved = body;
      }
      if (classChanged.length > 0) {
        // 분류는 수정 API가 받지 않아 웹 전용 저장(전체 덮어쓰기)으로 — 방금 받은 최신 레코드에 분류만 바꿔서
        saved = { ...saved, infoL2: form.infoL2, infoL1: form.infoL1, updatedAt: new Date().toISOString(), updatedBy: userTag };
        if (!(await onSaveClass(saved))) {
          alert('분류를 저장하지 못했습니다.');
          return;
        }
      }
      applyRecord(saved);
      onClose();
    } catch (err) {
      console.error('Failed to update chemical:', err);
      alert(`저장 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const changeAliases = async (change) => {
    setIsSaving(true);
    try {
      let { status, body } = await updateChemicalAliases(record.dsids, change, userTag);
      if (status === 409 && body.reason === 'aliasTaken') {
        const list = body.taken.map(t => `'${t.alias}' → ${t.name} (${t.dsids})`).join('\n');
        if (!window.confirm(`다른 약품이 같은 이름을 쓰고 있습니다.\n${list}\n\n그래도 이 약품 별칭으로 저장하시겠습니까?`)) return;
        ({ status, body } = await updateChemicalAliases(record.dsids, { ...change, force: true }, userTag));
      }
      if (status !== 200) {
        alert(`별칭을 저장하지 못했습니다: ${body?.message || status}`);
        return;
      }
      applyRecord(body, { resetForm: changed.length === 0 && classChanged.length === 0 });
      setNewAlias('');
    } catch (err) {
      console.error('Failed to update chemical aliases:', err);
      alert(`별칭 저장 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const select = (field, options) => (
    <div className="form-control">
      <label className="label"><span className="label-text">{LABELS[field]}</span></label>
      <select className="select select-bordered select-sm" value={form[field] ?? ''} onChange={(e) => handleChange(field, e.target.value)}>
        {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
  );
  const optionsOf = (field) => filterOptions[field].filter(o => o !== 'all').map(o => [o, o]);
  const useOptions = [['Y', '사용'], ['N', '미사용']];
  const aliasList = record.aliases || [];

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-3xl">
        <h3 className="font-bold text-lg mb-1">약품 정보 수정 — {record.dsids}</h3>
        <p className="text-xs text-gray-500 mb-3">
          마지막 수정 {record.updatedAt ? new Date(record.updatedAt).toLocaleString('ko-KR') : '-'}
          {record.updatedBy && ` · ${record.updatedBy}`}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            {select('infoL3', optionsOf('infoL3'))}
            {select('infoL2', optionsOf('infoL2'))}
            {select('infoL1', optionsOf('infoL1'))}
            <div className="form-control col-span-2">
              <label className="label"><span className="label-text">제품명</span></label>
              <TextInput value={form.name} onChange={(value) => handleChange('name', value)} className="input input-bordered input-sm" />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">용량</span></label>
              <UnitInput value={form.unit} onChange={(value) => handleChange('unit', value)}
                className="input input-bordered input-sm" classNameUnit="select select-bordered select-sm" />
            </div>
            {PRICE_FIELDS.map(f => (
              <div className="form-control" key={f}>
                <label className="label"><span className="label-text">{LABELS[f]}</span></label>
                <NumberInput value={form[f]} onChange={(value) => handleChange(f, value)} className="input input-bordered input-sm" />
              </div>
            ))}
            {select('active', useOptions)}
            {select('flgWork', useOptions)}
            {select('flgOut', useOptions)}
          </div>
          {classChanged.length > 0 && (
            <p className="text-xs text-warning mt-1">대분류·중분류 변경은 코드 체계와 맞지 않을 수 있어 저장할 때 한 번 더 확인합니다.</p>
          )}

          <div className="divider my-2">별칭 (현장에서 부르는 이름 등)</div>
          <div className="flex flex-wrap gap-2 mb-2 max-h-24 overflow-y-auto">
            {aliasList.length === 0 && <span className="text-sm text-gray-400">별칭 없음</span>}
            {aliasList.map(a => (
              <span key={a} className="badge badge-ghost gap-1">
                {a}
                <button type="button" className="text-xs" disabled={isSaving}
                  onClick={() => window.confirm(`별칭 '${a}'을 빼시겠습니까?`) && changeAliases({ remove: [a] })}>
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input input-bordered input-sm flex-1" placeholder="새 별칭 (예: 데브리놀)" value={newAlias} maxLength={40}
              onChange={(e) => setNewAlias(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newAlias.trim()) changeAliases({ add: [newAlias.trim()] }); } }} />
            <button type="button" className="btn btn-sm" disabled={isSaving || !newAlias.trim()}
              onClick={() => changeAliases({ add: [newAlias.trim()] })}>
              별칭 추가
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">별칭은 바로 저장됩니다.</p>

          <details className="mt-3">
            <summary className="text-sm cursor-pointer">변경 이력 ({history.length})</summary>
            <ul className="text-xs mt-2 space-y-1 max-h-40 overflow-y-auto">
              {history.map(h => (
                <li key={h.at + h.action}>
                  <span className="text-gray-500">{new Date(h.at).toLocaleString('ko-KR')} · {h.by} · {h.action === 'alias' ? '별칭' : '정보 수정'}</span>
                  {' — '}
                  {Object.entries(h.changes || {}).map(([f, [from, to]]) => (
                    <span key={f} className="mr-2">
                      {LABELS[f] || f}: {Array.isArray(from) ? from.join(', ') : String(from ?? '') || '-'} → {Array.isArray(to) ? to.join(', ') : String(to ?? '') || '-'}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </details>

          <div className="modal-action">
            <button type="button" className="btn" onClick={onClose} disabled={isSaving}>닫기</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving || (changed.length === 0 && classChanged.length === 0)}>
              {isSaving ? '저장 중...' : `저장${changed.length + classChanged.length ? ` (${changed.length + classChanged.length})` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
