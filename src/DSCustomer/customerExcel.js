import * as XLSX from 'xlsx';

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

export const CUSTOMER_CATEGORIES = ['골프장', '매입처', '매출처', '기타'];

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

  for (const row of rows.slice(headerIndex + 1)) {
    const type = get(row, 'type');
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

  return { customers: [...byCode.values()], warnings, exportedAt };
};

const sameValue = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
const normalizeAliases = (aliases) => (Array.isArray(aliases) ? aliases : []);

/**
 * 엑셀 거래처 vs DB 거래처.
 * @returns {{ added: object[], changed: {before, after, fields}[], unchanged: number, dbOnly: object[] }}
 */
export const compareCustomers = (excelCustomers, dbCustomers) => {
  const dbMap = new Map(dbCustomers.map(c => [c.custcd, c]));
  const added = [];
  const changed = [];
  let unchanged = 0;

  for (const after of excelCustomers) {
    const before = dbMap.get(after.custcd);
    if (!before) {
      added.push(after);
      continue;
    }
    const fields = ECOUNT_FIELDS.filter(f =>
      f === 'aliases'
        ? !sameValue(normalizeAliases(before.aliases), after.aliases)
        : !sameValue(before[f], after[f])
    );
    if (fields.length > 0) changed.push({ before, after, fields });
    else unchanged += 1;
  }

  const excelCodes = new Set(excelCustomers.map(c => c.custcd));
  const dbOnly = dbCustomers.filter(c => !excelCodes.has(c.custcd));
  return { added, changed, unchanged, dbOnly };
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
  updatedAt: new Date().toISOString(),
});

// 엑셀 필드만 갱신, DB 관리 필드(category, active, memo)는 유지
export const toUpdatedCustomer = (dbCustomer, excelCustomer) => ({
  ...dbCustomer,
  ...Object.fromEntries(ECOUNT_FIELDS.map(f => [f, excelCustomer[f]])),
  updatedAt: new Date().toISOString(),
});

export const formatAliases = (aliases) =>
  normalizeAliases(aliases).map(a => `${a.code} ${a.name}`).join(', ');
