import axios from 'axios';

// 골프장 (S3 dsbaseinfo/common/mapcourse_info.json, Lambda dsoutcourse) — 목록·한 건 저장(보낸 필드만 덮어씀)
const apiClient = axios.create({
  baseURL: 'https://spcxatxbph.execute-api.us-east-1.amazonaws.com/dev',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

export const fetchCourses = async () => {
  const response = await apiClient.get('/dscourse');
  const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  return (Array.isArray(data?.body) ? data.body : []).filter(c => c.id !== 'MGC999');
};
