#!/usr/bin/env python3
"""Convert the six-month facility activity CSV into an Excel workbook with charts."""

import csv
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import LineChart, Reference
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
DATE = "2026-11-17"
INPUT = ROOT / "docs" / f"Facility activity monthly trend - {DATE}.csv"
OUTPUT = ROOT / "docs" / f"Facility activity monthly trend - {DATE}.xlsx"


def read_csv():
    with INPUT.open(newline="", encoding="utf-8") as file:
        rows = list(csv.reader(file))
    header_index = next(index for index, row in enumerate(rows) if row and row[0] == "No.")
    return rows[header_index], rows[header_index + 1:]


def style_header(row, fill="1F4E78"):
    for cell in row:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=fill)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def style_body(row):
    for cell in row:
        cell.alignment = Alignment(horizontal="left" if cell.column <= 4 else "right", vertical="center")


def main():
    headers, source_rows = read_csv()
    month_headers = [header.replace(" activity records", "") for header in headers[4:10]]

    workbook = Workbook()
    summary = workbook.active
    summary.title = "Monthly summary"
    detail = workbook.create_sheet("Facility detail")

    summary["A1"] = f"Facility activity monthly trend — {DATE}"
    summary["A1"].font = Font(bold=True, size=16, color="1F4E78")
    summary.merge_cells("A1:D1")
    summary["A2"] = "Source: saved registration and clinical activity records attributed to Pyinmana/Tatkon facilities."
    summary["A2"].font = Font(italic=True, color="475569")
    summary.merge_cells("A2:D2")

    summary_headers = ["Month", "Total activity records", "Facilities with activity", "Total facilities"]
    for column, value in enumerate(summary_headers, start=1):
        summary.cell(row=4, column=column, value=value)
    style_header(summary[4])

    for month_index, month in enumerate(month_headers, start=1):
        activity_column = 5 + month_index - 1
        total = sum(int(row[activity_column]) for row in source_rows)
        active = sum(int(row[activity_column]) > 0 for row in source_rows)
        summary.cell(row=4 + month_index, column=1, value=month)
        summary.cell(row=4 + month_index, column=2, value=total)
        summary.cell(row=4 + month_index, column=3, value=active)
        summary.cell(row=4 + month_index, column=4, value=len(source_rows))
        style_body(summary[4 + month_index])

    chart = LineChart()
    chart.title = "Monthly facility activity trend"
    chart.y_axis.title = "Count"
    chart.x_axis.title = "Month"
    chart.style = 13
    chart.height = 10
    chart.width = 20
    chart_data = Reference(summary, min_col=2, max_col=3, min_row=4, max_row=10)
    chart_categories = Reference(summary, min_col=1, min_row=5, max_row=10)
    chart.add_data(chart_data, titles_from_data=True)
    chart.set_categories(chart_categories)
    chart.legend.position = "b"
    summary.add_chart(chart, "F4")

    summary["A13"] = "Chart interpretation"
    summary["A13"].font = Font(bold=True, color="1F4E78")
    summary["A14"] = "Total activity records counts saved activity events. Facilities with activity counts distinct facilities with at least one event in that month."
    summary["A14"].alignment = Alignment(wrap_text=True)
    summary.merge_cells("A14:D15")

    township = workbook.create_sheet("Township comparison")
    township["A1"] = f"Pyinmana and Tatkon activity comparison — {DATE}"
    township["A1"].font = Font(bold=True, size=16, color="1F4E78")
    township.merge_cells("A1:E1")
    township["A2"] = "Monthly activity records and facilities with at least one activity event."
    township["A2"].font = Font(italic=True, color="475569")
    township.merge_cells("A2:E2")
    township_headers = [
        "Month",
        "Pyinmana activity records",
        "Tatkon activity records",
        "Pyinmana active facilities",
        "Tatkon active facilities",
    ]
    for column, value in enumerate(township_headers, start=1):
        township.cell(row=4, column=column, value=value)
    style_header(township[4])

    pyinmana_rows = [row for row in source_rows if row[1] == "Pyinmana"]
    tatkon_rows = [row for row in source_rows if row[1] == "Tatkon"]
    for month_index, month in enumerate(month_headers, start=1):
        activity_column = 5 + month_index - 1
        values = [
            month,
            sum(int(row[activity_column]) for row in pyinmana_rows),
            sum(int(row[activity_column]) for row in tatkon_rows),
            sum(int(row[activity_column]) > 0 for row in pyinmana_rows),
            sum(int(row[activity_column]) > 0 for row in tatkon_rows),
        ]
        for column, value in enumerate(values, start=1):
            township.cell(row=4 + month_index, column=column, value=value)
        style_body(township[4 + month_index])

    township_chart = LineChart()
    township_chart.title = "Monthly activity records: Pyinmana vs Tatkon"
    township_chart.y_axis.title = "Activity records"
    township_chart.x_axis.title = "Month"
    township_chart.style = 13
    township_chart.height = 10
    township_chart.width = 20
    township_chart.add_data(
        Reference(township, min_col=2, max_col=3, min_row=4, max_row=10),
        titles_from_data=True,
    )
    township_chart.set_categories(Reference(township, min_col=1, min_row=5, max_row=10))
    township_chart.legend.position = "b"
    township.add_chart(township_chart, "G4")

    active_chart = LineChart()
    active_chart.title = "Active facilities: Pyinmana vs Tatkon"
    active_chart.y_axis.title = "Facilities"
    active_chart.x_axis.title = "Month"
    active_chart.style = 12
    active_chart.height = 10
    active_chart.width = 20
    active_chart.add_data(
        Reference(township, min_col=4, max_col=5, min_row=4, max_row=10),
        titles_from_data=True,
    )
    active_chart.set_categories(Reference(township, min_col=1, min_row=5, max_row=10))
    active_chart.legend.position = "b"
    township.add_chart(active_chart, "G24")

    for column, value in enumerate(headers, start=1):
        detail.cell(row=1, column=column, value=value)
    style_header(detail[1])
    for row_index, source_row in enumerate(source_rows, start=2):
        for column, value in enumerate(source_row, start=1):
            cell = detail.cell(row=row_index, column=column)
            if column in range(1, 4) or column in range(5, 11) or column == 11:
                try:
                    cell.value = int(value)
                except ValueError:
                    cell.value = value
            else:
                cell.value = value
        style_body(detail[row_index])
    detail.freeze_panes = "E2"
    detail.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{len(source_rows) + 1}"

    for worksheet in (summary, detail, township):
        worksheet.sheet_view.showGridLines = False
        worksheet.freeze_panes = "A5" if worksheet is summary else worksheet.freeze_panes
        for column in range(1, worksheet.max_column + 1):
            worksheet.column_dimensions[get_column_letter(column)].width = 18
    township.freeze_panes = "A5"
    for column in range(1, township.max_column + 1):
        township.column_dimensions[get_column_letter(column)].width = 24
    summary.column_dimensions["A"].width = 32
    detail.column_dimensions["D"].width = 38
    summary.row_dimensions[1].height = 26
    detail.row_dimensions[1].height = 32

    workbook.properties.creator = "MNCH analytics export"
    workbook.properties.created = datetime.now()
    workbook.save(OUTPUT)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
