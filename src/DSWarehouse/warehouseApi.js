import axios from 'axios';

// 창고 API (Lambda dswarehouseDynamoDB, DynamoDB dswarehouses). 새로 추가는 utils/globaldbCreateApi.createWarehouse
const apiClient = axios.create({
  baseURL: 'https://jyipsj28s9.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

// Lambda 응답은 HTTP 200 + { statusCode, body(JSON 문자열) }
const unwrap = (response) => {
  const res_ = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  const body = typeof res_.body === 'string' ? JSON.parse(res_.body) : res_.body;
  if (res_.statusCode >= 400) {
    throw new Error(body?.message || `창고 API 오류 (status ${res_.statusCode})`);
  }
  return body;
};

export const fetchWarehouses = async () => unwrap(await apiClient.get('/dswarehouse'));

// 한 건 또는 여러 건 저장 (덮어쓰기) — 엑셀 비교 반영·메모 수정용
export const saveWarehouses = async (warehouses) => {
  const list = Array.isArray(warehouses) ? warehouses : [warehouses];
  return unwrap(await apiClient.post('/dswarehouse', list.length === 1 ? list[0] : list));
};

export const deleteWarehouse = async (whcd) =>
  unwrap(await apiClient.delete('/dswarehouse', { params: { id: whcd } }));
