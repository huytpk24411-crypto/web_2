/** Local demo exports. Values are quoted and spreadsheet formula prefixes are neutralized. */
export function downloadDemo(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function demoCsv(rows: (string | number)[][]) {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value);
            if (/^[=+@-]/.test(text) && typeof value === 'string') text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
          })
          .join(';'),
      )
      .join('\r\n')
  );
}
