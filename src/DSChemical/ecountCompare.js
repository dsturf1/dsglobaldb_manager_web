import axios from 'axios';
import * as XLSX from 'xlsx';
import { downloadExcel } from '../utils/excelExport';

/**
 * 이카운트 품목과 약품(dschemicals) 비교. 이카운트 데이터는 두 가지 방법으로 읽는다.
 * - 엑셀: 이카운트 품목등록에서 내려받은 ESA009M.xlsx 를 브라우저에서 바로 읽음
 * - 서버: AWS/Ecount/fetch_products.py 가 s3://dsbaseinfo/ecount/ 에 올린 요약 파일을
 *         Lambda dsecountProducts (GET /ecountproducts) 로 읽음
 * 약품 코드(dsids)와 이카운트 품목코드(PROD_CD)는 같은 체계. A·B·C·G 로 시작하는 코드만 약품으로 본다.
 */

const ECOUNT_PRODUCTS_URL = 'https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev/ecountproducts';

// 코드 접두어 → 대분류/중분류 (AddChemicalDialog 의 코드 규칙과 동일)
export const ECOUNT_PREFIX_CLASS = {
  A1: { infoL2: '농약', infoL1: '살균제' },
  A2: { infoL2: '농약', infoL1: '살충제' },
  A3: { infoL2: '농약', infoL1: '제초제' },
  B0: { infoL2: '비료', infoL1: '비료' },
  C0: { infoL2: '기타약재', infoL1: '기타약재' },
  G0: { infoL2: '잔디', infoL1: '잔디' },
};

// 위에 없는 접두어(B5, G5 등)는 첫 글자로 분류. 기타물품(D)·S로 시작하는 중복 코드 등은 약품 아님
const LETTER_CLASS = {
  A: { infoL2: '농약', infoL1: '농약' },
  B: { infoL2: '비료', infoL1: '비료' },
  C: { infoL2: '기타약재', infoL1: '기타약재' },
  G: { infoL2: '잔디', infoL1: '잔디' },
};

export const classifyCode = (code) => ECOUNT_PREFIX_CLASS[code.slice(0, 2)] || LETTER_CLASS[code.charAt(0)];

// 이카운트 품목구분 코드
const PROD_TYPE_NAME = { 0: '원재료', 1: '제품', 2: '반제품', 3: '상품', 4: '부재료', 7: '무형상품' };
const PROD_TYPE_CODE = Object.fromEntries(Object.entries(PROD_TYPE_NAME).map(([code, name]) => [name, code]));

export const fetchEcountProducts = async () => {
  const response = await axios.get(ECOUNT_PRODUCTS_URL);
  // Lambda 응답은 HTTP 200 + { statusCode, body(JSON 문자열) }
  const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  const body = typeof res_.body === 'string' ? JSON.parse(res_.body) : res_.body;
  if (res_.statusCode !== 200) {
    throw new Error(body?.message || `이카운트 품목을 읽지 못했습니다 (status ${res_.statusCode})`);
  }
  return {
    items: body.items,
    allCodes: body.all_codes || Object.fromEntries(body.items.map(i => [i.PROD_CD, i.PROD_DES])),
    sourceLabel: `서버 데이터 (${new Date(body.fetched_at).toLocaleString('ko-KR')})`,
  };
};

const EXCEL_COLUMNS = {
  code: '품목코드',
  name: '품목명',
  size: '규격정보',
  type: '품목구분',
  inPrice: '입고단가',
  use: '사용',
};

/**
 * 이카운트 품목등록 엑셀(ESA009M.xlsx) → fetchEcountProducts 와 같은 형태.
 * 약품 코드(A·B·C·G) 품목 중 사용=YES 만 남긴다.
 */
