import axios from 'axios';

// 방제작업코스 GCxxx (S3 dsbaseinfo/common/dsworkcourse_info.json) — 용역 현장 짝의 원본.
// 고객사(custcd·custName)·맵코스(mapdscourseid)·용역창고(outwhcd·outwarehouse)를 여기 두고, 골프장·창고 화면은 GC 를 골라 불러온다.
const apiClient = axios.create({
  baseURL: 'https://e0x0fsw125.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

export const fetchWorkCourses = async () => {
  const response = await apiClient.get('/dscourse_info');
  const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  return (Array.isArray(data?.body) ? data.body : [])
    .sort((a, b) => (a.outsource !== 'Y') - (b.outsource !== 'Y') || (a.dscourseids || '').localeCompare(b.dscourseids || ''));
};

// 골프장·창고 화면의 GC 고르기 목록 한 줄
export const workCourseLabel = (g) =>
  `${g.dscourseids} ${g.name}${g.outsource === 'Y' ? ' · 용역' : ''}`;
