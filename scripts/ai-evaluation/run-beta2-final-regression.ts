/**
 * Beta2 candidate final regression（评测专用，不改生产 / 不调 prompt）
 *
 * A = Beta1 线上：生产 AI_PROMPT Vision-only
 * B = Beta2 candidate：既有 category-product-focus prompt（含 hierarchy + product-focus）
 *     + OCR purchaseDate merge
 *
 * 数据集: wardrobe-entry × 8
 * 报告: reports/beta2-final-regression.md
 *
 * node --experimental-strip-types scripts/ai-evaluation/run-beta2-final-regression.ts
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
  loadEvalPrompt,
  resolveCompareTarget,
  resolvePurchaseDateActual,
  tryParseJsonObject,
  type DiffKind,
  type FieldDiffEntry,
  type LabelJson,
} from './lib/dataset.ts';
import { callWorkerVision, uploadEvalImage } from './lib/vision-client.ts';
import { extractPurchaseDateFromOcr } from './ocr/extract-purchase-date.ts';

/** 已验证的 product-focus prompt（含 hierarchy + 主体优先；不再改） */
const BETA2_VISION_PROMPT = 'prompts/category-product-focus-exp.txt';
const REPORT = path.join(EVAL_ROOT, 'reports/beta2-final-regression.md');
const OCR_BIN = path.join(EVAL_ROOT, 'ocr/vision-ocr');
const OCR_SWIFT = path.join(EVAL_ROOT, 'ocr/vision-ocr.swift');
const FIELDS = ['category', 'color', 'price', 'purchaseDate', 'season'] as const;

type ArmId = 'A' | 'B';
type Status = DiffKind | 'exact' | 'unlabeled';

type ArmCase = {
  prediction: Record<string, string>;
  sources: Record<string, string>;
  parseOk: boolean;
  visionOk: boolean;
  diffs: FieldDiffEntry[];
  fieldStatus: Record<string, Status>;
};

