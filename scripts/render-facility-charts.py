#!/usr/bin/env python3
"""Render ministry briefing charts from JSON on stdin."""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

NAVY = '#1F4E78'
TEAL = '#0F766E'
AMBER = '#B45309'
SLATE = '#334155'
GREEN = '#047857'
RED = '#B91C1C'


def style_axes(ax):
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.tick_params(colors=SLATE, labelsize=9)
    ax.yaxis.label.set_color(SLATE)
    ax.xaxis.label.set_color(SLATE)
    ax.grid(axis='y', linestyle=':', alpha=0.4)


def save(fig, path):
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches='tight', facecolor='white')
    plt.close(fig)


def main():
    payload = json.load(sys.stdin)
    out_dir = Path(payload['outDir'])
    out_dir.mkdir(parents=True, exist_ok=True)
    townships = payload['townships']
    labels = [row['township'] for row in townships]
    top = payload['topFacilities']
    coverage = payload['coverage']

    fig, ax = plt.subplots(figsize=(8.2, 4.2))
    mothers = [row['mothers'] for row in townships]
    babies = [row['babies'] for row in townships]
    ax.bar(labels, mothers, color=NAVY, label='Mothers')
    ax.bar(labels, babies, bottom=mothers, color=TEAL, label='Babies')
    ax.set_title('Registered patients by township (mothers + babies)', color=NAVY, fontsize=12, pad=10)
    ax.set_ylabel('Patients')
    ax.legend(frameon=False)
    style_axes(ax)
    save(fig, out_dir / 'registered-by-township.png')

    fig, ax = plt.subplots(figsize=(8.2, 4.2))
    width = 0.18
    x = range(len(labels))
    series = [
        ('ANC headcount', [row['ancHeadcount'] for row in townships], NAVY),
        ('Deliveries', [row['deliveries'] for row in townships], TEAL),
        ('PNC headcount', [row['pncHeadcount'] for row in townships], AMBER),
        ('NBC headcount', [row['nbcHeadcount'] for row in townships], GREEN),
    ]
    for i, (name, values, color) in enumerate(series):
        ax.bar([v + (i - 1.5) * width for v in x], values, width=width, label=name, color=color)
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_title('Continuum of care by township', color=NAVY, fontsize=12, pad=10)
    ax.set_ylabel('Count')
    ax.legend(frameon=False, ncol=2, fontsize=8)
    style_axes(ax)
    save(fig, out_dir / 'continuum-by-township.png')

    fig, ax = plt.subplots(figsize=(8.2, 4.2))
    names = [row['label'] for row in coverage]
    values = [row['value'] for row in coverage]
    colors = [NAVY, TEAL, AMBER, GREEN, RED, SLATE][:len(names)]
    bars = ax.barh(names, values, color=colors)
    ax.set_xlim(0, 100)
    ax.set_xlabel('%')
    ax.set_title('Service coverage among eligible clients', color=NAVY, fontsize=12, pad=10)
    for bar, value in zip(bars, values):
        ax.text(value + 1.2, bar.get_y() + bar.get_height() / 2, f'{value:.1f}%', va='center', fontsize=9, color=SLATE)
    style_axes(ax)
    ax.grid(axis='x', linestyle=':', alpha=0.4)
    ax.grid(axis='y', visible=False)
    save(fig, out_dir / 'coverage-rates.png')

    fig, ax = plt.subplots(figsize=(8.2, 4.8))
    names = [row['facility'] for row in top][::-1]
    values = [row['registered'] for row in top][::-1]
    ax.barh(names, values, color=NAVY)
    ax.set_title('Highest-volume facilities (total registered)', color=NAVY, fontsize=12, pad=10)
    ax.set_xlabel('Registered patients')
    style_axes(ax)
    ax.grid(axis='x', linestyle=':', alpha=0.4)
    ax.grid(axis='y', visible=False)
    save(fig, out_dir / 'top-facilities.png')

    print(str(out_dir))


if __name__ == '__main__':
    main()
