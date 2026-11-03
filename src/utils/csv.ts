type Cell = string | number | null | undefined;

/** Descarga un CSV que Excel en español abre bien (separador ';' y BOM UTF-8 para tildes). */
export function downloadCsv(filename: string, rows: Cell[][]): void {
  const escape = (v: Cell) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : v;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(escape).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