type CaseRow = {
  id: string;
  label: LabelJson;
  A: ArmCase;
  B: ArmCase;
  ocrPurchaseDate: string;
  ocrStrategy: string;
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
  if (!parsed) {
    return { category: '', color: '', price: '', purchaseDate: '', season: '' };
  }
  const { compareSource, target } = resolveCompareTarget(parsed);
  const item = target || {};
  const { actual: pd } = resolvePurchaseDateActual(parsed, target, compareSource);
  return {
    category: empty(item.category),
    color: empty(item.color),
    price: empty(item.price),
    purchaseDate: empty(pd),
    season: empty(item.season) || empty(parsed.season),
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

function score(label: LabelJson, pred: Record<string, string>, parseOk: boolean): Omit<ArmCase, 'sources' | 'visionOk'> {
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
  const byField: Record<string, { labeled: number; usable: number; exact: number }> = {};
  for (const f of FIELDS) byField[f] = { labeled: 0, usable: 0, exact: 0 };
  let parseOk = 0;
  for (const r of rows) {
    const a = r[arm];
    if (a.parseOk) parseOk++;
    for (const f of FIELDS) {
      const st = a.fieldStatus[f];
      if (st === 'unlabeled') continue;
      byField[f].labeled++;
      if (st === 'exact') byField[f].exact++;
      if (usable(st)) byField[f].usable++;
    }
  }
  return { byField, parseOk, n: rows.length };
}

function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

function render(rows: CaseRow[], meta: { runId: string; aVer: string; bVer: string; bSource: string }) {
  const mA = metrics(rows, 'A');
  const mB = metrics(rows, 'B');
  const lines: string[] = [];

  lines.push('# Beta2 candidate final regression');
  lines.push('');
  lines.push('组合既有候选能力（**不新增规则 / 不继续调 prompt**）。');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- **runId:** \`${meta.runId}\``);
  lines.push('- **dataset:** `datasets/wardrobe-entry`（8）');
  lines.push(`- **A Beta1 线上:** 生产 \`AI_PROMPT\` Vision-only (\`${meta.aVer}\`)`);
  lines.push(
    `- **B Beta2 candidate:** \`${meta.bSource}\`（hierarchy + product-focus）+ OCR \`purchaseDate\` merge (\`${meta.bVer}\`)`,
  );
  lines.push('- **生产 \`src/**\`:** 未修改');
  lines.push('');

  lines.push('## Headline metrics（usable = exact + format_mismatch + semantic_match）');
  lines.push('');
  lines.push('| 指标 | A Beta1 | B Beta2 | Δ |');
  lines.push('|------|---------|---------|---|');
  for (const f of FIELDS) {
    const a = mA.byField[f];
    const b = mB.byField[f];
    const ap = pct(a.usable, a.labeled);
    const bp = pct(b.usable, b.labeled);
    const d = Math.round((bp - ap) * 10) / 10;
    lines.push(
      `| ${f} accuracy | ${ap}% (${a.usable}/${a.labeled}) | ${bp}% (${b.usable}/${b.labeled}) | ${d >= 0 ? '+' : ''}${d} |`,
    );
  }
  const parseA = pct(mA.parseOk, mA.n);
  const parseB = pct(mB.parseOk, mB.n);
  lines.push(
    `| parse success | ${parseA}% (${mA.parseOk}/${mA.n}) | ${parseB}% (${mB.parseOk}/${mB.n}) | ${Math.round((parseB - parseA) * 10) / 10 >= 0 ? '+' : ''}${Math.round((parseB - parseA) * 10) / 10} |`,
  );
  lines.push('');

  lines.push('## Focus: bra_* category');
  lines.push('');
  lines.push('| id | gold | A | B | A ok | B ok |');
  lines.push('|----|------|---|---|------|------|');
  const bras = rows.filter((r) => r.id.startsWith('bra_'));
  for (const r of bras) {
    const g = String(r.label.category || '');
    const pa = r.A.prediction.category || '(空)';
    const pb = r.B.prediction.category || '(空)';
    lines.push(
      `| ${r.id} | ${g} | ${pa} | ${pb} | ${pa === g ? 'yes' : 'no'} | ${pb === g ? 'yes' : 'no'} |`,
    );
  }
  const braAllB = bras.every((r) => r.B.prediction.category === r.label.category);
  lines.push('');
  lines.push(`bra_* 全部正确 (B): **${braAllB ? 'YES' : 'NO'}** (${bras.filter((r) => r.B.prediction.category === r.label.category).length}/${bras.length})`);
  lines.push('');

  lines.push('## Focus: purchaseDate（OCR 提升是否保持）');
  lines.push('');
  lines.push('| id | gold | A Vision | B OCR-merge | A usable | B usable |');
  lines.push('|----|------|----------|-------------|----------|----------|');
  for (const r of rows) {
    if (r.A.fieldStatus.purchaseDate === 'unlabeled' && r.B.fieldStatus.purchaseDate === 'unlabeled') {
      lines.push(
        `| ${r.id} | (空) | ${r.A.prediction.purchaseDate || '(空)'} | ${r.B.prediction.purchaseDate || '(空)'} | — | — |`,
      );
      continue;
    }
    lines.push(
      `| ${r.id} | ${r.label.purchaseDate || '(空)'} | ${r.A.prediction.purchaseDate || '(空)'} | ${r.B.prediction.purchaseDate || '(空)'} | ${usable(r.A.fieldStatus.purchaseDate) ? 'yes' : 'no'} | ${usable(r.B.fieldStatus.purchaseDate) ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');

  lines.push('## Focus: 新字段退化？');
  lines.push('');
  lines.push('相对 A：B 在某 labeled 字段从 usable→不可用，计为退化。');
  lines.push('');
  lines.push('| id | field | A status | B status | regress? |');
  lines.push('|----|-------|----------|----------|----------|');
  let regressN = 0;
  for (const r of rows) {
    for (const f of FIELDS) {
      const sa = r.A.fieldStatus[f];
      const sb = r.B.fieldStatus[f];
      if (sa === 'unlabeled' || sb === 'unlabeled') continue;
      const reg = usable(sa) && !usable(sb);
      if (reg) regressN++;
      if (reg || f === 'category' || f === 'purchaseDate') {
        // always show category/date rows briefly? User wants regression focus - show all regress + summary
      }
      if (reg) {
        lines.push(`| ${r.id} | ${f} | ${sa} | ${sb} | YES |`);
      }
    }
  }
  if (regressN === 0) lines.push('| — | — | — | — | none |');
  lines.push('');
  lines.push(`退化事件数: **${regressN}**`);
  lines.push('');

  lines.push('## Per-case predictions');
  lines.push('');
  for (const r of rows) {
    lines.push(`### \`${r.id}\``);
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          gold: r.label,
          A: r.A.prediction,
          B: { ...r.B.prediction, _sources: r.B.sources, ocr: r.ocrPurchaseDate || null },
          statusA: r.A.fieldStatus,
          statusB: r.B.fieldStatus,
          parseOk: { A: r.A.parseOk, B: r.B.parseOk },
        },
        null,
        2,
      ),
    );
    lines.push('```');
    lines.push('');
  }

  lines.push('## Verdict');
  lines.push('');
  lines.push(
    `- category: A ${pct(mA.byField.category.usable, mA.byField.category.labeled)}% → B ${pct(mB.byField.category.usable, mB.byField.category.labeled)}%`,
  );
  lines.push(
    `- purchaseDate: A ${pct(mA.byField.purchaseDate.usable, mA.byField.purchaseDate.labeled)}% → B ${pct(mB.byField.purchaseDate.usable, mB.byField.purchaseDate.labeled)}%`,
  );
  lines.push(`- bra_* all correct on B: **${braAllB ? 'YES' : 'NO'}**`);
  lines.push(`- field regressions (usable→fail): **${regressN}**`);
  lines.push(`- parse success: A ${parseA}% → B ${parseB}%`);
  lines.push('');
  return lines.join('\n');
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
  const raw = vision.ok ? vision.text : `ERROR: ${vision.error}`;
  const parsed = vision.ok ? tryParseJsonObject(vision.text) : null;
  return { visionOk: vision.ok, parseOk: !!parsed, parsed, raw, fields: extractFields(parsed) };
}

