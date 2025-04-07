import React from 'react';
import { Link, Routes, Route, useLocation } from 'react-router-dom';
import DSChemicalsTable from '../DSChemical/DSChemicalsTable';
import DSWorkforceTable from '../DSWorkforce/DSWorkforceTable';
import DSEquipmentTable from '../DSEquipment/DSEquipmentTable';
import BaseInfoManager from '../DSBaseInfo/BaseInfoManager';
import DSMapCourse from '../DSMapCourse/DSMapCourse';
import DSWorkCourse from '../DSWorkCourse/DSWorkCourse';
import DSWorkBaseInfo from '../DSWorkBaseInfo/DSWorkBaseInfo';
// 사이드바 컴포넌트
const Sidebar = () => {
  const location = useLocation();
  const menuItems = [
    { path: '/dsdb', label: '약품정보' },
    { path: '/dsdb/workforce', label: '인력정보' },
    { path: '/dsdb/equipment', label: '장비정보' },
    { path: '/dsdb/baseinfo', label: '기본정보' },
    { path: '/dsdb/mapcourse', label: '맵코스' },
    { path: '/dsdb/workcourse', label: '방제작업코스' },
    { path: '/dsdb/workbaseinfo', label: '방제기본정보' }
  ];

  return (
    <div className="w-48 bg-white border-r border-gray-200 p-4 h-full overflow-y-auto">
      <ul className="space-y-2">
        {menuItems.map((item) => (
          <li key={item.path}>
            <Link
              to={item.path}
              className={`block px-4 py-2 rounded-lg text-sm ${
                location.pathname === item.path
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

// 메인 컴포넌트
export default function DSDBMain() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar - 고정 너비, 독립 스크롤 */}
      <div className="w-48 flex-shrink-0 h-full overflow-hidden">
        <Sidebar />
      </div>

      {/* Main Content - 남은 공간 차지, 독립 스크롤 */}
      <div className="flex-grow overflow-y-auto">
        <div className="p-4">
          <Routes>
            <Route path="/" element={<DSChemicalsTable />} />
            <Route path="/workforce" element={<DSWorkforceTable />} />
            <Route path="/equipment" element={<DSEquipmentTable />} />
            <Route path="/baseinfo" element={<BaseInfoManager />} />
            <Route path="/mapcourse" element={<DSMapCourse />} />
            <Route path="/workcourse" element={<DSWorkCourse />} />
            <Route path="/workbaseinfo" element={<DSWorkBaseInfo />} />
          </Routes>
        </div>
      </div>
    </div>
  );
} 