/**
 * wardrobe-entry 端到端衣橱条目 evaluation
 *
 * 数据集: scripts/ai-evaluation/datasets/wardrobe-entry/{images,labels}
 * 跳过: TEMPLATE.json / example.json / README / reports
 *
 * 版本:
 *   baseline | v1  — Vision-only（生产 AI_PROMPT，含 purchaseDate）
 *   current  | v2  — Vision 商品字段 + OCR purchaseDate
 *   both           — 先 v1 再 v2，并写对比报告
 *
 * 用法:
 *   node --experimental-strip-types scripts/ai-evaluation/run-wardrobe-entry-eval.ts --dry-run
 *   node --experimental-strip-types scripts/ai-evaluation/run-wardrobe-entry-eval.ts --version=baseline
 *   node --experimental-strip-types scripts/ai-evaluation/run-wardrobe-entry-eval.ts --version=current
 *   node --experimental-strip-types scripts/ai-evaluation/run-wardrobe-entry-eval.ts --version=both
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
  type ImageCase,
  type LabelJson,
} from './lib/dataset.ts';
import { callWorkerVision, uploadEvalImage } from './lib/vision-client.ts';
import { extractPurchaseDateFromOcr } from './ocr/extract-purchase-date.ts';

const EVAL_FIELDS = ['name', 'category', 'color', 'price', 'purchaseDate', 'season'] as const;
const OCR_BIN = path.join(EVAL_ROOT, 'ocr/vision-ocr');
const OCR_SWIFT = path.join(EVAL_ROOT, 'ocr/vision-ocr.swift');
const DATASET = path.join(EVAL_ROOT, 'datasets/wardrobe-entry');

type VersionId = 'baseline' | 'current';

function parseArgs(argv: string[]) {
  let dryRun = false;
  let version: VersionId | 'both' = 'current';
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    else if (a === '--version=baseline' || a === '--version=v1') version = 'baseline';
    else if (a === '--version=current' || a === '--version=v2') version = 'current';
    else if (a === '--version=both') version = 'both';
  }
  return { dryRun, version };
}

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
  // name: items[0].name 优先，否则顶层
  const name =
    empty(item.name) ||
    empty(parsed.name) ||
    empty(parsed.nameRaw) ||
    '';
  return {
    name,
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
  // 顶层字段，便于 fieldDiff（无 items 时走 top-level）
  return { ...pred, items: [] };
}

function isUsableHit(kind: DiffKind | 'exact'): boolean {
  return kind === 'exact' || kind === 'format_mismatch' || kind === 'semantic_match';
}

type CaseResult = {
  id: string;
  image: string;
  labelFile: string;
  label: LabelJson;
  prediction: Record<string, string>;
  sources: Record<string, string>;
  visionRaw: string;
  ocrRaw?: string;
  visionOk: boolean;
  parseOk: boolean;
  diffs: FieldDiffEntry[];
  fieldStatus: Record<string, DiffKind | 'exact' | 'unlabeled'>;
};

function scoreCase(label: LabelJson, pred: Record<string, string>, parseOk: boolean) {
  const { diffs } = fieldDiff(label, parseOk ? predictionAsParsed(pred) : null);
  const fieldStatus: CaseResult['fieldStatus'] = {};
  for (const k of EVAL_FIELDS) {
    if (!(k in label) || label[k] === '' || label[k] == null) {
      fieldStatus[k] = 'unlabeled';
      continue;
    }
    const d = diffs.find((x) => x.field === k);
    fieldStatus[k] = d ? d.kind : 'exact';
  }
  return { diffs, fieldStatus };
}

function printDryRun(cases: ImageCase[]) {
  console.log('=== wardrobe-entry eval dry-run ===');
  console.log('dataset:', DATASET);
  console.log('imagesDir:', path.join(DATASET, 'images'));
  console.log('labelsDir:', path.join(DATASET, 'labels'));
  console.log('skip: TEMPLATE.json, example.json, README.md, reports/*');
  console.log('cases:', cases.length);
  console.log('');
  console.log('| image | label | category | season |');
  console.log('|-------|-------|----------|--------|');
  for (const c of cases) {
    const img = path.basename(c.localImagePath || '');
    const lbl = path.basename(c.labelPath);
    console.log(
      `| ${img} | ${lbl} | ${c.label.category ?? ''} | ${c.label.season ?? ''} |`,
    );
  }
  console.log('');
  console.log('dry-run OK（未调用 Vision/OCR）');
}

async function runVersion(
  version: VersionId,
  cases: ImageCase[],
  apiBase: string,
  timeoutMs: number,
  prompt: string,
  promptVersion: string,
): Promise<{ runId: string; cases: CaseResult[] }> {
  const runId = `${runIdNow()}-${version}`;
  const nowYear = new Date().getFullYear();
  if (version === 'current') ensureOcrBinary();

  const results: CaseResult[] = [];
  for (const c of cases) {
    if (!c.localImagePath) throw new Error(`missing image for ${c.id}`);
    console.log(`\n[${version}] ${c.id}`);

    let ocrRaw = '';
    let ocrDate: string | null = null;
    if (version === 'current') {
      console.log('  OCR …');
      ocrRaw = runOcr(c.localImagePath);
      const ext = extractPurchaseDateFromOcr(ocrRaw, { nowYear });
      ocrDate = ext.purchaseDate;
      console.log(`  OCR purchaseDate=${ocrDate || '(空)'} (${ext.strategy})`);
    }

    console.log('  upload + /ai/vision …');
    const up = await uploadEvalImage(apiBase, c.localImagePath, timeoutMs);
    if (!up.ok) throw new Error(`upload ${c.id}: ${up.error}`);
    const vision = await callWorkerVision(apiBase, up.url, prompt, timeoutMs);
    const visionRaw = vision.ok ? vision.text : `ERROR: ${vision.error}`;
    const parsed = vision.ok ? tryParseJsonObject(vision.text) : null;
    const vis = extractVisionFields(parsed);

    const prediction: Record<string, string> = { ...vis };
    const sources: Record<string, string> = {
      name: 'vision',
      category: 'vision',
      color: 'vision',
      price: 'vision',
      season: 'vision',
      purchaseDate: 'vision',
    };
    if (version === 'current') {
      prediction.purchaseDate = ocrDate || '';
      sources.purchaseDate = 'ocr';
    }

    const label = labelSlice(c.label);
    const { diffs, fieldStatus } = scoreCase(label, prediction, !!parsed);

    console.log(
      `  pred cat=${prediction.category || '(空)'} color=${prediction.color || '(空)'} price=${prediction.price || '(空)'} date=${prediction.purchaseDate || '(空)'} season=${prediction.season || '(空)'}`,
    );

    results.push({
      id: c.id,
      image: path.basename(c.localImagePath),
      labelFile: path.basename(c.labelPath),
      label,
      prediction,
      sources,
      visionRaw,
      ocrRaw: version === 'current' ? ocrRaw : undefined,
      visionOk: vision.ok,
      parseOk: !!parsed,
      diffs,
      fieldStatus,
    });
  }

  const outDir = path.join(EVAL_ROOT, 'reports/raw', `${runId}-wardrobe-entry`);
  fs.mkdirSync(outDir, { recursive: true });
  const summary = {
    runId,
    version,
    versionLabel: version === 'baseline' ? 'v1 Vision-only' : 'v2 Vision+OCR(date)',
    dataset: 'datasets/wardrobe-entry',
    promptVersion,
    promptSource: 'src/wardrobe/app.ts#AI_PROMPT',
    fields: EVAL_FIELDS,
    cases: results,
    metrics: computeMetrics(results),
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  const reportName =
    version === 'baseline'
      ? 'wardrobe-entry-eval-baseline.md'
      : 'wardrobe-entry-eval-current.md';
  const reportPath = path.join(EVAL_ROOT, 'reports', reportName);
  fs.writeFileSync(reportPath, renderVersionReport(summary));
  console.log(`\n[${version}] report: ${reportPath}`);
  console.log(`[${version}] raw: ${outDir}`);
  return { runId, cases: results };
}

function computeMetrics(results: CaseResult[]) {
  const byField: Record<
    string,
    { labeled: number; exact: number; usable: number; missing: number; value_mismatch: number }
  > = {};
  for (const f of EVAL_FIELDS) {
    byField[f] = { labeled: 0, exact: 0, usable: 0, missing: 0, value_mismatch: 0 };
  }
  for (const r of results) {
    for (const f of EVAL_FIELDS) {
      const st = r.fieldStatus[f];
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

function renderVersionReport(summary: {
  runId: string;
  version: string;
  versionLabel: string;
  promptVersion: string;
  cases: CaseResult[];
  metrics: ReturnType<typeof computeMetrics>;
}): string {
  const lines: string[] = [];
  lines.push(`# wardrobe-entry evaluation — ${summary.versionLabel}`);
  lines.push('');
  lines.push(`- **runId:** \`${summary.runId}\``);
  lines.push(`- **version:** \`${summary.version}\``);
  lines.push(`- **dataset:** \`datasets/wardrobe-entry\``);
  lines.push(`- **promptVersion:** \`${summary.promptVersion}\``);
  lines.push(`- **样本数:** ${summary.cases.length}`);
  lines.push('');
  lines.push('## Accuracy（相对 gold；usable = exact + format_mismatch + semantic_match）');
  lines.push('');
  lines.push('| 字段 | labeled | exact | usable | usable% | missing | value_mismatch |');
  lines.push('|------|---------|-------|--------|---------|---------|----------------|');
  for (const f of EVAL_FIELDS) {
    const m = summary.metrics.byField[f];
    const pct = m.labeled ? Math.round((m.usable / m.labeled) * 1000) / 10 : 0;
    lines.push(
      `| ${f} | ${m.labeled} | ${m.exact} | ${m.usable} | ${pct}% | ${m.missing} | ${m.value_mismatch} |`,
    );
  }
  lines.push('');

  for (const c of summary.cases) {
    lines.push(`## Case \`${c.id}\``);
    lines.push('');
    lines.push(`- image: \`${c.image}\``);
    lines.push(`- label: \`${c.labelFile}\``);
    lines.push(`- visionOk=${c.visionOk} parseOk=${c.parseOk}`);
    lines.push('');
    lines.push('### gold');
    lines.push('```json');
    lines.push(JSON.stringify(c.label, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('### prediction');
    lines.push('```json');
    lines.push(JSON.stringify({ ...c.prediction, _sources: c.sources }, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('### diff');
    lines.push('');
    if (!c.diffs.length) {
      lines.push('- （所列已标注字段 exact match 或未标注）');
    } else {
      for (const d of c.diffs) {
        lines.push(
          `- **${d.field}** \`${d.kind}\`: gold \`${JSON.stringify(d.expected)}\` → pred \`${JSON.stringify(d.actual)}\``,
        );
      }
    }
    lines.push('');
    lines.push('### Vision raw');
    lines.push('```');
    lines.push(c.visionRaw || '(空)');
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

function renderCompareReport(
  baseline: { runId: string; cases: CaseResult[]; metrics: ReturnType<typeof computeMetrics> },
  current: { runId: string; cases: CaseResult[]; metrics: ReturnType<typeof computeMetrics> },
): string {
  const lines: string[] = [];
  lines.push('# wardrobe-entry evaluation — baseline(v1) vs current(v2)');
  lines.push('');
  lines.push(`- **baseline runId:** \`${baseline.runId}\` — Vision-only`);
  lines.push(`- **current runId:** \`${current.runId}\` — Vision + OCR(purchaseDate)`);
  lines.push('');
  lines.push('## 字段 usable% 对比');
  lines.push('');
  lines.push('| 字段 | baseline v1 | current v2 | Δ |');
  lines.push('|------|-------------|------------|---|');
  for (const f of EVAL_FIELDS) {
    const b = baseline.metrics.byField[f];
    const c = current.metrics.byField[f];
    const bp = b.labeled ? Math.round((b.usable / b.labeled) * 1000) / 10 : 0;
    const cp = c.labeled ? Math.round((c.usable / c.labeled) * 1000) / 10 : 0;
    const delta = Math.round((cp - bp) * 10) / 10;
    lines.push(`| ${f} | ${bp}% (${b.usable}/${b.labeled}) | ${cp}% (${c.usable}/${c.labeled}) | ${delta >= 0 ? '+' : ''}${delta} |`);
  }
  lines.push('');
  lines.push('## 分 case purchaseDate');
  lines.push('');
  lines.push('| id | gold | v1 Vision | v2 OCR |');
  lines.push('|----|------|-----------|--------|');
  for (const b of baseline.cases) {
    const c = current.cases.find((x) => x.id === b.id);
    lines.push(
      `| ${b.id} | ${b.label.purchaseDate || '(空)'} | ${b.prediction.purchaseDate || '(空)'} | ${c?.prediction.purchaseDate || '(空)'} |`,
    );
  }
  lines.push('');
  lines.push('详细报告: `wardrobe-entry-eval-baseline.md` / `wardrobe-entry-eval-current.md`');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const { dryRun, version } = parseArgs(process.argv.slice(2));
  const cases = listWardrobeEntryCases();
  if (!cases.length) {
    console.error('datasets/wardrobe-entry 无配对用例（需 images/<id>.* + labels/<id>.json）');
    process.exit(1);
  }

  if (dryRun) {
    printDryRun(cases);
    return;
  }

  const { apiBase, timeoutMs } = loadConfig();
  const prod = loadAIPromptFromApp();
  console.log(`apiBase=${apiBase}`);
  console.log(`promptVersion=${prod.promptVersion}`);
  console.log(`version=${version}`);

  const versions: VersionId[] =
    version === 'both' ? ['baseline', 'current'] : [version];

  const ran: Partial<Record<VersionId, Awaited<ReturnType<typeof runVersion>>>> = {};
  for (const v of versions) {
    ran[v] = await runVersion(v, cases, apiBase, timeoutMs, prod.prompt, prod.promptVersion);
  }

  if (version === 'both' && ran.baseline && ran.current) {
    const comparePath = path.join(EVAL_ROOT, 'reports/wardrobe-entry-eval-compare.md');
    fs.writeFileSync(
      comparePath,
      renderCompareReport(
        {
          runId: ran.baseline.runId,
          cases: ran.baseline.cases,
          metrics: computeMetrics(ran.baseline.cases),
        },
        {
          runId: ran.current.runId,
          cases: ran.current.cases,
          metrics: computeMetrics(ran.current.cases),
        },
      ),
    );
    console.log('compare report:', comparePath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
