/**
 * Beta2.1 merge isolation（评测专用，不改 src/**）
 *
 * 基于生产 AI_PROMPT 原文，只追加三条 category 商品主体优先规则；
 * 不用 category-product-focus-exp.txt 全文。
 * purchaseDate：现有 OCR merge（B 侧）。
 *
 * A = Beta1 production（Vision-only）
 * B = Beta2.1 minimal patch（prod + 3 rules + OCR date）
 *
 * node --experimental-strip-types scripts/ai-evaluation/run-beta21-merge-isolation.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  EVAL_ROOT,
  fieldDiff,
  listWardrobeEntryCases,
  loadAIPromptFromApp,
  loadConfig,
  resolveCompareTarget,
  resolvePurchaseDateActual,
  tryParseJsonObject,
  type DiffKind,
  type FieldDiffEntry,
  type LabelJson,
} from './lib/dataset.ts';
import { callWorkerVision, uploadEvalImage } from './lib/vision-client.ts';
import { extractPurchaseDateFromOcr } from './ocr/extract-purchase-date.ts';

const REPORT = path.join(EVAL_ROOT, 'reports/beta2.1-merge-isolation.md');
const OCR_BIN = path.join(EVAL_ROOT, 'ocr/vision-ocr');
const OCR_SWIFT = path.join(EVAL_ROOT, 'ocr/vision-ocr.swift');
const FIELDS = ['category', 'color', 'price', 'purchaseDate'] as const;

/** 最小增量：仅三条商品主体优先规则（不扩 enum、不换全文 prompt） */
const PRODUCT_FOCUS_PATCH = [
  '',
  '【category 商品主体优先·最小增量】',
  '1. category 判断以商品本体为准，不以模特穿搭、场景、搭配物为准。',
  '2. 文胸 / bra / 内衣 / 胸衣 / 运动内衣必须归类为「内衣」。',
  '3. 即使模特穿着环境出现裙子、裤子，也不能改变商品主体 category。',
].join('\n');

type Status = DiffKind | 'exact' | 'unlabeled';
type ArmId = 'A' | 'B';

type ArmCase = {
  prediction: Record<string, string>;
  parseOk: boolean;
  visionOk: boolean;
  fieldStatus: Record<string, Status>;
  diffs: FieldDiffEntry[];
};

type CaseRow = {
  id: string;
  label: LabelJson;
  A: ArmCase;
  B: ArmCase;
  ocrPurchaseDate: string;
};

function empty(v: unknown): string {
  return v == null || v === '' ? '' : String(v);
}

function ensureOcr(): void {
  if (fs.existsSync(OCR_BIN)) return;
  const r = spawnSync('swiftc', ['-O', OCR_SWIFT, '-o', OCR_BIN], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`swiftc failed: ${r.stderr || r.stdout}`);
}

function runOcr(imagePath: string): string {
  const r = spawnSync(OCR_BIN, [imagePath], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`ocr failed: ${r.stderr || r.stdout}`);
  return String(r.stdout || '').trim();
}

function extractFields(parsed: Record<string, unknown> | null): Record<string, string> {
  if (!parsed) return { category: '', color: '', price: '', purchaseDate: '' };
  const { compareSource, target } = resolveCompareTarget(parsed);
  const item = target || {};
  const { actual: pd } = resolvePurchaseDateActual(parsed, target, compareSource);
  return {
    category: empty(item.category),
    color: empty(item.color),
    price: empty(item.price),
    purchaseDate: empty(pd),
  };
}

function labelSlice(label: LabelJson): LabelJson {
  const out: LabelJson = {};
  for (const k of FIELDS) {
    if (k in label) out[k] = label[k];
  }
  return out;
}

function usable(st: Status): boolean {
  return st === 'exact' || st === 'format_mismatch' || st === 'semantic_match';
}

function score(label: LabelJson, pred: Record<string, string>, parseOk: boolean): ArmCase {
  const { diffs } = fieldDiff(label, parseOk ? { ...pred, items: [] } : null);
  const fieldStatus: Record<string, Status> = {};
  for (const k of FIELDS) {
    if (!(k in label) || label[k] === '' || label[k] == null) {
      fieldStatus[k] = 'unlabeled';
      continue;
    }
    const d = diffs.find((x) => x.field === k);
    fieldStatus[k] = d ? d.kind : 'exact';
  }
  return { prediction: pred, parseOk, visionOk: true, diffs, fieldStatus };
}

function metrics(rows: CaseRow[], arm: ArmId) {
  const byField: Record<string, { labeled: number; usable: number }> = {};
  for (const f of FIELDS) byField[f] = { labeled: 0, usable: 0 };
  let parseOk = 0;
  for (const r of rows) {
    if (r[arm].parseOk) parseOk++;
    for (const f of FIELDS) {
      const st = r[arm].fieldStatus[f];
      if (st === 'unlabeled') continue;
      byField[f].labeled++;
      if (usable(st)) byField[f].usable++;
    }
  }
  return { byField, parseOk, n: rows.length };
}

