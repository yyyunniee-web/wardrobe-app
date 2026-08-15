/**
 * 订单截图双通道评估（评测专用，不接生产）
 * Vision → category/color/price/season
 * OCR   → purchaseDate
 * 合并后用 C 类 diffKind 对照 label
 *
 * node --experimental-strip-types scripts/ai-evaluation/run-order-multimodal-eval.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  EVAL_ROOT,
  fieldDiff,
  listImageRecognitionCases,
  loadAIPromptFromApp,
  loadConfig,
  resolveCompareTarget,
  resolvePurchaseDateActual,
  tryParseJsonObject,
  type DiffKind,
  type LabelJson,
} from './lib/dataset.ts';
import { callWorkerVision, uploadEvalImage } from './lib/vision-client.ts';
import { extractPurchaseDateFromOcr } from './ocr/extract-purchase-date.ts';

const IDS = ['bra_001', 'shoes-001', 'shorts001', 'tshirt_001'];
const MERGE_FIELDS = ['category', 'color', 'price', 'season', 'purchaseDate'] as const;
const OCR_BIN = path.join(EVAL_ROOT, 'ocr/vision-ocr');
const OCR_SWIFT = path.join(EVAL_ROOT, 'ocr/vision-ocr.swift');

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

function visionProductFields(parsed: Record<string, unknown> | null): {
  category: string;
  color: string;
  price: string;
  season: string;
  visionPurchaseDate: string;
} {
  if (!parsed) {
    return { category: '', color: '', price: '', season: '', visionPurchaseDate: '' };
  }
  const { compareSource, target } = resolveCompareTarget(parsed);
  const item = target || {};
  const { actual: pd } = resolvePurchaseDateActual(parsed, target, compareSource);
  return {
    category: empty(item.category),
    color: empty(item.color),
    price: empty(item.price),
    season: empty(item.season),
    visionPurchaseDate: empty(pd),
  };
}

/** 合并：商品字段来自 Vision，日期来自 OCR（覆盖 Vision purchaseDate） */
function mergeChannels(
  visionParsed: Record<string, unknown> | null,
  ocrPurchaseDate: string | null,
): Record<string, unknown> {
  const base: Record<string, unknown> = visionParsed
    ? JSON.parse(JSON.stringify(visionParsed))
    : { imageType: 'order', itemCount: 1, items: [] };
  base.purchaseDate = ocrPurchaseDate || '';
  return base;
}

function mergedView(merged: Record<string, unknown>, ocrDate: string | null) {
  const prod = visionProductFields(merged);
  return {
    category: prod.category,
    color: prod.color,
    price: prod.price,
    season: prod.season,
    purchaseDate: ocrDate || '',
    sources: {
      category: 'vision',
      color: 'vision',
      price: 'vision',
      season: 'vision',
      purchaseDate: 'ocr',
    },
  };
}

function labelSlice(label: LabelJson): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of MERGE_FIELDS) {
    if (k in label) out[k] = label[k];
  }
  return out;
}

