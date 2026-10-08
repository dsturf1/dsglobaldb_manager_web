import * as XLSX from 'xlsx';
import { downloadExcel } from '../utils/excelExport';

/**
 * 이카운트 거래처등록 엑셀(ESA001M.xlsx) 파싱 + 거래처 DB(dscustomers) 비교.
 *
 * - '거래처코드동일' 행만 거래처로 쓴다 (거래처코드 = 세무신고거래처코드)
 * - '검색입력' 행은 별칭: 세무신고거래처코드가 가리키는 거래처의 aliases 에 붙인다
 * - 13자리 숫자 코드(개인 주민등록번호로 보임)는 마스킹한 값을 키로 쓴다 (원본은 저장하지 않음)
 */

// 엑셀에서 가져오는 필드 (변경 감지 대상). 나머지(category, active, memo)는 DB에서 관리
export const ECOUNT_FIELDS = ['name', 'ceo', 'bizType', 'bizItem', 'tel', 'email', 'aliases'];

export const FIELD_LABELS = {
  custcd: '거래처코드',
  name: '거래처명',
  ceo: '대표자',
  bizType: '업태',
  bizItem: '종목',
  tel: '전화',
  email: 'Email',
  aliases: '별칭',
  category: '분류',
  active: '사용',
  memo: '메모',
};

export const CUSTOMER_CATEGORIES = ['골프장', '매입처', '매출처', '잔디농장', '기타'];

const COLUMNS = {
  code: '거래처코드',
  type: '세무신고거래처구분',
  taxCode: '세무신고거래처코드',
  name: '거래처명',
  ceo: '대표자명',
  bizType: '업태',
  bizItem: '종목',
  tel: '전화',
  email: 'Email',
};

// 주민등록번호(13자리)는 앞 6자리 + 성별 1자리만 남긴다
export const maskCode = (code) => {
  const raw = String(code ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 13 && /^[\d-]+$/.test(raw)) {
    return `${digits.slice(0, 6)}-${digits[6]}******`;
  }
  return raw;
};

const clean = (value) => String(value ?? '').trim();

/**
 * 엑셀 → 거래처 목록.
 * @returns {{ customers: object[], warnings: string[], exportedAt: string }}
 */
export const parseCustomerExcel = (arrayBuffer) => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  const headerIndex = rows.findIndex(row => row.includes(COLUMNS.code) && row.includes(COLUMNS.type));
  if (headerIndex < 0) {
    throw new Error("'거래처코드', '세무신고거래처구분' 열을 찾지 못했습니다. 이카운트 거래처등록 엑셀(ESA001M)인지 확인하세요.");
  }
  const header = rows[headerIndex].map(clean);
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([key, label]) => [key, header.indexOf(label)]));
  const get = (row, key) => (col[key] >= 0 ? clean(row[col[key]]) : '');

  const warnings = [];
  const byCode = new Map();
  const aliasRows = [];
  const allCodes = {};   // 이카운트의 모든 거래처코드(별칭 포함) → 거래처명 (미등록·코드충돌 확인용)

  for (const row of rows.slice(headerIndex + 1)) {
    const type = get(row, 'type');
    if (type && get(row, 'code')) allCodes[maskCode(get(row, 'code'))] = get(row, 'name');
    if (type === '거래처코드동일') {
      const custcd = maskCode(get(row, 'code'));
      if (!custcd) continue;
      if (byCode.has(custcd)) {
        warnings.push(`중복 코드 ${custcd} (${get(row, 'name')}) — 첫 행만 사용`);
        continue;
      }
      byCode.set(custcd, {
        custcd,
        name: get(row, 'name'),
        ceo: get(row, 'ceo'),
        bizType: get(row, 'bizType'),
        bizItem: get(row, 'bizItem'),
        tel: get(row, 'tel'),
        email: get(row, 'email'),
        aliases: [],
      });
    } else if (type === '검색입력') {
      aliasRows.push({ code: get(row, 'code'), name: get(row, 'name'), target: maskCode(get(row, 'taxCode')) });
    }
  }

  for (const alias of aliasRows) {
    const customer = byCode.get(alias.target);
    if (customer) {
      customer.aliases.push({ code: alias.code, name: alias.name });
    } else {
      warnings.push(`별칭 ${alias.code} ${alias.name} — 대상 거래처(${alias.target})가 없어 건너뜀`);
    }
  }
  for (const customer of byCode.values()) {
    customer.aliases.sort((a, b) => a.code.localeCompare(b.code));
  }

  // 마지막 행: 내보낸 시각 (예: "2026/10/01  오후 2:22:31")
  const lastRow = rows[rows.length - 1] || [];
  const exportedAt = get(lastRow, 'type') === '' ? clean(lastRow[0]) : '';

  return { customers: [...byCode.values()], allCodes, warnings, exportedAt };
};

