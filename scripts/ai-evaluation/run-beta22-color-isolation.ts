/**
 * Beta2.2 color isolation（评测专用，不改 src/** / 不改既有 category 规则）
 *
 * A = Beta2.1：prod AI_PROMPT + 三条 product-focus + OCR purchaseDate
 * B = Beta2.2：Beta2.1 + 字段独立性约束（仅追加，不动 category 三条）
 *
 * 报告: reports/beta22-color-isolation.md
 *
 * node --experimental-strip-types scripts/ai-evaluation/run-beta22-color-isolation.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

const REPORT = path.join(EVAL_ROOT, 'reports/beta22-color-isolation.md');
const OCR_BIN = path.join(EVAL_ROOT, 'ocr/vision-ocr');
const OCR_SWIFT = path.join(EVAL_ROOT, 'ocr/vision-ocr.swift');
const FIELDS = ['category', 'color', 'price', 'purchaseDate'] as const;

/** 与 Beta2.1 相同，不改 */
const PRODUCT_FOCUS_PATCH = [
  '',
  '【category 商品主体优先·最小增量】',
  '1. category 判断以商品本体为准，不以模特穿搭、场景、搭配物为准。',
  '2. 文胸 / bra / 内衣 / 胸衣 / 运动内衣必须归类为「内衣」。',
  '3. 即使模特穿着环境出现裙子、裤子，也不能改变商品主体 category。',
].join('\n');

/** Beta2.2 仅追加 */
const COLOR_INDEPENDENCE_PATCH = [
  '',
  '【字段独立性·最小增量】',
  '1. category 判断规则只影响 category 字段，不得改变或清空 color / price 等其它字段。',
  '2. color 必须独立识别商品实际颜色（商品本体主色），与 category 判定解耦。',
  '3. 如果图片中有明确颜色信息（色名文案或可见主色），不允许因为 category 判断而跳过 color；应填写 color。',
].join('\n');

type Status = DiffKind | 'exact' | 'unlabeled';
type ArmId = 'A' | 'B';

type ArmCase = {
  prediction: Record<string, string>;
  parseOk: boolean;
  fieldStatus: Record<string, Status>;
  diffs: FieldDiffEntry[];
};