async function main() {
  ensureOcrBinary();
  const { apiBase, timeoutMs } = loadConfig();
  const prod = loadAIPromptFromApp();
  const cases = listImageRecognitionCases().filter((c) => IDS.includes(c.id));
  if (cases.length !== IDS.length) {
    throw new Error(`expected cases ${IDS.join(',')}`);
  }

  const suiteId = runIdNow();
  const nowYear = new Date().getFullYear();
  console.log(`suiteId=${suiteId}`);
  console.log(`promptVersion=${prod.promptVersion}`);

  type CaseRow = {
    id: string;
    label: Record<string, unknown>;
    visionRaw: string;
    visionOk: boolean;
    visionError?: string;
    visionParseOk: boolean;
    visionFields: ReturnType<typeof visionProductFields>;
    ocrRaw: string;
    ocrExtract: ReturnType<typeof extractPurchaseDateFromOcr>;
    merged: ReturnType<typeof mergedView>;
    diffs: Array<{ field: string; expected: unknown; actual: unknown; kind: DiffKind }>;
    compareSource: string;
    purchaseDateCompareSource: string;
    parseOk: boolean;
  };

  const rows: CaseRow[] = [];

  for (const c of cases) {
    if (!c.localImagePath) throw new Error(`no image ${c.id}`);
    console.log(`\n=== ${c.id} ===`);

    console.log('[ocr] …');
    const ocrRaw = runOcr(c.localImagePath);
    const ocrExtract = extractPurchaseDateFromOcr(ocrRaw, { nowYear });
    console.log(`[ocr] purchaseDate=${ocrExtract.purchaseDate || '(空)'} (${ocrExtract.strategy})`);

    console.log('[vision] upload + /ai/vision …');
    const up = await uploadEvalImage(apiBase, c.localImagePath, timeoutMs);
    if (!up.ok) throw new Error(`upload ${c.id}: ${up.error}`);
    const vision = await callWorkerVision(apiBase, up.url, prod.prompt, timeoutMs);
    const visionRaw = vision.ok ? vision.text : `ERROR: ${vision.error}`;
    const visionParsed = vision.ok ? tryParseJsonObject(vision.text) : null;
    const visionFields = visionProductFields(visionParsed);
    console.log(
      `[vision] cat=${visionFields.category || '(空)'} color=${visionFields.color || '(空)'} price=${visionFields.price || '(空)'} season=${visionFields.season || '(空)'}`,
    );

    const mergedParsed = mergeChannels(visionParsed, ocrExtract.purchaseDate);
    const merged = mergedView(mergedParsed, ocrExtract.purchaseDate);
    const label = labelSlice(c.label);
    const { compareSource, purchaseDateCompareSource, diffs, parseOk } = fieldDiff(
      label as LabelJson,
      mergedParsed,
    );

    rows.push({
      id: c.id,
      label,
      visionRaw,
      visionOk: vision.ok,
      visionError: vision.ok ? undefined : vision.error,
      visionParseOk: !!visionParsed,
      visionFields,
      ocrRaw,
      ocrExtract,
      merged,
      diffs,
      compareSource,
      purchaseDateCompareSource,
      parseOk,
    });
  }

  const rawDir = path.join(EVAL_ROOT, 'reports/raw', `${suiteId}-order-multimodal`);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(
    path.join(rawDir, 'summary.json'),
    JSON.stringify(
      {
        suiteId,
        promptSource: prod.source,
        promptVersion: prod.promptVersion,
        nowYear,
        architecture: 'vision(product) + ocr(purchaseDate)',
        cases: rows,
      },
      null,
      2,
    ),
  );

  const mdPath = path.join(EVAL_ROOT, 'reports/order-multimodal-eval.md');
  fs.writeFileSync(mdPath, renderReport(suiteId, prod.promptVersion, nowYear, rows));
  console.log('\nreport:', mdPath);
  console.log('raw:', rawDir);
}

function kindCount(
  rows: Array<{ diffs: Array<{ kind: DiffKind }> }>,
): Record<DiffKind, number> {
  const out: Record<DiffKind, number> = {
    missing: 0,
    format_mismatch: 0,
    semantic_match: 0,
    value_mismatch: 0,
    parse_error: 0,
  };
  for (const r of rows) for (const d of r.diffs) out[d.kind]++;
  return out;
}

function fieldHitSummary(
  rows: Array<{
    label: Record<string, unknown>;
    merged: Record<string, unknown>;
    diffs: Array<{ field: string; kind: DiffKind }>;
  }>,
  field: string,
): string {
  let exactOrSoft = 0;
  let total = 0;
  for (const r of rows) {
    if (!(field in r.label) || r.label[field] === '' || r.label[field] == null) continue;
    total++;
    const d = r.diffs.find((x) => x.field === field);
    if (!d) exactOrSoft++; // exact match
    else if (d.kind === 'format_mismatch' || d.kind === 'semantic_match') exactOrSoft++;
  }
  return total ? `${exactOrSoft}/${total}` : 'n/a';
}

