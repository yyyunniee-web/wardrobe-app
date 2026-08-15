/**
 * OCR merge isolation experiment（评测专用，不改生产 / 不改 prompt）
 *
 * 目标：验证 purchaseDate OCR 接入是否只提升日期，不影响 Vision 商品字段。
 *
 * A: 生产 AI_PROMPT Vision-only
 * B: 完全相同 Vision 输出 + OCR purchaseDate merge
 *
 * 同一批 datasets/wardrobe-entry（8 张），每图只调一次 Vision。
 *
 * node --experimental-strip-types scripts/ai-evaluation/run-wardrobe-entry-ocr-isolation.ts
 * node --experimental-strip-types scripts/ai-evaluation/run-wardrobe-entry-ocr-isolation.ts --dry-run
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

const EVAL_FIELDS = ['name', 'category', 'color', 'price', 'purchaseDate', 'season'] as const;
const PRODUCT_FIELDS = ['name', 'category', 'color', 'price', 'season'] as const;
const OCR_BIN = path.join(EVAL_ROOT, 'ocr/vision-ocr');
const OCR_SWIFT = path.join(EVAL_ROOT, 'ocr/vision-ocr.swift');
const REPORT_PATH = path.join(EVAL_ROOT, 'reports/wardrobe-entry-ocr-isolation-report.md');

function runIdNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    '-' +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

function ensureOcrBinary(): void {
  if (fs.existsSync(OCR_BIN)) return;
  console.log('building OCR binary…');
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

function empty(v: unknown): string {
  return v == null || v === '' ? '' : String(v);
}

function extractVisionFields(parsed: Record<string, unknown> | null): Record<string, string> {
  if (!parsed) {
    return {
      name: '',
      category: '',
      color: '',
      price: '',
      purchaseDate: '',
      season: '',
    };
  }
  const { compareSource, target } = resolveCompareTarget(parsed);
  const item = target || {};
  const { actual: pd } = resolvePurchaseDateActual(parsed, target, compareSource);
  return {
    name: empty(item.name) || empty(parsed.name) || empty(parsed.nameRaw) || '',
    category: empty(item.category),
    color: empty(item.color),
    price: empty(item.price),
    purchaseDate: empty(pd),
    season: empty(item.season) || empty(parsed.season),
  };
}

function labelSlice(label: LabelJson): LabelJson {
  const out: LabelJson = {};
  for (const k of EVAL_FIELDS) {
    if (k in label) out[k] = label[k];
  }
  return out;
}

function predictionAsParsed(pred: Record<string, string>): Record<string, unknown> {
  return { ...pred, items: [] };
}

function isUsableHit(kind: DiffKind | 'exact'): boolean {
  return kind === 'exact' || kind === 'format_mismatch' || kind === 'semantic_match';
}

type ArmId = 'A' | 'B';

type ArmResult = {
  prediction: Record<string, string>;
  sources: Record<string, string>;
  diffs: FieldDiffEntry[];
  fieldStatus: Record<string, DiffKind | 'exact' | 'unlabeled'>;
};

type CaseResult = {
  id: string;
  image: string;
  labelFile: string;
  label: LabelJson;
  visionOk: boolean;
  parseOk: boolean;
  visionRaw: string;
  ocrRaw: string;
  ocrPurchaseDate: string;
  ocrStrategy: string;
  A: ArmResult;
  B: ArmResult;
  /** 商品字段 A/B 是否字节级相同（隔离成立） */
  productFieldsIdentical: boolean;
};

function scoreArm(label: LabelJson, pred: Record<string, string>, parseOk: boolean): ArmResult {
  const { diffs } = fieldDiff(label, parseOk ? predictionAsParsed(pred) : null);
  const fieldStatus: ArmResult['fieldStatus'] = {};
  for (const k of EVAL_FIELDS) {
    if (!(k in label) || label[k] === '' || label[k] == null) {
      fieldStatus[k] = 'unlabeled';
      continue;
    }
    const d = diffs.find((x) => x.field === k);
    fieldStatus[k] = d ? d.kind : 'exact';
  }
  return {
    prediction: pred,
    sources: {},
    diffs,
    fieldStatus,
  };
}

