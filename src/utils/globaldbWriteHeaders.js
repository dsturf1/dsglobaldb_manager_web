// update/alias 쓰기 API 는 API 키(x-api-key)가 필요하다 (API Gateway 사용량 계획 'globaldb-write', 키 'globaldb-web').
// 값은 빌드 환경 변수 VITE_GDB_WEB_API_KEY — 로컬은 프로젝트 루트 .env.local, 배포는 Amplify 앱 환경 변수.
// 브라우저 코드에 들어가므로 비밀이 아니다. 앱 구분과 앱별 차단용이다.
const WEB_API_KEY = import.meta.env.VITE_GDB_WEB_API_KEY;

if (!WEB_API_KEY) {
  console.warn('VITE_GDB_WEB_API_KEY 가 없습니다. 거래처·약품 수정/별칭 저장이 403 으로 거부됩니다.');
}

export const WRITE_HEADERS = WEB_API_KEY ? { 'x-api-key': WEB_API_KEY } : {};
