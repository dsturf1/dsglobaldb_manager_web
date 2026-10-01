import axios from 'axios';
import * as XLSX from 'xlsx';

/**
 * 이카운트 품목과 약품(dschemicals) 비교. 이카운트 데이터는 두 가지 방법으로 읽는다.
 * - 엑셀: 이카운트 품목등록에서 내려받은 ESA009M.xlsx 를 브라우저에서 바로 읽음
 * - 서버: AWS/Ecount/fetch_products.py 가 s3://dsbaseinfo/ecount/ 에 올린 요약 파일을
 *         Lambda dsecountProducts (GET /ecountproducts) 로 읽음
 * 약품 코드(dsids)와 이카운트 품목코드(PROD_CD)는 같은 체계 (A1/A2/A3/B0/C0/G0).
 */

const ECOUNT_PRODUCTS_URL = 'https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev/ecountproducts';

// 코드 접두어 → 대분류/중분류 (AddChemicalDialog 의 코드 규칙과 동일, 약품만: 기타물품 D0 제외)
export const ECOUNT_PREFIX_CLASS = {
  A1: { infoL2: '농약', infoL1: '살균제' },
  A2: { infoL2: '농약', infoL1: '살충제' },
  A3: { infoL2: '농약', infoL1: '제초제' },
  B0: { infoL2: '비료', infoL1: '비료' },
  C0: { infoL2: '기타약재', infoL1: '기타약재' },
  G0: { infoL2: '잔디', infoL1: '잔디' },
};

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
  return { ...body, sourceLabel: `서버 데이터 (${new Date(body.fetched_at).toLocaleString('ko-KR')})` };
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
 * 약품 접두어 품목 중 사용=YES 만 남긴다.
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
  let unused = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const code = get(row, 'code');
    if (!ECOUNT_PREFIX_CLASS[code.slice(0, 2)]) continue;
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
  return { items, sourceLabel: unused > 0 ? `${label} · 사용 안 함 ${unused}건 제외` : label };
};

// 이카운트에는 있고 약품 DB에는 없는 품목
export const findNewEcountProducts = (ecountItems, chemicals) => {
  const existing = new Set(chemicals.map(c => c.dsids));
  return ecountItems.filter(item =>
    ECOUNT_PREFIX_CLASS[item.PROD_CD.slice(0, 2)] && !existing.has(item.PROD_CD)
  );
};

// 이카운트 품목 → 약품 레코드 (기존 DB 항목과 같은 필드 구성, 판가는 DB에서 입력)
export const ecountToChemical = (item) => {
  const typeName = PROD_TYPE_NAME[item.PROD_TYPE];
  return {
    dsids: item.PROD_CD,
    name: item.PROD_DES.trim(),
    unit: item.SIZE_DES.trim(),
    ...ECOUNT_PREFIX_CLASS[item.PROD_CD.slice(0, 2)],
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
  };
};
