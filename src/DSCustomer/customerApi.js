import axios from 'axios';
import { WRITE_HEADERS } from '../utils/globaldbWriteHeaders';

// 거래처 API (Lambda dscustomerDynamoDB, DynamoDB dscustomers)
const apiClient = axios.create({
  baseURL: 'https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

const SAVE_CHUNK = 100;

// Lambda 응답은 HTTP 200 + { statusCode, body(JSON 문자열) }
const unwrap = (response) => {
  const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  const body = typeof res_.body === 'string' ? JSON.parse(res_.body) : res_.body;
  if (res_.statusCode >= 400) {
    throw new Error(body?.message || `거래처 API 오류 (status ${res_.statusCode})`);
  }
  return body;
};

export const fetchCustomers = async () => unwrap(await apiClient.get('/dscustomer'));

// 한 건 또는 여러 건 저장 (put_item, 전체 덮어쓰기). 여러 건은 SAVE_CHUNK 씩 나눠 보낸다
export const saveCustomers = async (customers, onProgress) => {
  const list = Array.isArray(customers) ? customers : [customers];
  for (let i = 0; i < list.length; i += SAVE_CHUNK) {
    const chunk = list.slice(i, i + SAVE_CHUNK);
    unwrap(await apiClient.post('/dscustomer', chunk.length === 1 ? chunk[0] : chunk));
    onProgress?.(Math.min(i + SAVE_CHUNK, list.length), list.length);
  }
};

export const deleteCustomer = async (custcd) =>
  unwrap(await apiClient.delete('/dscustomer', { params: { id: custcd } }));

// ---- 부분 수정 · 별칭 · 이력 (Lambda dsglobaldbCreate, docs/gdb-update-api-request.md) ----

// 상태 코드를 그대로 돌려준다 (409 conflict / aliasTaken 은 화면에서 처리)
const withStatus = (response) => {
  const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  return { status: res_.statusCode, body: typeof res_.body === 'string' ? JSON.parse(res_.body) : res_.body };
};

// 바꿀 필드만 보낸다. expectedUpdatedAt 은 화면에 불러온 레코드의 updatedAt (없으면 null)
export const updateCustomer = async (customer, set, updatedBy) => withStatus(await apiClient.post('/dscustomer/update', {
  custcd: customer.custcd, expectedUpdatedAt: customer.updatedAt ?? null, set, updatedBy,
}, { headers: WRITE_HEADERS }));

// add: [{name, code?}], remove: [{name}]
export const updateCustomerAliases = async (custcd, { add = [], remove = [], force = false }, updatedBy) =>
  withStatus(await apiClient.post('/dscustomer/alias', { custcd, add, remove, force, updatedBy }, { headers: WRITE_HEADERS }));

export const fetchCustomerHistory = async (custcd) =>
  unwrap(await apiClient.get('/dscustomer/history', { params: { id: custcd } }));
