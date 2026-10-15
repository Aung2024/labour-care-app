#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const ExcelJS = createRequire(path.join(ROOT, 'scripts', 'package.json'))('exceljs');

const SOURCE = path.join(ROOT, 'docs', 'lcg-pilot-insights-2026-10-15.json');
const OUTPUT = path.join(ROOT, 'docs', 'LCG three hospitals - 2026-10-15.xlsx');
const CODES = ['024', '007', '023'];
const SHORT_NAME = {
  '024': 'Shwe Myo Hospital',
  '007': 'Pyinmana General Hospital',
  '023': 'Tatkon Township Hospital',
};

function pct(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function styleHeader(cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

function styleBody(cell, align) {
  cell.alignment = { vertical: 'middle', horizontal: align || 'center', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
  };
}

function addSheet(workbook, name, headers, rows, options) {
  const sheet = workbook.addWorksheet(name);
  const aligns = (options && options.aligns) || [];
  headers.forEach((header, index) => {
    const cell = sheet.getCell(1, index + 1);
    cell.value = header;
    styleHeader(cell);
    sheet.getColumn(index + 1).width = (options && options.widths && options.widths[index]) || 18;
  });
  sheet.getRow(1).height = 32;
  rows.forEach((row, rowIndex) => {
    row.forEach((value, index) => {
      const cell = sheet.getCell(rowIndex + 2, index + 1);
      cell.value = value === null || value === undefined ? '' : value;
      styleBody(cell, aligns[index] || (index === 0 ? 'left' : 'center'));
    });
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
  return sheet;
}

function show(value) {
  return value === null || value === undefined ? '' : value;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

async function main() {
  const report = require(SOURCE);
  const facilities = CODES.map((code) => {
    const row = report.scan.byCreatorFacility.facilities.find((item) => item.facilityCode === code);
    if (!row) throw new Error(`Missing facility ${code}`);
    return row;
  });
  const dashboardAll = new Map(
    report.dashboard.rows
      .filter((row) => row.period === 'all' && CODES.includes(row.facilityCode))
      .map((row) => [row.facilityCode, row])
  );

  const notes = sum(facilities, 'deliveryNotes');
  const both = sum(facilities, 'bothAmongNotes');
  const first = sum(facilities, 'firstStage');
  const startedNotes = sum(facilities, 'firstAmongNotes');
  const noStage = sum(facilities, 'notesWithoutStage');
  const mothers = sum(facilities, 'mothers');
  const shweMyo = facilities.find((row) => row.facilityCode === '024');
  const restNotes = notes - shweMyo.deliveryNotes;
  const restBoth = both - shweMyo.bothAmongNotes;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MNCH LCG extract';
  const readme = workbook.addWorksheet('How to read');
  const notesText = [
    'LCG briefing for three hospitals only. Database mnch-1cbda. Extract date 15 October 2026.',
    'Hospitals: Shwe Myo Station Hospital, 16 bedded (code 024); Pyinmana General Hospital, 200 bedded (code 007); Tatkon Township Hospital, 100 bedded (code 023).',
    'Mothers created by Midwife accounts at these facilities. Baby records excluded. No patient names.',
    'LCG timing means both the active first-stage time and the second-stage time are saved on a completed Delivery Note. This is the same rule as the in-app dashboard.',
    'These three hospitals together are not the whole Pyinmana and Tatkon pilot. Rural health centres are excluded.',
    `Together: ${both} of ${notes} delivery notes have both stage times (${pct(both, notes)}%). Shwe Myo Hospital is ${shweMyo.bothAmongNotes} of those ${both}. The other two hospitals together are ${restBoth} of ${restNotes} (${pct(restBoth, restNotes)}%).`,
    'A chart with a first-stage time usually has one time column. Cervix, baseline fetal heart rate, and the shared plan are separate from the timing percentage.',
    'Uterotonic on the Delivery Note is not the same as oxytocin written on the LCG medication row.',
    'Birth attendant is blank on these delivery notes. Do not quote the dashboard skilled-attendant line.',
    'October 2026 is partial through 15 October. LCG entry is online-only, so a missing chart can be a network gap during labour.',
  ];
  notesText.forEach((text, index) => {
    readme.mergeCells(index + 1, 1, index + 1, 6);
    readme.getCell(index + 1, 1).value = text;
    readme.getCell(index + 1, 1).alignment = { wrapText: true, vertical: 'middle' };
    readme.getRow(index + 1).height = 32;
  });
  readme.getColumn(1).width = 120;

  addSheet(workbook, 'Three hospitals', [
    'Hospital', 'Code', 'Mothers', 'Delivery notes', 'First stage on a note', 'Both stage times',
    'LCG timing %', 'Notes with no stage time', 'Started labours', 'Reached second stage %',
    'Any observation % of started', 'Baseline FHR % of started', 'Cervix % of started',
    'Assessment or plan % of started', 'Median time columns', 'Uterotonic on delivery note', 'Uterotonic %',
  ], facilities.map((row) => {
    const dash = dashboardAll.get(row.facilityCode) || {};
    return [
      SHORT_NAME[row.facilityCode],
      row.facilityCode,
      row.mothers,
      row.deliveryNotes,
      row.firstAmongNotes,
      row.bothAmongNotes,
      show(row.rates.lcgOfNotes),
      row.notesWithoutStage,
      row.firstStage,
      show(row.rates.bothOfStarted),
      show(row.rates.observationOfStarted),
      show(row.rates.baselineFhrOfStarted),
      show(row.rates.cervixOfStarted),
      show(row.rates.sdmPlanOfStarted),
      row.rates.medianTimepoints === null ? '' : row.rates.medianTimepoints,
      dash.uterotonic || 0,
      show(dash.uterotonicPercent),
    ];
  }).concat([[
    'Three hospitals',
    '',
    mothers,
    notes,
    startedNotes,
    both,
    show(pct(both, notes)),
    noStage,
    first,
    show(pct(sum(facilities, 'bothStages'), first)),
    '',
    show(pct(sum(facilities, 'baselineFhrMothers'), first)),
    show(pct(sum(facilities, 'cervixAmongStarted'), first)),
    show(pct(sum(facilities, 'sdmPlanAmongStarted'), first)),
    '',
    [...dashboardAll.values()].reduce((total, row) => total + (row.uterotonic || 0), 0),
    show(pct(
      [...dashboardAll.values()].reduce((total, row) => total + (row.uterotonic || 0), 0),
      [...dashboardAll.values()].reduce((total, row) => total + (row.completedNotes || 0), 0)
    )),
  ]]), {
    widths: [28, 10, 12, 16, 22, 18, 14, 24, 16, 22, 28, 24, 20, 32, 20, 26, 14],
  });

  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  addSheet(workbook, 'Monthly', [
    'Month', 'Shwe Myo notes', 'Shwe Myo both stages', 'Shwe Myo %',
    'Pyinmana notes', 'Pyinmana both stages', 'Pyinmana %',
    'Tatkon Township notes', 'Tatkon Township both stages', 'Tatkon Township %',
    'Three hospitals notes', 'Three hospitals both stages', 'Three hospitals %',
  ], months.map((month) => {
    const cells = CODES.map((code) => {
      const facility = facilities.find((row) => row.facilityCode === code);
      return facility.months.find((item) => item.month === month) || {
        deliveryNotes: 0, bothAmongNotes: 0, lcgPercent: null,
      };
    });
    const monthNotes = cells.reduce((total, item) => total + item.deliveryNotes, 0);
    const monthBoth = cells.reduce((total, item) => total + item.bothAmongNotes, 0);
    return [
      month === '2026-10' ? '2026-10 (through 15 Oct)' : month,
      cells[0].deliveryNotes, cells[0].bothAmongNotes, show(cells[0].deliveryNotes ? cells[0].lcgPercent : null),
      cells[1].deliveryNotes, cells[1].bothAmongNotes, show(cells[1].deliveryNotes ? cells[1].lcgPercent : null),
      cells[2].deliveryNotes, cells[2].bothAmongNotes, show(cells[2].deliveryNotes ? cells[2].lcgPercent : null),
      monthNotes, monthBoth, show(pct(monthBoth, monthNotes)),
    ];
  }), {
    widths: [24, 16, 22, 14, 16, 22, 14, 24, 28, 20, 22, 28, 20],
  });

  addSheet(workbook, 'Mode of delivery', [
    'Hospital', 'Mode', 'Delivery notes', 'Both stage times', 'LCG timing %',
  ], facilities.flatMap((row) => row.modes.map((mode) => [
    SHORT_NAME[row.facilityCode],
    mode.mode,
    mode.deliveryNotes,
    mode.bothAmongNotes,
    show(mode.lcgPercent),
  ])), { widths: [28, 24, 16, 18, 16] });

  const sectionRows = [
    ['Supportive care', 'support'],
    ['Fetal heart field, any cell', 'fhr'],
    ['Baseline fetal heart rate', 'baseline'],
    ['Fetal condition', 'baby'],
    ['Woman vitals', 'woman'],
    ['Contractions', 'contractions'],
    ['Cervix plot', 'cervix'],
    ['Descent plot', 'descent'],
    ['Medication row', 'meds'],
    ['Shared decision-making', 'sdm'],
    ['Assessment or plan', 'plan'],
  ];
  addSheet(workbook, 'WHO sections', [
    'Section',
    'Shwe Myo started', 'Shwe Myo with section', 'Shwe Myo %',
    'Pyinmana started', 'Pyinmana with section', 'Pyinmana %',
    'Tatkon Township started', 'Tatkon Township with section', 'Tatkon Township %',
  ], sectionRows.map(([label, key]) => {
    const values = facilities.map((row) => {
      if (key === 'baseline') return [row.firstStage, row.baselineFhrMothers];
      if (key === 'plan') return [row.firstStage, row.sdmPlanAmongStarted];
      return [row.firstStage, row.sectionsAmongStarted[key]];
    });
    return [
      label,
      values[0][0], values[0][1], show(pct(values[0][1], values[0][0])),
      values[1][0], values[1][1], show(pct(values[1][1], values[1][0])),
      values[2][0], values[2][1], show(pct(values[2][1], values[2][0])),
    ];
  }), {
    widths: [32, 18, 22, 14, 18, 22, 14, 26, 28, 20],
  });

  addSheet(workbook, 'Supportive care', [
    'Hospital', 'Item', 'Labours with a value', 'At least one Yes or mobile', 'Percent of recorded',
  ], facilities.flatMap((row) => [
    [SHORT_NAME[row.facilityCode], 'Companion', row.companionRecorded, row.companionYes, show(row.rates.companionYesOfRecorded)],
    [SHORT_NAME[row.facilityCode], 'Pain relief', row.painRecorded, row.painYes, show(row.rates.painYesOfRecorded)],
    [SHORT_NAME[row.facilityCode], 'Oral fluids', row.oralRecorded, row.oralYes, show(row.rates.oralYesOfRecorded)],
    [SHORT_NAME[row.facilityCode], 'Mobility (mobile)', row.mobilityRecorded, row.mobilityMobile, show(row.rates.mobilityOfRecorded)],
    [SHORT_NAME[row.facilityCode], 'Oxytocin text on the LCG', row.firstStage, row.oxytocinOnLcg, show(pct(row.oxytocinOnLcg, row.firstStage))],
  ]), { widths: [28, 28, 24, 32, 22] });

  addSheet(workbook, 'What to say', [
    'Point', 'Talking line',
  ], [
    ['1', `Across these three hospitals, ${both} of ${notes} delivery notes (${pct(both, notes)}%) have both LCG stage times.`],
    ['2', `Shwe Myo Hospital is ${shweMyo.bothAmongNotes} of ${shweMyo.deliveryNotes} (${shweMyo.rates.lcgOfNotes}%), and ${shweMyo.bothAmongNotes} of the ${both} timed labours at these three hospitals.`],
    ['3', `Pyinmana General Hospital is ${facilities[1].bothAmongNotes} of ${facilities[1].deliveryNotes} (${facilities[1].rates.lcgOfNotes}%). Tatkon Township Hospital is ${facilities[2].bothAmongNotes} of ${facilities[2].deliveryNotes} (${facilities[2].rates.lcgOfNotes}%). Together, without Shwe Myo, that is ${restBoth} of ${restNotes} (${pct(restBoth, restNotes)}%).`],
    ['4', 'At Pyinmana General Hospital the guide is opened more often than the timing percentage shows: 8 of 21 notes have a first-stage time, and 3 reach second stage. Caesarean notes are 0 of 14. Vaginal notes are 3 of 7. When they start, cervix and baseline fetal heart rate are on 7 of 8 labours.'],
    ['5', 'At Tatkon Township Hospital, July was 6 timed notes, August 1, and September 0. Mode of birth does not explain it: caesarean 3 of 83, vaginal 3 of 74.'],
    ['6', 'At Shwe Myo, stage times have stayed above 92% every month since June, for caesarean and vaginal births. The median chart still has 1 time column. Baseline fetal heart rate is on 14 of 62 started labours. Cervix is on 19 of 62. Pain relief is Yes on 14 of 60.'],
    ['7', 'Uterotonic on the delivery note is high at all three hospitals. Oxytocin on the LCG medication row is rare. Do not treat those as the same indicator.'],
    ['8', 'Do not rank these hospitals with a penalty. The official percentage is a timing flag, LCG is online-only, and one hospital produces almost all of the timed labours.'],
  ], { widths: [10, 140], aligns: ['center', 'left'] });

  await workbook.xlsx.writeFile(OUTPUT);
  console.log(`Wrote ${OUTPUT}`);
  console.log(`Three hospitals: ${both}/${notes} (${pct(both, notes)}%)`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