async function main() {
  const cases = listWardrobeEntryCases();
  if (cases.length !== 8) {
    console.warn(`expected 8 cases, got ${cases.length}`);
  }
  const { apiBase, timeoutMs } = loadConfig();
  const prod = loadAIPromptFromApp();
  const beta2Prompt = loadEvalPrompt(BETA2_VISION_PROMPT);
  ensureOcr();
  const nowYear = new Date().getFullYear();
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const runId =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-beta2-final`;

  console.log(`A=${prod.promptVersion} (Beta1 prod Vision-only)`);
  console.log(`B=${beta2Prompt.promptVersion} (${beta2Prompt.source} + OCR date)`);
  console.log(`cases=${cases.length}`);

  const rows: CaseRow[] = [];
  for (const c of cases) {
    if (!c.localImagePath) throw new Error(`no image ${c.id}`);
    const label = labelSlice(c.label);
    console.log(`\n[${c.id}]`);

    console.log('  A Vision…');
    const aV = await visionOnce(apiBase, timeoutMs, c.localImagePath, prod.prompt);
    const aScored = score(label, aV.fields, aV.parseOk);

    console.log('  OCR…');
    const ocrRaw = runOcr(c.localImagePath);
    const ocrExt = extractPurchaseDateFromOcr(ocrRaw, { nowYear });

    console.log('  B Vision+OCR…');
    const bV = await visionOnce(apiBase, timeoutMs, c.localImagePath, beta2Prompt.prompt);
    const bPred = { ...bV.fields, purchaseDate: ocrExt.purchaseDate || '' };
    const bScored = score(label, bPred, bV.parseOk);

    console.log(
      `  A cat=${aV.fields.category || '(空)'} date=${aV.fields.purchaseDate || '(空)'} | B cat=${bPred.category || '(空)'} date=${bPred.purchaseDate || '(空)'}`,
    );

    rows.push({
      id: c.id,
      label,
      A: {
        ...aScored,
        visionOk: aV.visionOk,
        sources: {
          category: 'vision',
          color: 'vision',
          price: 'vision',
          season: 'vision',
          purchaseDate: 'vision',
        },
      },
      B: {
        ...bScored,
        visionOk: bV.visionOk,
        sources: {
          category: 'vision',
          color: 'vision',
          price: 'vision',
          season: 'vision',
          purchaseDate: 'ocr',
        },
      },
      ocrPurchaseDate: ocrExt.purchaseDate || '',
      ocrStrategy: ocrExt.strategy,
    });
  }

  const md = render(rows, {
    runId,
    aVer: prod.promptVersion,
    bVer: beta2Prompt.promptVersion,
    bSource: beta2Prompt.source,
  });
  fs.writeFileSync(REPORT, md);

  const rawDir = path.join(EVAL_ROOT, 'reports/raw', runId);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'summary.json'), JSON.stringify({ runId, rows }, null, 2));

  const mA = metrics(rows, 'A');
  const mB = metrics(rows, 'B');
  console.log('\nreport:', REPORT);
  console.log(
    `category ${pct(mA.byField.category.usable, mA.byField.category.labeled)}% → ${pct(mB.byField.category.usable, mB.byField.category.labeled)}%`,
  );
  console.log(
    `purchaseDate ${pct(mA.byField.purchaseDate.usable, mA.byField.purchaseDate.labeled)}% → ${pct(mB.byField.purchaseDate.usable, mB.byField.purchaseDate.labeled)}%`,
  );
  console.log(`parse ${pct(mA.parseOk, mA.n)}% → ${pct(mB.parseOk, mB.n)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
