import React from 'react';

export default function ViewMaintenanceDialog({ isOpen, onClose, maintenances, equipment }) {
  if (!isOpen) return null;

  const formatDate = (isodate) => {
    if (!isodate) return '-';
    const date = new Date(isodate);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const formatCurrency = (amount) => {
    return amount?.toLocaleString('ko-KR') + '원';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[800px] max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            장비 유지보수 이력
            <span className="ml-2 text-sm text-gray-500">
              ({equipment?.name} - {equipment?.id})
            </span>
          </h2>
          <button 
            className="btn btn-sm btn-ghost"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* 내용 */}
        <div className="flex-1 overflow-auto">
          <table className="table table-compact w-full">
            <thead>
              <tr>
                <th className="w-32">날짜</th>
                <th>설명</th>
                <th className="w-48">자재 내용</th>
                <th className="w-24 text-right">수량</th>
                <th className="w-32 text-right">비용</th>
              </tr>
            </thead>
            <tbody>
              {maintenances.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-gray-500">
                    유지보수 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                maintenances.map((maintenance) => (
                  <tr key={maintenance.id}>
                    <td>{formatDate(maintenance.isodate)}</td>
                    <td>{maintenance.desc || '-'}</td>
                    <td colSpan="3">
                      {maintenance.material.length === 0 ? (
                        '-'
                      ) : (
                        <table className="w-full">
                          <tbody>
                            {maintenance.material.map((item, index) => (
                              <tr key={index}>
                                <td>{item.comment || '-'}</td>
                                <td className="text-right">{item.amount || '-'}</td>
                                <td className="text-right">
                                  {item.cost ? formatCurrency(item.cost) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 푸터 */}
        <div className="mt-4 flex justify-end">
          <button 
            className="btn btn-primary"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
} 