function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

async function visionOnce(
  apiBase: string,
  timeoutMs: number,
  imagePath: string,
  prompt: string,
) {
  const up = await uploadEvalImage(apiBase, imagePath, timeoutMs);
  if (!up.ok) throw new Error(up.error);
  const vision = await callWorkerVision(apiBase, up.url, prompt, timeoutMs);
  const parsed = vision.ok ? tryParseJsonObject(vision.text) : null;
  return {
    visionOk: vision.ok,
    parseOk: !!parsed,
    fields: extractFields(parsed),
  };
}

function render(
  rows: CaseRow[],
  meta: { runId: string; prodVer: string; beta21Ver: string },
) {
  const mA = metrics(rows, 'A');
  const mB = metrics(rows, 'B');
  const lines: string[] = [];

  lines.push('# Beta2.1 merge isolation');
  lines.push('');
  lines.push('验证：**最小增量规则**（生产原文 + 三条 product-focus + OCR date）是否导致 color/price 退化。');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- **runId:** \`${meta.runId}\``);
  lines.push('- **dataset:** `datasets/wardrobe-entry`（8）');
  lines.push(`- **A Beta1:** 生产 \`AI_PROMPT\` Vision-only (\`${meta.prodVer}\`)`);
  lines.push(
    `- **B Beta2.1:** 生产 \`AI_PROMPT\` + 三条商品主体优先规则 + OCR \`purchaseDate\` merge (\`${meta.beta21Ver}\`)`,
  );
  lines.push('- **不用** `category-product-focus-exp.txt` 全文');
  lines.push('- **不改** category hierarchy 其它规则；**不改** `src/**`');
  lines.push('');
  lines.push('### B 追加的三条规则');
  lines.push('');
  lines.push('```');
  lines.push(PRODUCT_FOCUS_PATCH.trim());
  lines.push('```');
  lines.push('');

  lines.push('## Metrics（usable = exact + format_mismatch + semantic_match）');
  lines.push('');
  lines.push('| 指标 | A Beta1 | B Beta2.1 | Δ | color/price gate |');
  lines.push('|------|---------|-----------|---|------------------|');
  for (const f of FIELDS) {
    const a = mA.byField[f];
    const b = mB.byField[f];
    const ap = pct(a.usable, a.labeled);
    const bp = pct(b.usable, b.labeled);
    const d = Math.round((bp - ap) * 10) / 10;
    let gate = '—';
    if (f === 'color' || f === 'price') {
      gate = d < 0 ? 'FAIL ↓' : 'PASS';
    }
    lines.push(
      `| ${f} | ${ap}% (${a.usable}/${a.labeled}) | ${bp}% (${b.usable}/${b.labeled}) | ${d >= 0 ? '+' : ''}${d} | ${gate} |`,
    );
  }
  const pa = pct(mA.parseOk, mA.n);
  const pb = pct(mB.parseOk, mB.n);
  const pd = Math.round((pb - pa) * 10) / 10;
  lines.push(
    `| parse | ${pa}% (${mA.parseOk}/${mA.n}) | ${pb}% (${mB.parseOk}/${mB.n}) | ${pd >= 0 ? '+' : ''}${pd} | — |`,
  );
  lines.push('');

  const colorDrop =
    pct(mB.byField.color.usable, mB.byField.color.labeled) <
    pct(mA.byField.color.usable, mA.byField.color.labeled);
  const priceDrop =
    pct(mB.byField.price.usable, mB.byField.price.labeled) <
    pct(mA.byField.price.usable, mA.byField.price.labeled);
  lines.push('## Gate: color/price 不允许下降');
  lines.push('');
  lines.push(`- color: **${colorDrop ? 'FAIL' : 'PASS'}**`);
  lines.push(`- price: **${priceDrop ? 'FAIL' : 'PASS'}**`);
  lines.push(`- overall gate: **${colorDrop || priceDrop ? 'FAIL' : 'PASS'}**`);
  lines.push('');

  lines.push('## bra_* category');
  lines.push('');
  lines.push('| id | gold | A | B |');
  lines.push('|----|------|---|---|');
  for (const r of rows.filter((x) => x.id.startsWith('bra_'))) {
    lines.push(
      `| ${r.id} | ${r.label.category} | ${r.A.prediction.category || '(空)'} | ${r.B.prediction.category || '(空)'} |`,
    );
  }
  lines.push('');

  lines.push('## purchaseDate');
  lines.push('');
  lines.push('| id | gold | A | B (OCR) |');
  lines.push('|----|------|---|----------|');
  for (const r of rows) {
    lines.push(
      `| ${r.id} | ${r.label.purchaseDate || '(空)'} | ${r.A.prediction.purchaseDate || '(空)'} | ${r.B.prediction.purchaseDate || '(空)'} |`,
    );
  }
  lines.push('');

  lines.push('## color / price 逐案（退化检查）');
  lines.push('');
  lines.push('| id | color A→B | price A→B | color regress | price regress |');
  lines.push('|----|-----------|-----------|---------------|---------------|');
  for (const r of rows) {
    const cReg = usable(r.A.fieldStatus.color) && !usable(r.B.fieldStatus.color);
    const pReg = usable(r.A.fieldStatus.price) && !usable(r.B.fieldStatus.price);
    lines.push(
      `| ${r.id} | ${r.A.prediction.color || '(空)'} → ${r.B.prediction.color || '(空)'} | ${r.A.prediction.price || '(空)'} → ${r.B.prediction.price || '(空)'} | ${cReg ? 'YES' : 'no'} | ${pReg ? 'YES' : 'no'} |`,
    );
  }
  lines.push('');

  lines.push('## all predictions');
  lines.push('');
  lines.push('| id | gold.cat | A cat/color/price/date | B cat/color/price/date |');
  lines.push('|----|----------|------------------------|------------------------|');
  for (const r of rows) {
    const fmt = (x: ArmCase) =>
      `${x.prediction.category || '(空)'} / ${x.prediction.color || '(空)'} / ${x.prediction.price || '(空)'} / ${x.prediction.purchaseDate || '(空)'}`;
    lines.push(`| ${r.id} | ${r.label.category || ''} | ${fmt(r.A)} | ${fmt(r.B)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const cases = listWardrobeEntryCases();
  const { apiBase, timeoutMs } = loadConfig();
  const prod = loadAIPromptFromApp();
  const beta21Prompt = prod.prompt + PRODUCT_FOCUS_PATCH;
  const { createHash } = await import('node:crypto');
  const beta21Ver = createHash('sha256').update(beta21Prompt).digest('hex').slice(0, 12);

  ensureOcr();
  const nowYear = new Date().getFullYear();
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const runId = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-beta21`;

  console.log(`A Beta1 prod=${prod.promptVersion}`);
  console.log(`B Beta2.1 minimal patch=${beta21Ver} (prod + 3 rules + OCR)`);
  console.log(`cases=${cases.length}`);

  const rows: CaseRow[] = [];
  for (const c of cases) {
    if (!c.localImagePath) throw new Error(`no image ${c.id}`);
    const label = labelSlice(c.label);
    console.log(`\n[${c.id}]`);

    console.log('  A…');
    const aV = await visionOnce(apiBase, timeoutMs, c.localImagePath, prod.prompt);
    const aScored = score(label, aV.fields, aV.parseOk);
    aScored.visionOk = aV.visionOk;

    console.log('  OCR…');
    const ocrExt = extractPurchaseDateFromOcr(runOcr(c.localImagePath), { nowYear });

    console.log('  B…');
    const bV = await visionOnce(apiBase, timeoutMs, c.localImagePath, beta21Prompt);
    const bPred = { ...bV.fields, purchaseDate: ocrExt.purchaseDate || '' };
    const bScored = score(label, bPred, bV.parseOk);
    bScored.visionOk = bV.visionOk;

    console.log(
      `  A ${aV.fields.category}/${aV.fields.color}/${aV.fields.price} | B ${bPred.category}/${bPred.color}/${bPred.price} date=${bPred.purchaseDate || '(空)'}`,
    );

    rows.push({
      id: c.id,
      label,
      A: aScored,
      B: bScored,
      ocrPurchaseDate: ocrExt.purchaseDate || '',
    });
  }

  fs.writeFileSync(
    REPORT,
    render(rows, { runId, prodVer: prod.promptVersion, beta21Ver }),
  );
  const rawDir = path.join(EVAL_ROOT, 'reports/raw', runId);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(
    path.join(rawDir, 'summary.json'),
    JSON.stringify({ runId, patch: PRODUCT_FOCUS_PATCH, rows }, null, 2),
  );

  const mA = metrics(rows, 'A');
  const mB = metrics(rows, 'B');
  console.log('\nreport:', REPORT);
  for (const f of FIELDS) {
    console.log(
      `${f}: ${pct(mA.byField[f].usable, mA.byField[f].labeled)}% → ${pct(mB.byField[f].usable, mB.byField[f].labeled)}%`,
    );
  }
  const colorDrop =
    pct(mB.byField.color.usable, mB.byField.color.labeled) <
    pct(mA.byField.color.usable, mA.byField.color.labeled);
  const priceDrop =
    pct(mB.byField.price.usable, mB.byField.price.labeled) <
    pct(mA.byField.price.usable, mA.byField.price.labeled);
  console.log(`gate color/price: ${colorDrop || priceDrop ? 'FAIL' : 'PASS'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
