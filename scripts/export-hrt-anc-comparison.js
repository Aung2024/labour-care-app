#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const ExcelJS = require('exceljs')

const ROOT = path.resolve(__dirname, '..')
const DATE = '2026-11-16'
const SOURCE = path.join(ROOT, 'docs', `hrt-vs-anc-${DATE}.json`)
const OUTPUT = path.join(ROOT, 'docs', `ANC risk comparison - ${DATE}.xlsx`)

const comparisonRows = [
  ['Total pregnant women', 'clients'],
  ['High-risk identification rate', 'rate'],
  ['Total ANC visits', 'visits'],
  ['Mean ANC visits', 'meanVisits'],
  ['Median ANC visits', 'medianVisits'],
  ['Early ANC', 'early'],
  ['Average % of Early ANC Uptake', 'earlyPercent'],
  ['ANC 4+', 'atLeast4'],
  ['Average % of ANC 4+ Uptake', 'atLeast4Percent'],
  ['ANC 8+', 'atLeast8'],
  ['Average % of ANC 8+ Uptake', 'atLeast8Percent'],
  ['Iron or folate', 'iron'],
  ['Iron %', 'ironPercent'],
  ['Delivered', 'delivered'],
  ['Delivered with ANC 4+', 'deliveredAtLeast4'],
  ['Delivered ANC 4+ %', 'deliveredAtLeast4Percent'],
  ['Delivered with PNC', 'deliveredWithPnc'],
  ['Delivered PNC %', 'deliveredPncPercent'],
  ['PNC within 2 days', 'deliveredPnc48'],
  ['PNC within 2 days %', 'deliveredPnc48Percent'],
]

const groups = [
  ['all', 'hrt', 'other'],
  ['Pyinmana', 'hrt', 'other'],
  ['Tatkon', 'hrt', 'other'],
]

const hospitalRows = [
  ['Pyinmana General Hospital (200 Bedded)', 22, 8, 14, 0, 0],
  ['Tatkon Township Hospital (100 Bedded)', 167, 74, 83, 10, 0],
  ['Shwe Myo Station Hospital (16 Bedded)', 77, 19, 57, 0, 1],
  ['Total — 3 hospitals', 266, 101, 154, 10, 1],
]

const percentageKeys = new Set([
  'rate',
  'earlyPercent',
  'atLeast4Percent',
  'atLeast8Percent',
  'ironPercent',
  'deliveredAtLeast4Percent',
  'deliveredPncPercent',
  'deliveredPnc48Percent',
])

const formatPercent = (value) => value == null ? '' : `${Number(value).toFixed(1)}%`

