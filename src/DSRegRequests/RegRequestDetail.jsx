import { useMemo, useState } from 'react';
import { useGlobalComponent } from '../context/GlobalComponentContext';
import { fetchCustomers } from '../DSCustomer/customerApi';
import EditCustomerDialog from '../DSCustomer/EditCustomerDialog';
import EditChemicalDialog from '../DSChemical/EditChemicalDialog';
import { regBadges, requestSource } from '../utils/regStatus';

/**
 * 등록 요청 한 건 — 증빙(사진·PDF)과 읽은 값, 요청·결정 정보. 보기 전용.
 * [정보 수정]은 약품·거래처의 지금 수정 창을 연다 (수정 API, 이력 남음).
 */
const EXTRACTED_LABELS = {
  bizNo: '사업자번호', name: '상호', ceo: '대표자', bizType: '업태', bizItem: '종목', address: '주소', tel: '전화', email: '이메일',
};
const DECISION_LABELS = { approve: '승인', reject: '반려', exclude: '이카운트 제외' };
const TARGET_LABELS = { registration: '등록', ecount: '이카운트 등록' };

const formatTime = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR') : '-');
const norm = (v) => String(v ?? '').replace(/[\s-]/g, '');

function Evidence({ evidence }) {
  if (!evidence) return <div className="text-sm text-gray-400 p-4">증빙 없음</div>;
  const isPdf = evidence.fileKey.endsWith('.pdf');
  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-sm">
        <span>{evidence.docType} · {formatTime(evidence.readAt)}{evidence.readBy && ` · ${evidence.readBy}`}</span>
        <a className="link link-primary" href={evidence.viewUrl} target="_blank" rel="noreferrer">새 창으로</a>
      </div>
      {isPdf
        ? <iframe title="증빙" src={evidence.viewUrl} className="w-full h-[60vh] border rounded" />
        : <img alt="증빙" src={evidence.viewUrl} className="w-full max-h-[60vh] object-contain border rounded bg-gray-50" />}
    </div>
  );
}

