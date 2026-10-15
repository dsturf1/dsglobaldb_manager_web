/**
 * 품목 코드 묶음 — 같은 약품 표(dschemicals)를 웹에서 두 탭으로 나눠 보여 준다.
 * - 약품정보: A(농약)·B(비료)·C(기타약재)
 * - 기타 코드(잔디/물품): D(기타물품)·E(기타: 운반비·택배비 등)·G(잔디)
 * 재고·견적은 GET /dschemical 로 전부 읽으므로 저장·API 는 나누지 않는다.
 */
export const CODE_GROUPS = {
  chemical: {
    letters: ['A', 'B', 'C'],
    title: '약품 목록',
    excelName: '약품목록',
    infoL2: ['농약', '비료', '기타약재'],
    infoL1: { 농약: ['살균제', '살충제', '제초제'], 비료: ['비료'], 기타약재: ['기타약재'] },
    addDefault: { infoL2: '농약', infoL1: '살균제' },
  },
  other: {
    letters: ['D', 'E', 'G'],
    title: '기타 코드 (잔디/물품)',
    excelName: '기타코드목록',
    infoL2: ['잔디', '기타물품', '기타'],
    infoL1: { 잔디: ['잔디'], 기타물품: ['기타물품'], 기타: ['기타'] },
    addDefault: { infoL2: '잔디', infoL1: '잔디' },
  },
};

// 코드 첫 글자로 묶음을 정한다. 모르는 글자는 약품 쪽에 둔다 (지금 데이터에는 없음)
export const groupOf = (code) => (CODE_GROUPS.other.letters.includes(String(code || '').charAt(0)) ? 'other' : 'chemical');