const styleHeader = (cell, fill = '1F4E78') => {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill}` } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
  }
}

const styleBody = (cell, align = 'right') => {
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true }
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
  }
}

const addComparisonSheet = (workbook, source) => {
  const sheet = workbook.addWorksheet('ANC comparison')
  sheet.mergeCells('A1:G1')
  sheet.getCell('A1').value = `ANC risk comparison — updated ${DATE}`
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F4E78' } }
  sheet.getCell('A1').alignment = { horizontal: 'center' }

  sheet.getCell('A2').value = 'Group'
  sheet.mergeCells('B2:C2')
  sheet.getCell('B2').value = 'Pyinmana and Tatkon'
  sheet.mergeCells('D2:E2')
  sheet.getCell('D2').value = 'Pyinmana'
  sheet.mergeCells('F2:G2')
  sheet.getCell('F2').value = 'Tatkon'
  ;['A2', 'B2', 'D2', 'F2'].forEach((cell) => styleHeader(sheet.getCell(cell)))

  const headers = [
    'Indicator',
    'High-risk list',
    'Other ANC clients',
    'High-risk list',
    'Other ANC clients',
    'High-risk list',
    'Other ANC clients',
  ]
  headers.forEach((header, index) => {
    const cell = sheet.getCell(3, index + 1)
    cell.value = header
    styleHeader(cell, '5B7189')
  })

  comparisonRows.forEach(([label, key], rowIndex) => {
    const row = rowIndex + 4
    sheet.getCell(row, 1).value = label
    styleBody(sheet.getCell(row, 1), 'left')
    groups.forEach(([group, highRiskKey, otherKey], groupIndex) => {
      const highRisk = source.groups[group][highRiskKey]
      const other = source.groups[group][otherKey]
      const values = key === 'rate'
        ? [highRisk.clients && other.clients ? highRisk.clients / other.clients : null]
        : [highRisk[key], other[key]]
      const startColumn = groupIndex * 2 + 2
      values.forEach((value, valueIndex) => {
        const cell = sheet.getCell(row, startColumn + valueIndex)
        cell.value = percentageKeys.has(key) || key === 'rate'
          ? formatPercent(key === 'rate' ? value * 100 : value)
          : value ?? ''
        styleBody(cell)
      })
    })
    if (rowIndex % 2 === 0) {
      for (let column = 1; column <= 7; column++) {
        sheet.getCell(row, column).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        }
      }
    }
  })

  sheet.getCell(25, 1).value =
    'Definition: high-risk means at least one ANC visit had the high-risk assessment marked Yes. ' +
    'High-risk identification rate = high-risk clients ÷ other ANC clients.'
  sheet.mergeCells('A25:G25')
  sheet.getCell(25, 1).font = { italic: true, size: 9, color: { argb: 'FF475569' } }
  sheet.getCell(25, 1).alignment = { wrapText: true }

  sheet.columns = [
    { width: 34 },
    { width: 16 },
    { width: 17 },
    { width: 16 },
    { width: 17 },
    { width: 16 },
    { width: 17 },
  ]
  sheet.views = [{ state: 'frozen', ySplit: 3 }]
  sheet.autoFilter = { from: 'A3', to: `G${3 + comparisonRows.length}` }
}

const addHospitalSheet = (workbook) => {
  const sheet = workbook.addWorksheet('Hospital delivery modes')
  sheet.mergeCells('A1:F1')
  sheet.getCell('A1').value = 'Hospital deliveries by mode — updated 16 November 2026'
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F4E78' } }
  sheet.getCell('A1').alignment = { horizontal: 'center' }

  const headers = [
    'Hospital',
    'Total deliveries',
    'Normal vaginal',
    'C-section',
    'Assisted vaginal',
    'Other / unknown',
  ]
  headers.forEach((header, index) => {
    const cell = sheet.getCell(3, index + 1)
    cell.value = header
    styleHeader(cell)
  })
  hospitalRows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      const cell = sheet.getCell(rowIndex + 4, columnIndex + 1)
      cell.value = value
      styleBody(cell, columnIndex === 0 ? 'left' : 'right')
      if (rowIndex === hospitalRows.length - 1) {
        cell.font = { bold: true, color: { argb: 'FF1F4E78' } }
      }
    })
  })
  sheet.getCell(9, 1).value =
    'Source: deliveryNotes records for the three configured hospital facilities. ' +
    'Other / unknown means the delivery mode was not recorded or could not be classified.'
  sheet.mergeCells('A9:F9')
  sheet.getCell(9, 1).font = { italic: true, size: 9, color: { argb: 'FF475569' } }
  sheet.getCell(9, 1).alignment = { wrapText: true }
  sheet.columns = [
    { width: 42 },
    { width: 17 },
    { width: 17 },
    { width: 14 },
    { width: 18 },
    { width: 17 },
  ]
  sheet.views = [{ state: 'frozen', ySplit: 3 }]
}

const main = async () => {
  const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'))
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MNCH analytics export'
  workbook.created = new Date()
  addComparisonSheet(workbook, source)
  addHospitalSheet(workbook)
  await workbook.xlsx.writeFile(OUTPUT)
  console.log(`Wrote ${OUTPUT}`)
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
