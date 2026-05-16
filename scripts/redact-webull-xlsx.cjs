// One-shot script: redact Webull Desktop XLSX fixture by replacing the
// User ID column with a placeholder, then save with a descriptive filename.
//
// Mode A (no --write): read-only inspection — prints sheet name, header row,
// row count, and the unique User ID values seen. Use this first to confirm
// the source file's exact column header before redacting.
//
// Mode B (--write):  copies the source XLSX with the User ID column
// overwritten by REDACTED_USER_ID. Other columns untouched.
//
// Usage:
//   node scripts/redact-webull-xlsx.cjs                          # inspect
//   node scripts/redact-webull-xlsx.cjs --write                  # redact + save
//   node scripts/redact-webull-xlsx.cjs --write --verify         # redact, save, re-read to confirm

const path = require('node:path')
const fs = require('node:fs')
const ExcelJS = require('exceljs')

const REPO = path.resolve(__dirname, '..')
const SRC = path.join(REPO, 'test-fixtures', 'c60adca70675446d897b7301393dd1d0.xlsx')
const DST = path.join(REPO, 'test-fixtures', 'webull-desktop-paper-2026-05-14.xlsx')
const REDACTED_USER_ID = '100000000'

const wantWrite = process.argv.includes('--write')
const wantVerify = process.argv.includes('--verify')

async function loadWorkbook(filePath) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  return wb
}

function describeSheet(ws) {
  const header = []
  const headerRow = ws.getRow(1)
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    header[col - 1] = cell.value
  })
  return { name: ws.name, rowCount: ws.rowCount, header }
}

async function inspect() {
  const wb = await loadWorkbook(SRC)
  console.log(`source: ${SRC}`)
  console.log(`sheets: ${wb.worksheets.map((w) => w.name).join(', ')}`)
  for (const ws of wb.worksheets) {
    const info = describeSheet(ws)
    console.log(`\n── sheet: ${info.name} (${info.rowCount} rows) ──`)
    console.log('header:')
    info.header.forEach((h, i) => console.log(`  col ${i + 1}: ${JSON.stringify(h)}`))
    // Find User ID column by header text
    const userIdCol = info.header.findIndex(
      (h) => typeof h === 'string' && /user\s*id/i.test(h),
    )
    if (userIdCol === -1) {
      console.log('  (no User ID column matched by header text)')
    } else {
      const colNum = userIdCol + 1
      const values = new Set()
      for (let r = 2; r <= ws.rowCount; r++) {
        const v = ws.getRow(r).getCell(colNum).value
        if (v !== null && v !== undefined && v !== '') values.add(String(v))
      }
      console.log(`  User ID column index: ${colNum}`)
      console.log(`  unique User ID values: ${[...values].join(', ')}`)
    }
  }
}

async function redact() {
  if (fs.existsSync(DST)) {
    console.error(`destination already exists, refusing to overwrite: ${DST}`)
    process.exit(1)
  }
  const wb = await loadWorkbook(SRC)
  let touchedRows = 0
  for (const ws of wb.worksheets) {
    const info = describeSheet(ws)
    const userIdCol = info.header.findIndex(
      (h) => typeof h === 'string' && /user\s*id/i.test(h),
    )
    if (userIdCol === -1) continue
    const colNum = userIdCol + 1
    for (let r = 2; r <= ws.rowCount; r++) {
      const cell = ws.getRow(r).getCell(colNum)
      if (cell.value === null || cell.value === undefined || cell.value === '') continue
      cell.value = REDACTED_USER_ID
      touchedRows += 1
    }
  }
  await wb.xlsx.writeFile(DST)
  console.log(`wrote: ${DST}`)
  console.log(`User ID cells redacted: ${touchedRows}`)
}

async function verify() {
  const wb = await loadWorkbook(DST)
  for (const ws of wb.worksheets) {
    const info = describeSheet(ws)
    const userIdCol = info.header.findIndex(
      (h) => typeof h === 'string' && /user\s*id/i.test(h),
    )
    if (userIdCol === -1) continue
    const colNum = userIdCol + 1
    const values = new Set()
    for (let r = 2; r <= ws.rowCount; r++) {
      const v = ws.getRow(r).getCell(colNum).value
      if (v !== null && v !== undefined && v !== '') values.add(String(v))
    }
    console.log(`verify [${ws.name}]: unique User ID values now → ${[...values].join(', ')}`)
    if (values.size === 1 && values.has(REDACTED_USER_ID)) {
      console.log(`  ✓ uniform redaction confirmed`)
    } else {
      console.log(`  ✗ unexpected — should be exactly { ${REDACTED_USER_ID} }`)
      process.exitCode = 1
    }
  }
}

;(async () => {
  try {
    if (!wantWrite) {
      await inspect()
    } else {
      await redact()
      if (wantVerify) await verify()
    }
  } catch (e) {
    console.error(e.stack || e)
    process.exit(1)
  }
})()
