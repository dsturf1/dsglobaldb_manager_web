import * as XLSX from 'xlsx';
import { downloadExcel } from '../utils/excelExport';

/**
 * 약품 목록 엑셀 내려받기 → 엑셀에서 고치기 → 올려서 일괄 수정.
 * - 열은 화면 목록과 같다(No. · 작업 제외). 마지막 '마지막 수정' 열로 내려받은 뒤 다른 곳에서 고친 약품을 걸러낸다
 * - 코드로 약품을 찾고, 바뀐 칸만 수정 API(/dschemical/update)로 보낸다. 새 코드(추가)·삭제는 하지 않는다
 * - 대분류·중분류는 수정 API가 받지 않아 웹 전용 저장(전체 덮어쓰기)으로 따로 저장한다
 */
export const PRICE_FIELDS = ['IN_PRICE', 'OUT_PRICE', 'OUT_PRICE1'];
export const UPDATE_FIELDS = ['infoL3', 'name', 'unit', ...PRICE_FIELDS, 'active', 'flgWork', 'flgOut'];
export const CLASS_FIELDS = ['infoL2', 'infoL1'];
const FLAG_FIELDS = ['active', 'flgWork', 'flgOut'];

const UPDATED_AT_HEADER = '마지막 수정(고치지 마세요)';
const COLUMNS = [
  { field: 'infoL3', header: '중요도' },
  { field: 'infoL2', header: '대분류' },
  { field: 'infoL1', header: '중분류' },
  { field: 'dsids', header: '코드' },
  { field: 'name', header: '제품명' },
  { field: 'unit', header: '용량' },
  { field: 'IN_PRICE', header: '구입가' },
  { field: 'OUT_PRICE', header: '용역판가' },
  { field: 'OUT_PRICE1', header: '판가' },
  { field: 'active', header: 'Active' },
  { field: 'flgWork', header: '방제팀' },
  { field: 'flgOut', header: '용역팀' },
  { field: 'updatedAt', header: UPDATED_AT_HEADER },
];
export const FIELD_LABELS = Object.fromEntries(COLUMNS.map(c => [c.field, c.header]));

const flagText = (v) => (v === 'Y' ? '사용' : '미사용');

// 화면에 보이는 순서·필터 그대로 내려받는다
export const downloadChemicalList = (chemicals) => downloadExcel(chemicals, COLUMNS.map(({ field, header }) => ({
  header,
  value: c => (FLAG_FIELDS.includes(field) ? flagText(c[field]) : PRICE_FIELDS.includes(field) ? Number(c[field] || 0) : c[field] ?? ''),
})), '약품목록', '약품');

// '1,500' '1500원' 처럼 써도 된다. 빈 칸은 0
const parsePrice = (v) => {
  const n = Number(String(v ?? '').replace(/[,\s원]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const parseFlag = (v) => {
  const s = String(v ?? '').trim().toUpperCase();
  if (['Y', '사용', 'YES', 'O'].includes(s)) return 'Y';
  if (['N', '미사용', 'NO', 'X'].includes(s)) return 'N';
  return null;
};

const same = (field, a, b) => (PRICE_FIELDS.includes(field)
  ? Number(a || 0) === Number(b || 0)
  : String(a ?? '').trim() === String(b ?? '').trim());

/**
 * 올린 엑셀을 지금 약품 목록과 비교한다.
 * @returns {{ changes: {chemical, set, classSet, stale}[], errors: {row, code, message}[], unchanged: number }}
 *   set: 수정 API로 보낼 필드, classSet: 대분류·중분류 변경, stale: 내려받은 뒤 다른 곳에서 고침
 */
export const compareChemicalExcel = (arrayBuffer, chemicals) => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: '' });
  const headerIndex = rows.findIndex(r => r.some(cell => String(cell).trim() === '코드'));
  if (headerIndex < 0) throw new Error("'코드' 열을 찾지 못했습니다. 약품 목록에서 내려받은 엑셀을 고쳐서 올려 주세요.");

  const header = rows[headerIndex].map(h => String(h).trim());
  const colOf = Object.fromEntries(COLUMNS.map(c => [c.field, header.indexOf(c.header)]));
  const byCode = new Map(chemicals.map(c => [c.dsids, c]));

  const changes = [];
  const errors = [];
  let unchanged = 0;
  const seen = new Set();

  rows.slice(headerIndex + 1).forEach((row, i) => {
    const rowNo = headerIndex + i + 2;
    const code = String(row[colOf.dsids] ?? '').trim();
    if (!code) return;                                     // 빈 줄
    const chemical = byCode.get(code);
    if (seen.has(code)) {
      errors.push({ row: rowNo, code, message: '같은 코드가 위에 이미 있습니다 (앞 줄만 씀)' });
      return;
    }
    seen.add(code);
    if (!chemical) {
      errors.push({ row: rowNo, code, message: '없는 코드입니다 (새 약품은 [신규 추가]로)' });
      return;
    }

    const read = (field) => (colOf[field] < 0 ? undefined : row[colOf[field]]);
    const set = {};
    const classSet = {};
    const problems = [];
    for (const field of [...UPDATE_FIELDS, ...CLASS_FIELDS]) {
      const raw = read(field);
      if (raw === undefined) continue;                     // 열을 지웠으면 그 필드는 건드리지 않는다
      let value;
      if (PRICE_FIELDS.includes(field)) {
        value = parsePrice(raw);
        if (Number.isNaN(value) || value < 0) { problems.push(`${FIELD_LABELS[field]} '${raw}'는 숫자가 아닙니다`); continue; }
      } else if (FLAG_FIELDS.includes(field)) {
        value = parseFlag(raw);
        if (!value) { problems.push(`${FIELD_LABELS[field]} '${raw}'는 사용/미사용이 아닙니다`); continue; }
      } else {
        value = String(raw ?? '').trim();
        if (field === 'name' && !value) { problems.push('제품명이 비어 있습니다'); continue; }
      }
      if (same(field, value, chemical[field])) continue;
      if (CLASS_FIELDS.includes(field)) classSet[field] = value;
      else set[field] = value;
    }
    if (problems.length > 0) {
      errors.push({ row: rowNo, code, message: problems.join(', ') });
      return;
    }
    if (Object.keys(set).length === 0 && Object.keys(classSet).length === 0) {
      unchanged += 1;
      return;
    }
    const fileUpdatedAt = read('updatedAt');
    const stale = fileUpdatedAt !== undefined && String(fileUpdatedAt).trim() !== String(chemical.updatedAt ?? '').trim();
    changes.push({ chemical, set, classSet, stale });
  });

  return { changes, errors, unchanged };
};