const sameValue = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
const normalizeAliases = (aliases) => (Array.isArray(aliases) ? aliases : []);

// 이카운트 '검색입력'에서 온 별칭만, {code, name} 순서로 (DB 에서 읽으면 키 순서가 달라짐).
// 여기서 붙인 현장 별칭(source: 'local', /dscustomer/alias)은 엑셀 비교에서 건드리지 않는다
const ecountAliases = (aliases) =>
  normalizeAliases(aliases).filter(a => a.source !== 'local').map(a => ({ code: a.code || '', name: a.name }));
const localAliases = (aliases) => normalizeAliases(aliases).filter(a => a.source === 'local');

/**
 * 엑셀 거래처 vs DB 거래처.
 * ecountDirtyFields(여기서 고쳐서 이카운트에도 고쳐야 하는 항목)는 '변경'으로 되돌리지 않고 따로 나눈다.
 * @returns {{ added, changed: {before, after, fields}[], unchanged, dbOnly,
 *             dirtyPending: {before, after, fields}[]  여기서 고쳤는데 이카운트는 아직 다름,
 *             dirtyResolved: object[]                  이카운트도 같아짐 → 반영 완료로 표시할 수 있음 }}
 */
export const compareCustomers = (excelCustomers, dbCustomers) => {
  const dbMap = new Map(dbCustomers.map(c => [c.custcd, c]));
  const added = [];
  const changed = [];
  const dirtyPending = [];
  const dirtyResolved = [];
  let unchanged = 0;

  for (const after of excelCustomers) {
    const before = dbMap.get(after.custcd);
    if (!before) {
      added.push(after);
      continue;
    }
    const dirty = new Set(before.ecountDirtyFields || []);
    const differing = ECOUNT_FIELDS.filter(f =>
      f === 'aliases'
        ? !sameValue(ecountAliases(before.aliases), after.aliases)
        : !sameValue(before[f], after[f])
    );
    const fields = differing.filter(f => !dirty.has(f));
    const pending = differing.filter(f => dirty.has(f));
    if (fields.length > 0) changed.push({ before, after, fields });
    if (pending.length > 0) dirtyPending.push({ before, after, fields: pending });
    else if (dirty.size > 0) dirtyResolved.push(before);
    if (fields.length === 0 && pending.length === 0) unchanged += 1;
  }

  // 여기서 만든 거래처(origin=local)는 '이카운트 미등록'에서 따로 보여준다
  const excelCodes = new Set(excelCustomers.map(c => c.custcd));
  const dbOnly = dbCustomers.filter(c => !excelCodes.has(c.custcd) && c.origin !== 'local');
  return { added, changed, unchanged, dbOnly, dirtyPending, dirtyResolved };
};

// 분류 초기값 추정 (추가 후 화면에서 수정)
export const guessCategory = (customer) => {
  const text = `${customer.name} ${customer.bizType} ${customer.bizItem}`;
  return /골프장|컨트리|골프클럽|골프앤|C\.?C\b|G\.?C\b/i.test(text) ? '골프장' : '기타';
};

