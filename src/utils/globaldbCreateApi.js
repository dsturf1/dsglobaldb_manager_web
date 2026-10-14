import axios from 'axios';
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import { WRITE_HEADERS } from './globaldbWriteHeaders';

/**
 * 안전한 추가 API (Lambda dsglobaldbCreate, docs/GLOBALDB_SAFE_CREATE_API.md).
 * 코드는 서버가 정하고, 이미 있는 코드는 덮어쓰지 않는다.
 * 약품은 비슷한 이름·같은 이름+같은 용량이 있으면 409(reason=similar) → 사용자 확인 후 confirmSimilar 로 다시 보낸다.
 * create 는 등록 요청이다 (docs/gdb-request-registration-queue.md): 웹 키 + request 블록을 붙이면
 * 서버가 regStatus·ecountStatus·regRequest(app=web)를 정한다. 웹에서 만든 것은 승인 없이 확정된다 (4차).
 * 재고·견적에서 온 요청의 승인은 글로벌 DB 슈퍼관리자가 글로벌 DB 봇이나 '등록 요청' 화면에서 한다.
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

// 요청한 사람 (regRequest 의 by·byId). 로그인 정보를 못 읽으면 비워 둔다
export const webRequest = async (note = '') => {
  try {
    const attrs = await fetchUserAttributes();
    return { channel: 'web', by: attrs.name || attrs.email || '', byId: attrs.sub || '', note, ref: '' };
  } catch {
    return { channel: 'web', by: '', byId: '', note, ref: '' };
  }
};

// 201 응답의 autoApproved·autoReason 은 저장된 필드가 아니므로 떼어 낸다
const created = ({ status, body }) => {
  if (status !== 201) return { status, body };
  const { autoApproved, autoReason, ...record } = body;
  return { status, body: record, autoApproved, autoReason };
};

// 다음 약품 코드(확정 아님) + 비슷한 이름 확인 결과 { dsids, sameName, sameUnit, similar }
export const previewChemicalCode = async ({ infoL1, name, unit }) => {
  const { status, body } = unwrap(await apiClient.get('/dschemical/next-code', { params: { infoL1, name, unit } }));
  if (status >= 400) throw new Error(body?.message || `미리보기 실패 (status ${status})`);
  return body;
};

// 약품 추가 → { status: 201 | 409 | 400 ..., body }
export const createChemical = async (chemical, { confirmSimilar = false } = {}) => created(unwrap(
  await apiClient.post('/dschemical/create', { ...chemical, confirmSimilar, request: await webRequest() },
    { headers: WRITE_HEADERS })));

// 거래처 추가 → { status: 201 | 409(이미 있음) | 422(사업자번호 검증 실패) | 400, body, autoApproved, autoReason }
// evidence: { docType, bizNo, fileKey, readBy } — 증빙 파일을 uploadEvidence 로 먼저 올린 경우
export const createCustomer = async (customer, evidence) => created(unwrap(
  await apiClient.post('/dscustomer/create', { ...customer, request: await webRequest(), ...(evidence ? { evidence } : {}) },
    { headers: WRITE_HEADERS })));

// 창고 추가 → { status: 201 | 409(reason: 'code' 코드 중복 / 'name' 이름 중복) | 400, body }
export const createWarehouse = async (warehouse) =>
  unwrap(await apiClient.post('/dswarehouse/create', warehouse));

// 증빙 파일 올리기: 서버에서 올릴 주소를 받아 S3 로 바로 PUT → fileKey
export const EVIDENCE_DOC_TYPES = ['사업자등록증', '세금계산서', '영수증', '견적서', '거래명세서'];
export const EVIDENCE_ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf';

export const uploadEvidence = async (docType, file) => {
  const contentType = file.type || 'application/octet-stream';
  const { status, body } = unwrap(await apiClient.post('/dscustomer/evidence-upload', { docType, contentType },
    { headers: WRITE_HEADERS }));
  if (status !== 200) throw new Error(body?.message || `증빙 업로드 주소를 받지 못했습니다 (status ${status})`);
  const response = await fetch(body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': body.contentType }, body: file });
  if (!response.ok) throw new Error(`증빙 파일을 올리지 못했습니다 (HTTP ${response.status})`);
  return body.fileKey;
};

// 등록 요청 목록 (약품·거래처). query: { pending, kind, app, changedSince }
export const fetchRegRequests = async (query = {}) => {
  const { status, body } = unwrap(await apiClient.get('/regrequests', { params: query, headers: WRITE_HEADERS }));
  if (status >= 400) throw new Error(body?.message || `등록 요청 목록을 불러오지 못했습니다 (status ${status})`);
  return body;
};

// ---- 승인 (글로벌 DB 슈퍼관리자만) — 로그인 토큰(Cognito)을 API Gateway 가 확인한다 ----
const authHeaders = async () => {
  const token = (await fetchAuthSession()).tokens?.idToken?.toString();
  if (!token) throw new Error('로그인 정보를 읽지 못했습니다. 다시 로그인해 주세요.');
  return { Authorization: token };
};

// { isOwner, email } — 승인 버튼을 보일지
export const fetchReviewer = async () => {
  const { status, body } = unwrap(await apiClient.get('/regreview', { headers: await authHeaders() }));
  if (status !== 200) throw new Error(body?.message || `승인 권한을 확인하지 못했습니다 (status ${status})`);
  return body;
};

// 결정 → { status: 200 | 409(decided/stale) | 422 | 400 | 403, body }
export const reviewRequest = async ({ kind, code, decision, comment = '', expectedUpdatedAt }) =>
  unwrap(await apiClient.post('/regreview', { kind, id: code, decision, comment, expectedUpdatedAt },
    { headers: await authHeaders() }));

// ---- 설정: 승인자 · 텔레그램 연결 (로그인 토큰) ----
// { me: {email, role(owner|approver|null), telegram[]}, approvers[], invites[], botUsername, linkMinutes, inviteHours }
export const fetchSettings = async () => {
  const { status, body } = unwrap(await apiClient.get('/gdbsettings', { headers: await authHeaders() }));
  if (status !== 200) throw new Error(body?.message || `설정을 불러오지 못했습니다 (status ${status})`);
  return body;
};

// action: saveApprover {email, name} / removeApprover {email} / linkCode {email?} / cancelInvite {codeId} / unlink {email?, telegramId}
// → 바뀐 설정 화면 (linkCode 는 + link {url, expiresAt, kind})
export const settingsAction = async (body) => {
  const { status, body: res } = unwrap(await apiClient.post('/gdbsettings', body, { headers: await authHeaders() }));
  if (status !== 200) throw new Error(res?.message || `처리하지 못했습니다 (status ${status})`);
  return res;
};

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