export default function RegRequestDetail({ request, onClose, onChanged }) {
  const { globalChemicals, setGlobalChemicals, updateGlobalChemical } = useGlobalComponent();
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingChemical, setEditingChemical] = useState(null);
  const [isOpening, setIsOpening] = useState(false);

  // 약품 수정 창의 선택지 (약품 목록 화면과 같은 값)
  const filterOptions = useMemo(() => {
    const unique = (field) => ['all', ...new Set(globalChemicals.map(c => c[field]).filter(Boolean))];
    return { infoL3: unique('infoL3'), infoL2: unique('infoL2'), infoL1: unique('infoL1') };
  }, [globalChemicals]);

  if (!request) return null;

  const r = request;
  const extracted = r.regEvidence?.extracted || {};
  const current = { bizNo: r.bizNo, name: r.name, ceo: r.ceo, bizType: r.bizType, bizItem: r.bizItem };

  const openEdit = async () => {
    setIsOpening(true);
    try {
      if (r.kind === 'customer') {
        const customer = (await fetchCustomers()).find(c => c.custcd === r.code);
        if (!customer) throw new Error(`거래처를 찾지 못했습니다: ${r.code}`);
        setEditingCustomer(customer);
      } else {
        const chemical = globalChemicals.find(c => c.dsids === r.code);
        if (!chemical) throw new Error(`약품을 찾지 못했습니다: ${r.code} (약품 목록을 새로고침해 보세요)`);
        setEditingChemical(chemical);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setIsOpening(false);
    }
  };

  const handleSaved = () => onChanged();

  return (
    <>
      <dialog className="modal modal-open">
        <div className="modal-box max-w-5xl">
          <h3 className="font-bold text-lg mb-1">
            {r.kind === 'item' ? '품목' : '거래처'} 등록 요청 — {r.code} {r.name}
          </h3>
          <div className="mb-3">
            {regBadges({ ...r, origin: 'local' }).map(b => (
              <span key={b.label} className={`badge badge-sm mr-1 ${b.className}`} title={b.title}>{b.label}</span>
            ))}
          </div>

          <div className={`grid gap-4 ${r.kind === 'customer' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {r.kind === 'customer' && <Evidence evidence={r.regEvidence} />}

            <div className="text-sm space-y-3">
              <section>
                <h4 className="font-semibold mb-1">요청</h4>
                <p>{formatTime(r.regRequest?.at)} · {requestSource(r.regRequest)} · {r.regRequest?.by || '요청자 없음'}</p>
                {r.regRequest?.ref && <p className="text-gray-500">원본: {r.regRequest.ref}</p>}
                {r.regRequest?.note && <p className="text-gray-500">메모: {r.regRequest.note}</p>}
                {r.regRequest?.confirmSimilar && <p className="text-warning">⚠️ 비슷한 품목이 있다는 안내를 확인하고 등록함</p>}
                {r.regRequest?.allowInvalidBizNo && <p className="text-warning">⚠️ 사업자번호 검증번호가 틀린 채로 등록함</p>}
              </section>

              <section>
                <h4 className="font-semibold mb-1">내용</h4>
                {r.kind === 'item' ? (
                  <p>
                    {r.unit || '용량 없음'} · {r.infoL2}/{r.infoL1} · {r.infoL3}<br />
                    구입가 {Number(r.IN_PRICE || 0).toLocaleString()} · 판가 {Number(r.OUT_PRICE1 || 0).toLocaleString()}
                    {' '}· 용역판가 {Number(r.OUT_PRICE || 0).toLocaleString()}
                    {r.vendors && <><br />구매처: {r.vendors}</>}
                  </p>
                ) : (
                  <p>
                    {r.bizNo ? `법인 · ${r.bizNo}` : '개인'} · {r.category}<br />
                    대표 {r.ceo || '-'} · {r.bizType || '-'} / {r.bizItem || '-'}
                  </p>
                )}
              </section>

              {Object.keys(extracted).length > 0 && (
                <section>
                  <h4 className="font-semibold mb-1">증빙에서 읽은 값</h4>
                  <table className="table table-xs">
                    <thead><tr><th>항목</th><th>읽은 값</th><th>지금 값</th></tr></thead>
                    <tbody>
                      {Object.entries(extracted).map(([f, v]) => {
                        const now = current[f];
                        const differs = now !== undefined && norm(now) !== norm(v);
                        return (
                          <tr key={f}>
                            <td>{EXTRACTED_LABELS[f] || f}</td>
                            <td>{v}</td>
                            <td className={differs ? 'text-warning' : ''}>{now ?? ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              )}

              <section>
                <h4 className="font-semibold mb-1">결정</h4>
                {r.regDecision ? (
                  <p>
                    {TARGET_LABELS[r.regDecision.target] || ''} {DECISION_LABELS[r.regDecision.decision] || ''}
                    {' '}· {r.regDecision.by} · {formatTime(r.regDecision.at)}
                    {r.regDecision.comment && <><br />사유: {r.regDecision.comment}</>}
                  </p>
                ) : <p className="text-gray-500">아직 없음 — 재고 슈퍼관리자가 결정합니다</p>}
              </section>
            </div>
          </div>

          <div className="modal-action">
            <button className="btn btn-outline" onClick={openEdit} disabled={isOpening}>
              {isOpening ? '여는 중...' : '정보 수정'}
            </button>
            <button className="btn" onClick={onClose}>닫기</button>
          </div>
        </div>
      </dialog>

      {editingCustomer && (
        <EditCustomerDialog customer={editingCustomer} onClose={() => setEditingCustomer(null)} onSaved={handleSaved} />
      )}
      <EditChemicalDialog
        isOpen={Boolean(editingChemical)}
        onClose={() => setEditingChemical(null)}
        chemical={editingChemical}
        onSaved={(saved) => {
          setGlobalChemicals(prev => prev.map(c => (c.dsids === saved.dsids ? saved : c)));
          handleSaved();
        }}
        onSaveClass={async (chemical) => (await updateGlobalChemical(chemical)) === true}
        filterOptions={filterOptions}
      />
    </>
  );
}