function renderReport(
  suiteId: string,
  promptVersion: string,
  nowYear: number,
  rows: Array<{
    id: string;
    label: Record<string, unknown>;
    visionRaw: string;
    visionOk: boolean;
    visionParseOk: boolean;
    visionFields: ReturnType<typeof visionProductFields>;
    ocrRaw: string;
    ocrExtract: ReturnType<typeof extractPurchaseDateFromOcr>;
    merged: ReturnType<typeof mergedView>;
    diffs: Array<{ field: string; expected: unknown; actual: unknown; kind: DiffKind }>;
    compareSource: string;
    purchaseDateCompareSource: string;
    parseOk: boolean;
  }>,
): string {
  const lines: string[] = [];
  lines.push('# 订单截图双通道评估（Vision + OCR）');
  lines.push('');
  lines.push('```text');
  lines.push('        image');
  lines.push('          |');
  lines.push('     +----+----+');
  lines.push('     |         |');
  lines.push('   Vision     OCR');
  lines.push('     |         |');
  lines.push(' 商品字段     日期字段');
  lines.push('     |         |');
  lines.push('     +----合并报告----+');
  lines.push('```');
  lines.push('');
  lines.push(`- **suiteId:** \`${suiteId}\``);
  lines.push(`- **Vision:** 生产 \`AI_PROMPT\` / \`${promptVersion}\` → category / color / price / season`);
  lines.push(`- **OCR:** macOS Vision OCR + 交易快照规则 → purchaseDate（补年=${nowYear}）`);
  lines.push(`- **diff 分类:** 沿用实验 C（missing / format_mismatch / semantic_match / value_mismatch / parse_error）`);
  lines.push(`- **范围:** 仅评测，不接入生产`);
  lines.push('');

  const kc = kindCount(rows);
  lines.push('## 汇总');
  lines.push('');
  lines.push('| 字段 | 可用命中*（exact+format+semantic） |');
  lines.push('|------|-------------------------------------|');
  for (const f of MERGE_FIELDS) {
    lines.push(`| ${f} | ${fieldHitSummary(rows, f)} |`);
  }
  lines.push('');
  lines.push(
    `\\* 相对 label；\`format_mismatch\` / \`semantic_match\` 计为可用命中，\`missing\` / \`value_mismatch\` / \`parse_error\` 不计。`,
  );
  lines.push('');
  lines.push(
    `- diffKind 计数: missing=${kc.missing}, format_mismatch=${kc.format_mismatch}, semantic_match=${kc.semantic_match}, value_mismatch=${kc.value_mismatch}, parse_error=${kc.parse_error}`,
  );
  lines.push('');

  for (const c of rows) {
    lines.push(`## Case \`${c.id}\``);
    lines.push('');
    lines.push('### Vision raw');
    lines.push('');
    lines.push('```');
    lines.push(c.visionRaw || '(空)');
    lines.push('```');
    lines.push('');
    lines.push(
      `- visionOk=${c.visionOk} parseOk=${c.visionParseOk} fields: category=\`${c.visionFields.category || '(空)'}\` color=\`${c.visionFields.color || '(空)'}\` price=\`${c.visionFields.price || '(空)'}\` season=\`${c.visionFields.season || '(空)'}\` (vision purchaseDate=\`${c.visionFields.visionPurchaseDate || '(空)'}\`)`,
    );
    lines.push('');
    lines.push('### OCR raw');
    lines.push('');
    lines.push('```');
    lines.push(c.ocrRaw || '(空)');
    lines.push('```');
    lines.push('');
    lines.push(
      `- OCR purchaseDate=\`${c.ocrExtract.purchaseDate || '(空)'}\` strategy=\`${c.ocrExtract.strategy}\` snippet=\`${c.ocrExtract.matchedSnippet || '—'}\``,
    );
    lines.push('');
    lines.push('### merged result');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(c.merged, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('### label');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(c.label, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('### diff 分类');
    lines.push('');
    lines.push(`- compareSource: \`${c.compareSource}\``);
    lines.push(`- purchaseDateCompareSource: \`${c.purchaseDateCompareSource}\``);
    if (!c.parseOk) {
      lines.push('- parseOk: `false`');
    }
    if (!c.diffs.length) {
      lines.push('- （所列字段 exact match 或标准未填）');
    } else {
      for (const d of c.diffs) {
        lines.push(
          `- **${d.field}** \`${d.kind}\`: 标准 \`${JSON.stringify(d.expected)}\` → merged \`${JSON.stringify(d.actual)}\``,
        );
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## 对 Beta2 的建议（评估结论，非实现）');
  lines.push('');
  lines.push('1. **purchaseDate** 应由 OCR+规则负责；本合并报告中日期通道独立于 Vision。');
  lines.push('2. **category / color / price / season** 继续由 Vision 负责，可叠加枚举约束实验（A）降低越界。');
  lines.push('3. 若合并后字段完整度明显优于单通道 Vision，则 Beta2 适合采用 **Vision + OCR 双链路**（另开产品 PR 接入，本实验不改生产）。');
  lines.push('');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
