import axios from 'axios';

/**
 * 안전한 추가 API (Lambda dsglobaldbCreate, docs/GLOBALDB_SAFE_CREATE_API.md).
 * 코드는 서버가 정하고, 이미 있는 코드는 덮어쓰지 않는다.
 * 약품은 비슷한 이름·같은 이름+같은 용량이 있으면 409(reason=similar) → 사용자 확인 후 confirmSimilar 로 다시 보낸다.
 */
const apiClient = axios.create({
  baseURL: 'https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

// Lambda 응답은 HTTP 200 + { statusCode, body(JSON 문자열) }
const unwrap = (response) => {
  const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  const body = typeof res_.body === 'string' ? JSON.parse(res_.body) : res_.body;
  return { status: res_.statusCode, body };
};

// 다음 약품 코드(확정 아님) + 비슷한 이름 확인 결과 { dsids, sameName, sameUnit, similar }
export const previewChemicalCode = async ({ infoL1, name, unit }) => {
  const { status, body } = unwrap(await apiClient.get('/dschemical/next-code', { params: { infoL1, name, unit } }));
  if (status >= 400) throw new Error(body?.message || `미리보기 실패 (status ${status})`);
  return body;
};

// 약품 추가 → { status: 201 | 409 | 400 ..., body }
export const createChemical = async (chemical, { confirmSimilar = false } = {}) =>
  unwrap(await apiClient.post('/dschemical/create', { ...chemical, confirmSimilar }));

// 거래처 추가 → { status: 201 | 409(이미 있음) | 422(사업자번호 검증 실패) | 400, body }
export const createCustomer = async (customer) =>
  unwrap(await apiClient.post('/dscustomer/create', customer));

// 창고 추가 → { status: 201 | 409(reason: 'code' 코드 중복 / 'name' 이름 중복) | 400, body }
export const createWarehouse = async (warehouse) =>
  unwrap(await apiClient.post('/dswarehouse/create', warehouse));

// 409 similar 응답 → 확인 창 문구
export const describeSimilar = ({ sameName = [], sameUnit, similar = [] }) => {
  const lines = [];
  if (sameUnit) {
    lines.push(`같은 이름·같은 용량이 이미 있습니다: ${sameName.map(c => `${c.dsids} ${c.unit}`).join(', ')}`);
  }
  similar.forEach(s => {
    lines.push(`비슷한 약품 '${s.name}' (${s.reason}, ${Math.round(s.score * 100)}%): ${s.codes.map(c => `${c.dsids} ${c.unit}`).join(', ')}`);
  });
  return lines.join('\n');
};
