/**
 * 등록 요청 상태 (docs/gdb-request-registration-queue.md 3장). 약품·거래처 공통.
 * - regStatus: 등록 승인 requested / approved / rejected — 없으면 approved (이카운트에서 온 것, 이전 데이터)
 * - ecountStatus: 이카운트 등록 승인 pending / approved / excluded — 없으면 ecount 출처는 해당 없음(null), local 은 approved
 * 서버 effective_status 와 같은 규칙.
 */
export const effectiveStatus = (record) => ({
  reg: record?.regStatus || 'approved',
  ecount: record?.ecountStatus || (record?.origin === 'ecount' ? null : 'approved'),
});

// 이카운트 비교 '이카운트 미등록' 탭에 나올 수 있는 것: 여기서 만들었고 이카운트 등록 승인이 끝난 것
export const isEcountApproved = (record) => record?.origin === 'local' && effectiveStatus(record).ecount === 'approved';

export const isPendingApproval = (record) => {
  const { reg, ecount } = effectiveStatus(record);
  return reg === 'requested' || (ecount === 'pending' && reg !== 'rejected');
};

// (6차 개정) 견적에서 온 증빙 없는 거래처 요청 — 견적은 승인 대기에도 이 코드로 쓴다 (봇 is_quote_customer_in_use 와 같음)
export const isQuoteCustomerInUse = (r) =>
  r?.kind === 'customer' && r?.regStatus === 'requested' && r?.regRequest?.app === 'quote';

export const APP_LABELS ={ inv: '재고', quote: '견적', web: '글로벌 DB 웹', unknown: '알 수 없음' };
export const CHANNEL_LABELS = { telegram: '봇', web: '웹' };

export const requestSource = (regRequest) => {
  if (!regRequest) return '';
  const app = APP_LABELS[regRequest.app] || regRequest.app;
  const channel = CHANNEL_LABELS[regRequest.channel];
  return regRequest.app === 'web' || !channel ? app : `${app} ${channel}`;
};

/**
 * 목록 배지. [{ label, className, title }]
 * 승인 대기 / 증빙 등록 / 이카운트 승인 대기 / 이카운트 미등록 / 이카운트 등록됨 / 이카운트 제외 / 반려
 */
export const regBadges = (record) => {
  if (!record || (record.origin !== 'local' && !record.regRequest)) return [];
  const { reg, ecount } = effectiveStatus(record);
  const decision = record.regDecision;
  const decided = decision ? ` · ${decision.by} ${new Date(decision.at).toLocaleDateString('ko-KR')}` : '';
  const badges = [];
  if (reg === 'requested') {
    // (5차) 승인 전에는 어느 앱도 쓰지 않는다 / (6차) 예외: 견적의 거래처는 승인 대기에도 견적에 쓴다
    const quoteCustomer = (record.kind === 'customer' || record.custcd) && record.regRequest?.app === 'quote';
    badges.push({
      label: '승인 대기', className: 'badge-warning',
      title: quoteCustomer
        ? '등록 승인 대기 — 견적에서는 승인 전에도 이 코드로 쓰는 중 (재고 등 다른 앱은 승인 뒤에 씀)'
        : '등록 승인 대기 — 승인 전에는 이 코드를 쓰지 않음 (승인되면 요청한 앱이 씀)',
    });
  }
  if (reg === 'rejected') {
    badges.push({ label: '반려', className: 'badge-error', title: `반려: ${decision?.comment || ''}${decided}` });
    return badges;
  }
  if (record.regEvidence) {
    badges.push({ label: '증빙 등록', className: 'badge-info', title: `${record.regEvidence.docType}에서 읽은 사업자번호로 바로 등록` });
  }
  if (reg !== 'requested' && ecount === 'pending') {
    badges.push({ label: '이카운트 승인 대기', className: 'badge-warning', title: '이카운트에 올릴지 슈퍼관리자 결정 대기' });
  } else if (ecount === 'excluded') {
    badges.push({ label: '이카운트 제외', className: 'badge-ghost', title: `이카운트에 올리지 않음: ${decision?.comment || ''}${decided}` });
  } else if (ecount === 'approved' && record.origin === 'local') {
    badges.push(record.ecountSyncedAt
      ? { label: '이카운트 등록됨', className: 'badge-success',
          title: `이카운트 등록 확인 ${new Date(record.ecountSyncedAt).toLocaleDateString('ko-KR')}` }
      : { label: '이카운트 미등록', className: 'badge-warning', title: '승인됨 — 이카운트에 등록한 뒤 [이카운트 비교]에서 등록 완료로 반영' });
  }
  return badges;
};