export const toNewCustomer = (excelCustomer) => ({
  ...excelCustomer,
  category: guessCategory(excelCustomer),
  active: 'Y',
  memo: '',
  origin: 'ecount',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// 엑셀 필드만 갱신. DB 관리 필드(category, active, memo), 여기서 고친 항목(ecountDirtyFields),
// 여기서 붙인 현장 별칭(source: 'local')은 유지
export const toUpdatedCustomer = (dbCustomer, excelCustomer) => {
  const dirty = new Set(dbCustomer.ecountDirtyFields || []);
  const updated = { ...dbCustomer, updatedAt: new Date().toISOString(), updatedBy: 'web:엑셀비교' };
  ECOUNT_FIELDS.filter(f => !dirty.has(f)).forEach(f => {
    updated[f] = f === 'aliases' ? [...excelCustomer.aliases, ...localAliases(dbCustomer.aliases)] : excelCustomer[f];
  });
  return updated;
};

// 이카운트에도 같게 고쳐진 것을 확인한 거래처 → ecountDirtyFields 지움
export const toDirtyResolved = (dbCustomer) => {
  const { ecountDirtyFields, ...rest } = dbCustomer;   // eslint-disable-line no-unused-vars
  return { ...rest, updatedAt: new Date().toISOString(), updatedBy: 'web:엑셀비교' };
};

export const formatAliases = (aliases) =>
  normalizeAliases(aliases).map(a => (a.code ? `${a.code} ${a.name}` : a.name)).join(', ');

// ---- 여기서 만든 거래처(origin=local) → 이카운트 동기화 ----

export const CUSTOMER_TYPES = { corp: '법인', person: '개인' };

// 사업자등록번호 10자리 검증 (국세청 검증번호 규칙)
export const isValidBizNo = (bizNo) => {
  const d = String(bizNo).replace(/\D/g, '');
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = w.reduce((acc, weight, i) => acc + Number(d[i]) * weight, 0);
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
};

// 개인 거래처 코드: P00001, P00002 ... (주민등록번호는 받지 않음)
export const nextPersonCode = (customers) => {
  const max = customers
    .map(c => /^P(\d{5})$/.exec(c.custcd))
    .filter(Boolean)
    .reduce((acc, m) => Math.max(acc, Number(m[1])), 0);
  return `P${String(max + 1).padStart(5, '0')}`;
};

const sameName = (a, b) => (a || '').replace(/\s/g, '') === (b || '').replace(/\s/g, '');

/**
 * 여기서 만든 거래처 중 이카운트 등록 확인(ecountSyncedAt)이 아직 없는 것을
 * - unsynced: 이카운트에 아직 없는 것 (엑셀로 내려받아 이카운트에 등록)
 * - confirmed: 같은 코드·같은 이름으로 이카운트에 있는 것 (등록 확인 → ecountSyncedAt 기록)
 * - conflicts: 같은 코드가 이카운트에 다른 이름으로 있는 것
 * 로 나눈다. ecountSyncedAt 이 있는 거래처는 예전 엑셀로 비교해도 다시 나오지 않는다.
 */
export const findLocalCustomerStatus = (allCodes, customers) => {
  const pending = customers.filter(c => c.origin === 'local' && !c.ecountSyncedAt);
  const inEcount = pending.filter(c => c.custcd in allCodes);
  return {
    unsynced: pending.filter(c => !(c.custcd in allCodes)),
    confirmed: inEcount.filter(c => sameName(c.name, allCodes[c.custcd])),
    conflicts: inEcount
      .filter(c => !sameName(c.name, allCodes[c.custcd]))
      .map(c => ({ customer: c, ecountName: allCodes[c.custcd] })),
  };
};

// 이카운트 거래처등록 엑셀(ESA001M)과 같은 열 이름. TODO: 이카운트 '엑셀 업로드' 양식을 받으면 맞출 것
export const downloadCustomersForEcount = (customers) => downloadExcel(customers, [
  { header: '거래처코드', value: c => c.custcd },
  { header: 'Email', value: c => c.email },
  { header: '세무신고거래처구분', value: () => '거래처코드동일' },
  { header: '세무신고거래처코드', value: c => c.custcd },
  { header: '세무신고거래처명', value: c => c.name },
  { header: '거래처명', value: c => c.name },
  { header: '대표자명', value: c => c.ceo },
  { header: '업태', value: c => c.bizType },
  { header: '종목', value: c => c.bizItem },
  { header: '전화', value: c => c.tel },
  { header: '사용구분', value: () => 'YES' },
  { header: '구분(참고)', value: c => CUSTOMER_TYPES[c.custType] || '' },
], '이카운트_거래처등록_미등록', '거래처등록');