export const parseEcountProductExcel = (arrayBuffer, fileName) => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: '' });

  const headerIndex = rows.findIndex(row => row.includes(EXCEL_COLUMNS.code) && row.includes(EXCEL_COLUMNS.name));
  if (headerIndex < 0) {
    throw new Error("'품목코드', '품목명' 열을 찾지 못했습니다. 이카운트 품목등록 엑셀(ESA009M)인지 확인하세요.");
  }
  const header = rows[headerIndex].map(v => String(v).trim());
  const col = Object.fromEntries(Object.entries(EXCEL_COLUMNS).map(([key, label]) => [key, header.indexOf(label)]));
  const get = (row, key) => (col[key] >= 0 ? String(row[col[key]] ?? '').trim() : '');

  const items = [];
  const allCodes = {};   // 이카운트의 모든 품목코드 → 품목명 (미등록·코드충돌 확인용)
  let unused = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const code = get(row, 'code');
    if (!code) continue;
    allCodes[code] = get(row, 'name');
    if (!classifyCode(code)) continue;
    if (col.use >= 0 && get(row, 'use') !== 'YES') {
      unused += 1;
      continue;
    }
    items.push({
      PROD_CD: code,
      PROD_DES: get(row, 'name'),
      SIZE_DES: get(row, 'size'),
      PROD_TYPE: PROD_TYPE_CODE[get(row, 'type').replace(/[[\]]/g, '')] ?? '',
      IN_PRICE: Number(get(row, 'inPrice').replace(/,/g, '')) || 0,
    });
  }

  // 마지막 행: 내보낸 시각 (예: "2026/10/01  오후 3:58:54")
  const lastRow = rows[rows.length - 1] || [];
  const exportedAt = get(lastRow, 'code') === '' ? String(lastRow[0] ?? '').trim() : '';
  const label = `엑셀 ${fileName}${exportedAt ? ` (${exportedAt})` : ''}`;
  return { items, allCodes, sourceLabel: unused > 0 ? `${label} · 사용 안 함 ${unused}건 제외` : label };
};

// 이카운트에는 있고 약품 DB에는 없는 품목
export const findNewEcountProducts = (ecountItems, chemicals) => {
  const existing = new Set(chemicals.map(c => c.dsids));
  return ecountItems.filter(item =>
    classifyCode(item.PROD_CD) && !existing.has(item.PROD_CD)
  );
};

// 이카운트 품목 → 약품 레코드 (기존 DB 항목과 같은 필드 구성, 판가는 DB에서 입력)
export const ecountToChemical = (item) => {
  const typeName = PROD_TYPE_NAME[item.PROD_TYPE];
  return {
    dsids: item.PROD_CD,
    name: item.PROD_DES.trim(),
    unit: item.SIZE_DES.trim(),
    ...classifyCode(item.PROD_CD),
    infoL3: '신규구매',
    IN_PRICE: Number(item.IN_PRICE) || 0,
    OUT_PRICE: 0,
    OUT_PRICE1: 0,
    'IN_PRICE[2025]': '',
    'OUT_PRICE[2025]': '',
    'OUT_PRICE1[2025]': '',
    type: typeName ? `[${typeName}]` : '',
    category: '기타',
    vendors: '',
    cost: '',
    history: '',
    usage: 0,
    active: 'Y',
    flgWork: 'N',
    flgOut: 'N',
    origin: 'ecount',
    createdAt: new Date().toISOString(),
  };
};

// ---- 여기서 만든 약품(origin=local) → 이카운트 동기화 ----

const sameName = (a, b) => (a || '').replace(/\s/g, '') === (b || '').replace(/\s/g, '');

/**
 * 여기서 만든 약품 중 이카운트 등록 확인(ecountSyncedAt)이 아직 없는 것을
 * - unsynced: 이카운트에 아직 없는 것 (엑셀로 내려받아 이카운트에 등록)
 * - confirmed: 같은 코드·같은 이름으로 이카운트에 있는 것 (등록 확인 → ecountSyncedAt 기록)
 * - conflicts: 같은 코드가 이카운트에 다른 이름으로 있는 것 (코드 충돌)
 * 로 나눈다. ecountSyncedAt 이 있는 약품은 예전 엑셀로 비교해도 다시 나오지 않는다.
 */
export const findLocalChemicalStatus = (allCodes, chemicals) => {
  const pending = chemicals.filter(c => c.origin === 'local' && !c.ecountSyncedAt);
  const inEcount = pending.filter(c => c.dsids in allCodes);
  return {
    unsynced: pending.filter(c => !(c.dsids in allCodes)),
    confirmed: inEcount.filter(c => sameName(c.name, allCodes[c.dsids])),
    conflicts: inEcount
      .filter(c => !sameName(c.name, allCodes[c.dsids]))
      .map(c => ({ chemical: c, ecountName: allCodes[c.dsids] })),
  };
};

// 이카운트 품목등록 엑셀(ESA009M)과 같은 열 이름. TODO: 이카운트 '엑셀 업로드' 양식을 받으면 맞출 것
export const downloadChemicalsForEcount = (chemicals) => downloadExcel(chemicals, [
  { header: '품목코드', value: c => c.dsids },
  { header: '품목명', value: c => c.name },
  { header: '규격정보', value: c => c.unit },
  { header: '품목구분', value: c => c.type || '[상품]' },
  { header: '입고단가', value: c => c.IN_PRICE },
  { header: '품목그룹1명', value: c => c.infoL1 },
  { header: '품목그룹2명', value: c => c.infoL2 },
  { header: '품목그룹3명', value: c => c.infoL3 },
  { header: '사용', value: () => 'YES' },
], '이카운트_품목등록_미등록', '품목등록');
