// One-shot audit of the redacted Webull Desktop XLSX fixture.
// Dumps every row as a column → value map plus per-column type/sample
// summary, so we can plan the parser without manual XLSX-cell archaeology.
//
// Usage: node scripts/audit-webull-xlsx.cjs

const path = require('node:path')
const ExcelJS = require('exceljs')

const SRC = path.resolve(
  __dirname,
  '..',
  'test-fixtures',
  'webull-desktop-paper-2026-05-14.xlsx',
)

;(async () => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(SRC)
  for (const ws of wb.worksheets) {
    const header = []
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      header[col - 1] = String(cell.value ?? '')
    })

    console.log(`\n══ sheet: ${ws.name} (${ws.rowCount} rows) ══`)
    console.log(`columns: ${header.length}`)

    // Per-column type fingerprint
    const colTypes = header.map(() => new Set())
    const colSamples = header.map(() => new Set())
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      for (let c = 1; c <= header.length; c++) {
        const v = row.getCell(c).value
        const t = v === null || v === undefined
          ? 'empty'
          : v instanceof Date
            ? 'Date'
            : typeof v
        colTypes[c - 1].add(t)
        if (colSamples[c - 1].size < 3 && v !== null && v !== undefined && v !== '') {
          colSamples[c - 1].add(v instanceof Date ? v.toISOString() : String(v))
        }
      }
    }

    console.log('\nper-column fingerprint:')
    header.forEach((h, i) => {
      console.log(
        `  ${String(i + 1).padStart(2)}. ${h.padEnd(28)} ` +
          `types={${[...colTypes[i]].join(',')}}  samples=[${[...colSamples[i]].slice(0, 3).join(' | ')}]`,
      )
    })

    console.log('\nrows (compact JSON):')
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const obj = {}
      for (let c = 1; c <= header.length; c++) {
        const v = row.getCell(c).value
        obj[header[c - 1]] = v instanceof Date ? v.toISOString() : v
      }
      console.log(`  row ${r - 1}: ${JSON.stringify(obj)}`)
    }
  }
})()
