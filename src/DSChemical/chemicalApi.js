import axios from 'axios';
import { WRITE_HEADERS } from '../utils/globaldbWriteHeaders';

// 약품 부분 수정 · 별칭 · 이력 (Lambda dsglobaldbCreate, docs/gdb-update-api-request.md 4장)
const apiClient = axios.create({
  baseURL: 'https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

// 상태 코드를 그대로 돌려준다 (409 conflict / aliasTaken 은 화면에서 처리)
const withStatus = (response) => {
  const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  return { status: res_.statusCode, body: typeof res_.body === 'string' ? JSON.parse(res_.body) : res_.body };
};

// 바꿀 필드만 보낸다 (name unit infoL3 vendors IN_PRICE OUT_PRICE OUT_PRICE1 active flgWork flgOut).
// expectedUpdatedAt 은 화면에 불러온 레코드의 updatedAt (없으면 null)
export const updateChemical = async (chemical, set, updatedBy) => withStatus(await apiClient.post('/dschemical/update', {
  dsids: chemical.dsids, expectedUpdatedAt: chemical.updatedAt ?? null, set, updatedBy,
}, { headers: WRITE_HEADERS }));

// add / remove: 별칭 문자열 목록
export const updateChemicalAliases = async (dsids, { add = [], remove = [], force = false }, updatedBy) =>
  withStatus(await apiClient.post('/dschemical/alias', { dsids, add, remove, force, updatedBy }, { headers: WRITE_HEADERS }));

export const fetchChemicalHistory = async (dsids) => {
  const { status, body } = withStatus(await apiClient.get('/dschemical/history', { params: { id: dsids } }));
  if (status >= 400) throw new Error(body?.message || `이력 조회 실패 (status ${status})`);
  return body;
};
