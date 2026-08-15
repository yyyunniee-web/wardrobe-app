/**
 * purchaseDate → season 规则评估（不调用 Vision，不改生产）
 * node --experimental-strip-types scripts/ai-evaluation/run-season-rule-eval.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { EVAL_ROOT, listImageRecognitionCases } from './lib/dataset.ts';

/** 12,1,2=冬；3,4,5=春；6,7,8=夏；9,10,11=秋 */
export function seasonFromPurchaseDate(purchaseDate: string): string | null {
  const s = String(purchaseDate || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  if (month === 12 || month === 1 || month === 2) return '冬';
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  return '秋';
}

type DiffKind = 'match' | 'mismatch' | 'missing_label' | 'invalid_date';

function classify(calculated: string | null, labelSeason: unknown): DiffKind {
  const label = labelSeason == null || labelSeason === '' ? '' : String(labelSeason);
  if (!calculated) return 'invalid_date';
  if (!label) return 'missing_label';
  return calculated === label ? 'match' : 'mismatch';
}

function main() {
  const cases = listImageRecognitionCases();
  if (!cases.length) {
    console.error('no image-recognition labels');
    process.exit(1);
  }

  const rows = cases.map((c) => {
    const purchaseDate =
      c.label.purchaseDate == null || c.label.purchaseDate === ''
        ? ''
        : String(c.label.purchaseDate);
    const labelSeason =
      c.label.season == null || c.label.season === '' ? '' : String(c.label.season);
    const calculatedSeason = purchaseDate ? seasonFromPurchaseDate(purchaseDate) : null;
    const diff = classify(calculatedSeason, labelSeason);
    return {
      id: c.id,
      purchaseDate: purchaseDate || '(空)',
      calculatedSeason: calculatedSeason || '(无法计算)',
      labelSeason: labelSeason || '(空)',
      diff,
    };
  });

  const counts = {
    match: rows.filter((r) => r.diff === 'match').length,
    mismatch: rows.filter((r) => r.diff === 'mismatch').length,
    missing_label: rows.filter((r) => r.diff === 'missing_label').length,
    invalid_date: rows.filter((r) => r.diff === 'invalid_date').length,
  };

  const lines: string[] = [];
  lines.push('# purchaseDate → season 规则评估');
  lines.push('');
  lines.push('- **输入:** `datasets/image-recognition/labels/*.json` 的 `purchaseDate`');
  lines.push('- **不调用** Vision / OCR / Worker');
  lines.push('- **不改** 生产代码');
  lines.push('');
  lines.push('## 规则');
  lines.push('');
  lines.push('| 月份 | season |');
  lines.push('|------|--------|');
  lines.push('| 12, 1, 2 | 冬 |');
  lines.push('| 3, 4, 5 | 春 |');
  lines.push('| 6, 7, 8 | 夏 |');
  lines.push('| 9, 10, 11 | 秋 |');
  lines.push('');
  lines.push('## 结果');
  lines.push('');
  lines.push('| case | purchaseDate | calculatedSeason | label season | diff |');
  lines.push('|------|--------------|------------------|--------------|------|');
  for (const r of rows) {
    lines.push(
      `| ${r.id} | ${r.purchaseDate} | ${r.calculatedSeason} | ${r.labelSeason} | \`${r.diff}\` |`,
    );
  }
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push(`- match: **${counts.match}**`);
  lines.push(`- mismatch: **${counts.mismatch}**`);
  lines.push(`- missing_label: **${counts.missing_label}**`);
  lines.push(`- invalid_date: **${counts.invalid_date}**`);
  lines.push('');
  lines.push('## 产品预期备注');
  lines.push('');
  lines.push(
    '- 若 label `season` 为「全年」或人工季节判断（非购买月映射），会出现 `mismatch`，属预期差异，不代表日期解析错误。',
  );
  lines.push(
    '- 本规则仅评估「购买月份 → 默认季节」是否可作入库默认值；最终是否覆盖用户/AI 季节需产品另定。',
  );
  lines.push('');

  const mdPath = path.join(EVAL_ROOT, 'reports/season-rule-eval.md');
  fs.writeFileSync(mdPath, lines.join('\n'));
  console.log('cases=', rows.length);
  console.log(JSON.stringify(counts));
  console.log('report:', mdPath);
}

main();
