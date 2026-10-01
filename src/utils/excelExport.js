import * as XLSX from 'xlsx';

/**
 * 객체 배열 → 엑셀 파일 다운로드.
 * @param {object[]} rows
 * @param {{ header: string, value: (row) => any }[]} columns  열 이름과 값
 * @param {string} fileName  확장자 제외
 */
export const downloadExcel = (rows, columns, fileName, sheetName = 'Sheet1') => {
  const data = [
    columns.map(c => c.header),
    ...rows.map(row => columns.map(c => c.value(row) ?? '')),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet['!cols'] = columns.map(c => ({ wch: Math.max(c.header.length * 2, 10) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  XLSX.writeFile(workbook, `${fileName}_${stamp}.xlsx`);
};
