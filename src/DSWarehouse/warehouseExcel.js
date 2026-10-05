import * as XLSX from 'xlsx';
import { downloadExcel } from '../utils/excelExport';

/**
 * 이카운트 창고등록 엑셀(ESA005M.xlsx) 파싱 + 창고 DB(dswarehouses) 비교.
 * 약품(warehouse)과 방제 기본정보(warehouse, outwarehouse)는 창고를 **창고명**으로 가리킨다.
 * 그래서 이름이 바뀌는 변경은 따로 경고한다.
 */

// 엑셀에서 가져오는 필드 (변경 감지 대상). memo 는 DB에서 관리
export const ECOUNT_FIELDS = ['name', 'whType', 'process', 'outCust', 'site', 'active'];

export const FIELD_LABELS = {
  whcd: '창고코드',
  name: '창고명',
  whType: '구분',
  process: '생산공정명',
  outCust: '외주거래처명',
  site: '추가사업장명',
  active: '사용',
  memo: '메모',
};

export const WAREHOUSE_TYPES = ['창고', '공장', '외주'];

const COLUMNS = {
  code: '창고코드',
  name: '창고명',
  whType: '구분',
  process: '생산공정명',
  outCust: '외주거래처명',
  use: '사용',
  site: '추가사업장명',
};

const clean = (value) => String(value ?? '').trim();

/**
 * 엑셀 → 창고 목록.
 * @returns {{ warehouses: object[], allCodes: object, warnings: string[], exportedAt: string }}
 */
export const parseWarehouseExcel = (arrayBuffer) => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: '' });

  const headerIndex = rows.findIndex(row => row.includes(COLUMNS.code) && row.includes(COLUMNS.name));
  if (headerIndex < 0) {
    throw new Error("'창고코드', '창고명' 열을 찾지 못했습니다. 이카운트 창고등록 엑셀(ESA005M)인지 확인하세요.");
  }
  const header = rows[headerIndex].map(clean);
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([key, label]) => [key, header.indexOf(label)]));
  const get = (row, key) => (col[key] >= 0 ? clean(row[col[key]]) : '');

  const warnings = [];
  const byCode = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const whcd = get(row, 'code');
    const name = get(row, 'name');
    if (!whcd || !name) continue;     // 마지막 줄(내보낸 시각) 등
    if (byCode.has(whcd)) {
      warnings.push(`중복 창고코드 ${whcd} (${name}) — 첫 행만 사용`);
      continue;
    }
    byCode.set(whcd, {
      whcd,
      name,
      whType: get(row, 'whType') || '창고',
      process: get(row, 'process'),
      outCust: get(row, 'outCust'),
      site: get(row, 'site'),
      active: get(row, 'use').toLowerCase() === 'yes' ? 'Y' : 'N',
    });
  }

  const lastRow = rows[rows.length - 1] || [];
  const exportedAt = get(lastRow, 'name') === '' ? clean(lastRow[0]) : '';
  const warehouses = [...byCode.values()];
  const allCodes = Object.fromEntries(warehouses.map(w => [w.whcd, w.name]));
  return { warehouses, allCodes, warnings, exportedAt };
};

const same = (a, b) => clean(a) === clean(b);

/**
 * 엑셀 창고 vs DB 창고.
 * @returns {{ added: object[], changed: {before, after, fields}[], unchanged: number, dbOnly: object[] }}
 */
export const compareWarehouses = (excelWarehouses, dbWarehouses) => {
  const dbMap = new Map(dbWarehouses.map(w => [w.whcd, w]));
  const added = [];
  const changed = [];
  let unchanged = 0;
  for (const after of excelWarehouses) {
    const before = dbMap.get(after.whcd);
    if (!before) {
      added.push(after);
      continue;
    }
    const fields = ECOUNT_FIELDS.filter(f => !same(before[f], after[f]));
    if (fields.length > 0) changed.push({ before, after, fields });
    else unchanged += 1;
  }
  const excelCodes = new Set(excelWarehouses.map(w => w.whcd));
  const dbOnly = dbWarehouses.filter(w => !excelCodes.has(w.whcd) && w.origin !== 'local');
  return { added, changed, unchanged, dbOnly };
};

export const toNewWarehouse = (excelWarehouse) => {
  const now = new Date().toISOString();
  return { ...excelWarehouse, memo: '', origin: 'ecount', createdAt: now, updatedAt: now };
};

// 엑셀 필드만 갱신, memo·origin 등 DB 관리 필드는 유지
export const toUpdatedWarehouse = (dbWarehouse, excelWarehouse) => ({
  ...dbWarehouse,
  ...Object.fromEntries(ECOUNT_FIELDS.map(f => [f, excelWarehouse[f]])),
  updatedAt: new Date().toISOString(),
});

// 이름 변경 시 이전 이름을 쓰는 약품 수 (약품.warehouse 는 "본사창고,용역 코리아" 처럼 여러 개일 수 있음)
export const countChemicalsUsingName = (chemicals, name) =>
  chemicals.filter(c => String(c.warehouse || '').split(',').map(clean).includes(clean(name))).length;

// ---- 여기서 만든 창고(origin=local) → 이카운트 동기화 (거래처와 같은 규칙) ----

export const findLocalWarehouseStatus = (allCodes, warehouses) => {
  const pending = warehouses.filter(w => w.origin === 'local' && !w.ecountSyncedAt);
  const inEcount = pending.filter(w => w.whcd in allCodes);
  return {
    unsynced: pending.filter(w => !(w.whcd in allCodes)),
    confirmed: inEcount.filter(w => same(w.name, allCodes[w.whcd])),
    conflicts: inEcount
      .filter(w => !same(w.name, allCodes[w.whcd]))
      .map(w => ({ warehouse: w, ecountName: allCodes[w.whcd] })),
  };
};

// 이카운트 창고등록 엑셀(ESA005M)과 같은 열. TODO: 이카운트 '엑셀 업로드' 양식을 받으면 맞출 것
export const downloadWarehousesForEcount = (warehouses) => downloadExcel(warehouses, [
  { header: '창고코드', value: w => w.whcd },
  { header: '창고명', value: w => w.name },
  { header: '구분', value: w => w.whType || '창고' },
  { header: '생산공정명', value: w => w.process },
  { header: '외주거래처명', value: w => w.outCust },
  { header: '사용', value: w => (w.active === 'N' ? 'No' : 'Yes') },
  { header: '추가사업장명', value: w => w.site },
], '이카운트_창고등록_미등록', '창고리스트');

// 신규 추가 화면의 코드 제안: 숫자 3자리 코드 중 가장 큰 값 + 1 (예: 513 → 514). 확정은 서버(중복 시 409)
export const suggestWarehouseCode = (warehouses) => {
  const numbers = warehouses.map(w => w.whcd).filter(c => /^\d{3}$/.test(c)).map(Number);
  return numbers.length ? String(Math.max(...numbers) + 1) : '';
};