type CaseRow = {
  id: string;
  label: LabelJson;
  A: ArmCase;
  B: ArmCase;
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
  return { prediction: pred, parseOk, diffs, fieldStatus };
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

function ver(s: string) {
  return createHash('sha256').update(s).digest('hex').slice(0, 12);
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
  return { parseOk: !!parsed, fields: extractFields(parsed) };
}

function render(
  rows: CaseRow[],
  meta: { runId: string; aVer: string; bVer: string },
) {
  const mA = metrics(rows, 'A');
  const mB = metrics(rows, 'B');
  const catA = pct(mA.byField.category.usable, mA.byField.category.labeled);
  const catB = pct(mB.byField.category.usable, mB.byField.category.labeled);
  const colorA = pct(mA.byField.color.usable, mA.byField.color.labeled);
  const colorB = pct(mB.byField.color.usable, mB.byField.color.labeled);
  const priceA = pct(mA.byField.price.usable, mA.byField.price.labeled);
  const priceB = pct(mB.byField.price.usable, mB.byField.price.labeled);
  const dateA = pct(mA.byField.purchaseDate.usable, mA.byField.purchaseDate.labeled);
  const dateB = pct(mB.byField.purchaseDate.usable, mB.byField.purchaseDate.labeled);

  const lines: string[] = [];
  lines.push('# Beta2.2 color isolation');
  lines.push('');
  lines.push('基于 Beta2.1，**仅追加**字段独立性约束；不改既有 category 三条规则；OCR merge 不变。');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- **runId:** \`${meta.runId}\``);
  lines.push('- **dataset:** `datasets/wardrobe-entry`（8）');
  lines.push(`- **A Beta2.1:** prod + product-focus×3 + OCR (\`${meta.aVer}\`)`);
  lines.push(`- **B Beta2.2:** Beta2.1 + 字段独立性×3 + OCR (\`${meta.bVer}\`)`);
  lines.push('- **不改** `src/**`');
  lines.push('');
  lines.push('### B 追加规则');
  lines.push('');
  lines.push('```');
  lines.push(COLOR_INDEPENDENCE_PATCH.trim());
  lines.push('```');
  lines.push('');

  lines.push('## Metrics');
  lines.push('');
  lines.push('| 指标 | A Beta2.1 | B Beta2.2 | Δ | gate |');
  lines.push('|------|-----------|-----------|---|------|');
  const row = (
    name: string,
    a: number,
    b: number,
    au: number,
    al: number,
    bu: number,
    bl: number,
    gate: string,
  ) => {
    const d = Math.round((b - a) * 10) / 10;
    lines.push(
      `| ${name} | ${a}% (${au}/${al}) | ${b}% (${bu}/${bl}) | ${d >= 0 ? '+' : ''}${d} | ${gate} |`,
    );
  };
  row(
    'category',
    catA,
    catB,
    mA.byField.category.usable,
    mA.byField.category.labeled,
    mB.byField.category.usable,
    mB.byField.category.labeled,
    catB >= catA ? 'PASS ≥2.1' : 'FAIL ↓',
  );
  row(
    'color',
    colorA,
    colorB,
    mA.byField.color.usable,
    mA.byField.color.labeled,
    mB.byField.color.usable,
    mB.byField.color.labeled,
    colorB > colorA ? 'RECOVER ↑' : colorB === colorA ? 'FLAT' : 'FAIL ↓',
  );
  row(
    'price',
    priceA,
    priceB,
    mA.byField.price.usable,
    mA.byField.price.labeled,
    mB.byField.price.usable,
    mB.byField.price.labeled,
    priceB >= priceA ? 'PASS' : 'FAIL ↓',
  );
  row(
    'purchaseDate',
    dateA,
    dateB,
    mA.byField.purchaseDate.usable,
    mA.byField.purchaseDate.labeled,
    mB.byField.purchaseDate.usable,
    mB.byField.purchaseDate.labeled,
    'OCR',
  );
  const pa = pct(mA.parseOk, mA.n);
  const pb = pct(mB.parseOk, mB.n);
  lines.push(
    `| parse | ${pa}% (${mA.parseOk}/${mA.n}) | ${pb}% (${mB.parseOk}/${mB.n}) | ${Math.round((pb - pa) * 10) / 10 >= 0 ? '+' : ''}${Math.round((pb - pa) * 10) / 10} | — |`,
  );
  lines.push('');

  lines.push('## Gates');
  lines.push('');
  lines.push(`- color 是否恢复（B > A）: **${colorB > colorA ? 'YES' : 'NO'}** (${colorA}% → ${colorB}%)`);
  lines.push(`- category 保持 ≥ Beta2.1: **${catB >= catA ? 'PASS' : 'FAIL'}** (${catA}% → ${catB}%)`);
  lines.push(`- price 保持 ≥ Beta2.1: **${priceB >= priceA ? 'PASS' : 'FAIL'}** (${priceA}% → ${priceB}%)`);
  lines.push('');

  lines.push('## color 逐案');
  lines.push('');
  lines.push('| id | gold | A | B | A usable | B usable |');
  lines.push('|----|------|---|---|----------|----------|');
  for (const r of rows) {
    lines.push(
      `| ${r.id} | ${r.label.color || '(空)'} | ${r.A.prediction.color || '(空)'} | ${r.B.prediction.color || '(空)'} | ${usable(r.A.fieldStatus.color) ? 'yes' : 'no'} | ${usable(r.B.fieldStatus.color) ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');

  lines.push('## category / price 逐案');
  lines.push('');
  lines.push('| id | gold.cat | A cat | B cat | A price | B price |');
  lines.push('|----|----------|-------|-------|---------|---------|');
  for (const r of rows) {
    lines.push(
      `| ${r.id} | ${r.label.category || ''} | ${r.A.prediction.category || '(空)'} | ${r.B.prediction.category || '(空)'} | ${r.A.prediction.price || '(空)'} | ${r.B.prediction.price || '(空)'} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const cases = listWardrobeEntryCases();
  const { apiBase, timeoutMs } = loadConfig();
  const prod = loadAIPromptFromApp();
  const prompt21 = prod.prompt + PRODUCT_FOCUS_PATCH;
  const prompt22 = prompt21 + COLOR_INDEPENDENCE_PATCH;
  const aVer = ver(prompt21);
  const bVer = ver(prompt22);

  ensureOcr();
  const nowYear = new Date().getFullYear();
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const runId = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-beta22`;

  console.log(`A Beta2.1=${aVer}`);
  console.log(`B Beta2.2=${bVer}`);
  console.log(`cases=${cases.length}`);

  const rows: CaseRow[] = [];
  for (const c of cases) {
    if (!c.localImagePath) throw new Error(`no image ${c.id}`);
    const label = labelSlice(c.label);
    console.log(`\n[${c.id}]`);

    const ocrDate = extractPurchaseDateFromOcr(runOcr(c.localImagePath), { nowYear }).purchaseDate || '';

    console.log('  A Beta2.1…');
    const aV = await visionOnce(apiBase, timeoutMs, c.localImagePath, prompt21);
    const aPred = { ...aV.fields, purchaseDate: ocrDate };
    const aScored = score(label, aPred, aV.parseOk);

    console.log('  B Beta2.2…');
    const bV = await visionOnce(apiBase, timeoutMs, c.localImagePath, prompt22);
    const bPred = { ...bV.fields, purchaseDate: ocrDate };
    const bScored = score(label, bPred, bV.parseOk);

    console.log(
      `  color A=${aPred.color || '(空)'} B=${bPred.color || '(空)'} | cat A=${aPred.category || '(空)'} B=${bPred.category || '(空)'}`,
    );

    rows.push({ id: c.id, label, A: aScored, B: bScored });
  }

  fs.writeFileSync(REPORT, render(rows, { runId, aVer, bVer }));
  const rawDir = path.join(EVAL_ROOT, 'reports/raw', runId);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(
    path.join(rawDir, 'summary.json'),
    JSON.stringify({ runId, colorPatch: COLOR_INDEPENDENCE_PATCH, rows }, null, 2),
  );

  const mA = metrics(rows, 'A');
  const mB = metrics(rows, 'B');
  console.log('\nreport:', REPORT);
  console.log(
    `color ${pct(mA.byField.color.usable, mA.byField.color.labeled)}% → ${pct(mB.byField.color.usable, mB.byField.color.labeled)}%`,
  );
  console.log(
    `category ${pct(mA.byField.category.usable, mA.byField.category.labeled)}% → ${pct(mB.byField.category.usable, mB.byField.category.labeled)}%`,
  );
  console.log(
    `price ${pct(mA.byField.price.usable, mA.byField.price.labeled)}% → ${pct(mB.byField.price.usable, mB.byField.price.labeled)}%`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