function metricsForArm(cases: CaseResult[], arm: ArmId) {
  const byField: Record<
    string,
    { labeled: number; exact: number; usable: number; missing: number; value_mismatch: number }
  > = {};
  for (const f of EVAL_FIELDS) {
    byField[f] = { labeled: 0, exact: 0, usable: 0, missing: 0, value_mismatch: 0 };
  }
  for (const c of cases) {
    const armRes = c[arm];
    for (const f of EVAL_FIELDS) {
      const st = armRes.fieldStatus[f];
      if (st === 'unlabeled') continue;
      byField[f].labeled++;
      if (st === 'exact') {
        byField[f].exact++;
        byField[f].usable++;
      } else if (isUsableHit(st)) {
        byField[f].usable++;
      }
      if (st === 'missing') byField[f].missing++;
      if (st === 'value_mismatch') byField[f].value_mismatch++;
    }
  }
  return { byField };
}

function pct(usable: number, labeled: number): number {
  return labeled ? Math.round((usable / labeled) * 1000) / 10 : 0;
}

function renderReport(summary: {
  runId: string;
  promptVersion: string;
  cases: CaseResult[];
}): string {
  const mA = metricsForArm(summary.cases, 'A');
  const mB = metricsForArm(summary.cases, 'B');
  const productIdenticalCount = summary.cases.filter((c) => c.productFieldsIdentical).length;
  const lines: string[] = [];

  lines.push('# wardrobe-entry OCR merge isolation experiment');
  lines.push('');
  lines.push('验证：**purchaseDate OCR 接入是否只提升日期，不影响 Vision 商品字段。**');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- **runId:** \`${summary.runId}\``);
  lines.push('- **dataset:** `datasets/wardrobe-entry`（8 配对样本）');
  lines.push(`- **prompt:** 生产 \`AI_PROMPT\`（\`promptVersion=${summary.promptVersion}\`）— **未修改**`);
  lines.push('- **A:** Vision-only（同一 Vision 输出）');
  lines.push('- **B:** 完全相同 Vision 输出 + OCR `purchaseDate` merge');
  lines.push('- **隔离保证:** 每图只调用一次 Vision；B 不重跑 Vision');
  lines.push('- **生产代码:** 未改动');
  lines.push('');
  lines.push('## Verdict（重点）');
  lines.push('');

  const dateA = mA.byField.purchaseDate;
  const dateB = mB.byField.purchaseDate;
  const dateLift = pct(dateB.usable, dateB.labeled) - pct(dateA.usable, dateA.labeled);
  lines.push('### 1. purchaseDate 是否提升');
  lines.push('');
  lines.push(
    `| arm | usable | usable% | exact | missing |`,
  );
  lines.push(`|-----|--------|---------|-------|---------|`);
  lines.push(
    `| A Vision-only | ${dateA.usable}/${dateA.labeled} | ${pct(dateA.usable, dateA.labeled)}% | ${dateA.exact} | ${dateA.missing} |`,
  );
  lines.push(
    `| B Vision+OCR merge | ${dateB.usable}/${dateB.labeled} | ${pct(dateB.usable, dateB.labeled)}% | ${dateB.exact} | ${dateB.missing} |`,
  );
  lines.push('');
  lines.push(
    dateLift > 0
      ? `**结论:** purchaseDate usable% **提升 ${Math.round(dateLift * 10) / 10} 个百分点**（OCR merge 有效）。`
      : dateLift === 0
        ? '**结论:** purchaseDate usable% 无变化。'
        : `**结论:** purchaseDate usable% 下降 ${Math.round(-dateLift * 10) / 10} 个百分点。`,
  );
  lines.push('');

  lines.push('### 2. category / color / price 是否保持');
  lines.push('');
  lines.push(
    `- **商品字段字节级相同（A≡B）:** ${productIdenticalCount}/${summary.cases.length} cases`,
  );
  lines.push('');
  lines.push('| 字段 | A usable% | B usable% | Δ | A≡B predictions? |');
  lines.push('|------|-----------|-----------|---|------------------|');
  for (const f of ['category', 'color', 'price', 'name', 'season'] as const) {
    const a = mA.byField[f];
    const b = mB.byField[f];
    const ap = pct(a.usable, a.labeled);
    const bp = pct(b.usable, b.labeled);
    const delta = Math.round((bp - ap) * 10) / 10;
    const identical =
      summary.cases.every((c) => c.A.prediction[f] === c.B.prediction[f]) ? 'yes' : 'NO';
    lines.push(
      `| ${f} | ${ap}% (${a.usable}/${a.labeled}) | ${bp}% (${b.usable}/${b.labeled}) | ${delta >= 0 ? '+' : ''}${delta} | ${identical} |`,
    );
  }
  lines.push('');
  if (productIdenticalCount === summary.cases.length) {
    lines.push(
      '**结论:** category/color/price（及 name/season）预测与 A **完全一致**；OCR merge **未扰动** Vision 商品字段。Accuracy 表上 Δ=0 是隔离成立的直接结果。',
    );
  } else {
    lines.push(
      '**结论:** 存在 A/B 商品字段不一致 — 隔离假设被破坏（实现 bug）。',
    );
  }
  lines.push('');

  lines.push('## Accuracy 总表（usable = exact + format_mismatch + semantic_match）');
  lines.push('');
  lines.push('| 字段 | A usable% | B usable% | Δ |');
  lines.push('|------|-----------|-----------|---|');
  for (const f of EVAL_FIELDS) {
    const a = mA.byField[f];
    const b = mB.byField[f];
    const ap = pct(a.usable, a.labeled);
    const bp = pct(b.usable, b.labeled);
    const delta = Math.round((bp - ap) * 10) / 10;
    lines.push(
      `| ${f} | ${ap}% (${a.usable}/${a.labeled}) | ${bp}% (${b.usable}/${b.labeled}) | ${delta >= 0 ? '+' : ''}${delta} |`,
    );
  }
  lines.push('');

  lines.push('## 分 case：purchaseDate');
  lines.push('');
  lines.push('| id | gold | A Vision | B OCR-merge | A status | B status |');
  lines.push('|----|------|----------|-------------|----------|----------|');
  for (const c of summary.cases) {
    lines.push(
      `| ${c.id} | ${c.label.purchaseDate || '(空)'} | ${c.A.prediction.purchaseDate || '(空)'} | ${c.B.prediction.purchaseDate || '(空)'} | ${c.A.fieldStatus.purchaseDate} | ${c.B.fieldStatus.purchaseDate} |`,
    );
  }
  lines.push('');

  lines.push('## 分 case：商品字段（A≡B 校验）');
  lines.push('');
  lines.push('| id | category A/B | color A/B | price A/B | identical? |');
  lines.push('|----|--------------|-----------|-----------|------------|');
  for (const c of summary.cases) {
    const cat = c.A.prediction.category || '(空)';
    const col = c.A.prediction.color || '(空)';
    const pri = c.A.prediction.price || '(空)';
    lines.push(
      `| ${c.id} | ${cat} | ${col} | ${pri} | ${c.productFieldsIdentical ? 'yes' : 'NO'} |`,
    );
  }
  lines.push('');

  lines.push('## Per-case detail');
  lines.push('');
  for (const c of summary.cases) {
    lines.push(`### \`${c.id}\``);
    lines.push('');
    lines.push(`- image: \`${c.image}\` / label: \`${c.labelFile}\``);
    lines.push(`- visionOk=${c.visionOk} parseOk=${c.parseOk}`);
    lines.push(
      `- OCR purchaseDate=\`${c.ocrPurchaseDate || '(空)'}\` strategy=\`${c.ocrStrategy}\``,
    );
    lines.push(`- productFieldsIdentical=${c.productFieldsIdentical}`);
    lines.push('');
    lines.push('**gold**');
    lines.push('```json');
    lines.push(JSON.stringify(c.label, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('**A prediction (Vision-only)**');
    lines.push('```json');
    lines.push(JSON.stringify(c.A.prediction, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('**B prediction (Vision + OCR date)**');
    lines.push('```json');
    lines.push(JSON.stringify({ ...c.B.prediction, _sources: c.B.sources }, null, 2));
    lines.push('```');
    lines.push('');
    if (c.B.diffs.filter((d) => d.field === 'purchaseDate').length || c.A.diffs.length) {
      lines.push('**diffs (B vs gold，含日期；商品字段应与 A 同源)**');
      lines.push('');
      const shown = [...c.A.diffs.filter((d) => d.field !== 'purchaseDate'), ...c.B.diffs.filter((d) => d.field === 'purchaseDate')];
      if (!shown.length) {
        lines.push('- （无 diff / 或未标注）');
      } else {
        for (const d of shown) {
          lines.push(
            `- **${d.field}** \`${d.kind}\`: gold \`${JSON.stringify(d.expected)}\` → pred \`${JSON.stringify(d.actual)}\``,
          );
        }
      }
      lines.push('');
    }
  }

  lines.push('## Method notes');
  lines.push('');
  lines.push('- 与先前 `wardrobe-entry-eval-compare`（baseline/current 各跑一遍 Vision）不同：本实验 **强制共享同一 Vision raw**，排除模型非确定性对商品字段 Δ 的干扰。');
  lines.push('- B 仅覆盖 `purchaseDate`；其余字段浅拷贝自 A。');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const cases = listWardrobeEntryCases();
  if (!cases.length) {
    console.error('datasets/wardrobe-entry 无配对用例');
    process.exit(1);
  }

  if (dryRun) {
    console.log('=== OCR isolation dry-run ===');
    console.log('cases:', cases.length);
    for (const c of cases) {
      console.log(`- ${c.id} → ${path.basename(c.localImagePath || '')}`);
    }
    console.log('report →', REPORT_PATH);
    return;
  }

  const { apiBase, timeoutMs } = loadConfig();
  const prod = loadAIPromptFromApp();
  ensureOcrBinary();
  const runId = `${runIdNow()}-ocr-isolation`;
  const nowYear = new Date().getFullYear();

  console.log(`apiBase=${apiBase}`);
  console.log(`promptVersion=${prod.promptVersion} (production AI_PROMPT, unchanged)`);
  console.log(`cases=${cases.length}`);

  const results: CaseResult[] = [];

  for (const c of cases) {
    if (!c.localImagePath) throw new Error(`missing image for ${c.id}`);
    console.log(`\n[${c.id}]`);

    console.log('  OCR …');
    const ocrRaw = runOcr(c.localImagePath);
    const ocrExt = extractPurchaseDateFromOcr(ocrRaw, { nowYear });
    console.log(`  OCR date=${ocrExt.purchaseDate || '(空)'} (${ocrExt.strategy})`);

    console.log('  Vision (once) …');
    const up = await uploadEvalImage(apiBase, c.localImagePath, timeoutMs);
    if (!up.ok) throw new Error(`upload ${c.id}: ${up.error}`);
    const vision = await callWorkerVision(apiBase, up.url, prod.prompt, timeoutMs);
    const visionRaw = vision.ok ? vision.text : `ERROR: ${vision.error}`;
    const parsed = vision.ok ? tryParseJsonObject(vision.text) : null;
    const vis = extractVisionFields(parsed);

    const label = labelSlice(c.label);

    // A: Vision-only
    const predA = { ...vis };
    const armA = scoreArm(label, predA, !!parsed);
    armA.sources = {
      name: 'vision',
      category: 'vision',
      color: 'vision',
      price: 'vision',
      season: 'vision',
      purchaseDate: 'vision',
    };

    // B: same Vision + OCR date only
    const predB = { ...vis, purchaseDate: ocrExt.purchaseDate || '' };
    const armB = scoreArm(label, predB, !!parsed);
    armB.sources = {
      name: 'vision',
      category: 'vision',
      color: 'vision',
      price: 'vision',
      season: 'vision',
      purchaseDate: 'ocr',
    };

    const productFieldsIdentical = PRODUCT_FIELDS.every((f) => predA[f] === predB[f]);

    console.log(
      `  A date=${predA.purchaseDate || '(空)'} | B date=${predB.purchaseDate || '(空)'} | productIdentical=${productFieldsIdentical}`,
    );

    results.push({
      id: c.id,
      image: path.basename(c.localImagePath),
      labelFile: path.basename(c.labelPath),
      label,
      visionOk: vision.ok,
      parseOk: !!parsed,
      visionRaw,
      ocrRaw,
      ocrPurchaseDate: ocrExt.purchaseDate || '',
      ocrStrategy: ocrExt.strategy,
      A: armA,
      B: armB,
      productFieldsIdentical,
    });
  }

  const summary = {
    runId,
    promptVersion: prod.promptVersion,
    promptSource: prod.source,
    dataset: 'datasets/wardrobe-entry',
    cases: results,
    metricsA: metricsForArm(results, 'A'),
    metricsB: metricsForArm(results, 'B'),
  };

  const rawDir = path.join(EVAL_ROOT, 'reports/raw', `${runId}`);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(REPORT_PATH, renderReport(summary));

  console.log('\nreport:', REPORT_PATH);
  console.log('raw:', rawDir);

  // console summary of focus metrics
  const mA = summary.metricsA;
  const mB = summary.metricsB;
  console.log('\n=== Focus ===');
  console.log(
    `purchaseDate: A ${pct(mA.byField.purchaseDate.usable, mA.byField.purchaseDate.labeled)}% → B ${pct(mB.byField.purchaseDate.usable, mB.byField.purchaseDate.labeled)}%`,
  );
  for (const f of ['category', 'color', 'price'] as const) {
    console.log(
      `${f}: A ${pct(mA.byField[f].usable, mA.byField[f].labeled)}% → B ${pct(mB.byField[f].usable, mB.byField[f].labeled)}% (Δ should be 0)`,
    );
  }
  console.log(
    `productFieldsIdentical: ${results.filter((r) => r.productFieldsIdentical).length}/${results.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
