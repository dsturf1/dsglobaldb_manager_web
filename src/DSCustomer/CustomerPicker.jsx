import { useEffect, useState } from 'react';
import { fetchCustomers } from './customerApi';

// 고객사 거래처 고르기 — 이름·별칭·거래처코드(사업자번호)로 찾기. 골프장 분류를 앞에
// eslint-disable-next-line react/prop-types
export default function CustomerPicker({ custcd, custName, onPick }) {
  const [customers, setCustomers] = useState(null);
  const [term, setTerm] = useState('');
  useEffect(() => {
    fetchCustomers().then(setCustomers).catch(() => setCustomers([]));
  }, []);
  const norm = (v) => (v || '').toLowerCase().replace(/[\s()㈜.-]|\(주\)|주식회사/g, '');
  const q = norm(term);
  const hits = !q || !customers ? [] : customers
    .filter(c => c.active !== 'N'
      && [c.name, c.custcd, ...(c.aliases || []).map(a => a.name)].some(v => norm(v).includes(q)))
    .sort((a, b) => (a.category !== '골프장') - (b.category !== '골프장') || (a.name || '').localeCompare(b.name || '', 'ko'))
    .slice(0, 12);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">고객사 거래처 <span className="text-xs text-gray-400">용역 기성 청구 상대 (투입비·서류에 사업자번호로 씀)</span></label>
      <div className="mt-1 flex items-center gap-2 text-sm">
        {custcd
          ? <span className="bg-gray-100 rounded-md px-2 py-1">{custName || custcd} · {custcd}
              <button onClick={() => onPick(null)} className="ml-2 text-red-500 hover:text-red-700">×</button></span>
          : <span className="text-gray-400">연결 안 됨</span>}
      </div>
      <input type="text" value={term} onChange={(e) => setTerm(e.target.value)}
        placeholder={customers ? '거래처 이름·별칭·사업자번호로 찾기' : '거래처 불러오는 중…'} disabled={!customers}
        className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
      {hits.length > 0 && (
        <div className="mt-1 border rounded-md max-h-48 overflow-y-auto">
          {hits.map(c => (
            <button key={c.custcd} onClick={() => { onPick(c); setTerm(''); }}
              className="block w-full text-left text-sm px-2 py-1 hover:bg-blue-50">
              {c.name} · {c.custcd} <span className="text-xs text-gray-400">{c.category}{c.aliases?.length ? ` · ${c.aliases.map(a => a.name).slice(0, 3).join(', ')}` : ''}</span>
            </button>))}
        </div>)}
    </div>
  );
}
