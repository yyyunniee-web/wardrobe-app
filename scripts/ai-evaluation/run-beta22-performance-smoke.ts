/**
 * Beta2.2 performance smoke（不改生产 / 不改 prompt / 不改 accuracy 评测）
 *
 * 对齐生产 P0 时序：upload → Vision（主路径）→ OCR（后台，timeout 12s）
 * 数据集：datasets/wardrobe-entry 8 张
 *
 * 输出：reports/beta22-performance-smoke.md
 *
 * node --experimental-strip-types scripts/ai-evaluation/run-beta22-performance-smoke.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  EVAL_ROOT,
  listWardrobeEntryCases,
  loadAIPromptFromApp,
  loadConfig,
  resolveCompareTarget,
  tryParseJsonObject,
} from './lib/dataset.ts';
import { callWorkerVision, uploadEvalImage } from './lib/vision-client.ts';
import { extractPurchaseDateFromOcr } from './ocr/extract-purchase-date.ts';
import { getVisionPrompt } from '../../src/wardrobe/aiBeta22.ts';

const REPORT = path.join(EVAL_ROOT, 'reports/beta22-performance-smoke.md');
const OCR_BIN = path.join(EVAL_ROOT, 'ocr/vision-ocr');
/** 与生产 ocrClient 默认一致 */
const OCR_TIMEOUT_MS = 12000;

type OcrOutcome = 'success' | 'fail' | 'timeout' | 'empty';

type CaseTiming = {
  caseName: string;
  uploadMs: number;
  visionStartOffsetMs: number;
  visionEndOffsetMs: number;
  visionMs: number;
  ocrStartOffsetMs: number;
  ocrEndOffsetMs: number;
  ocrMs: number;
  ocrOutcome: OcrOutcome;
  pipelineCompleteOffsetMs: number;
  category: string;
  purchaseDate: string;
  visionOk: boolean;
  parseOk: boolean;
};

function now(): number {
  return Date.now();
}

function ensureOcr(): void {
  if (fs.existsSync(OCR_BIN)) return;
  const swift = path.join(EVAL_ROOT, 'ocr/vision-ocr.swift');
  const r = spawnSync('swiftc', ['-O', swift, '-o', OCR_BIN], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`swiftc failed: ${r.stderr || r.stdout}`);
}

function runOcrTimed(imagePath: string): {
  ms: number;
  outcome: OcrOutcome;
  purchaseDate: string;
  error?: string;
} {
  const t0 = now();
  const r = spawnSync(OCR_BIN, [imagePath], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: OCR_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  const ms = now() - t0;
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    return { ms, outcome: 'timeout', purchaseDate: '', error: 'OCR timeout' };
  }
  if (r.status !== 0) {
    return {
      ms,
      outcome: 'fail',
      purchaseDate: '',
      error: String(r.stderr || r.stdout || r.error || 'ocr fail'),
    };
  }
  const raw = String(r.stdout || '');
  const ext = extractPurchaseDateFromOcr(raw);
  if (!ext.purchaseDate) {
    return { ms, outcome: 'empty', purchaseDate: '' };
  }
  return { ms, outcome: 'success', purchaseDate: ext.purchaseDate };
}

function catOf(text: string): { category: string; parseOk: boolean } {
  const parsed = tryParseJsonObject(text);
  if (!parsed) return { category: '(解析失败)', parseOk: false };
  const { target } = resolveCompareTarget(parsed);
  const v = (target && target.category) || parsed.category;
  return {
    category: v == null || v === '' ? '(空)' : String(v).trim(),
    parseOk: true,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function renderReport(
  rows: CaseTiming[],
  meta: { runId: string; promptVersion: string; apiBase: string },
): string {
  const pipeline = rows.map((r) => r.pipelineCompleteOffsetMs).sort((a, b) => a - b);
  const vision = rows.map((r) => r.visionMs).sort((a, b) => a - b);
  const upload = rows.map((r) => r.uploadMs).sort((a, b) => a - b);
  const ocr = rows.map((r) => r.ocrMs).sort((a, b) => a - b);

  const ocrSuccess = rows.filter((r) => r.ocrOutcome === 'success').length;
  const ocrTimeout = rows.filter((r) => r.ocrOutcome === 'timeout').length;
  const ocrFail = rows.filter((r) => r.ocrOutcome === 'fail').length;
  const ocrEmpty = rows.filter((r) => r.ocrOutcome === 'empty').length;

  const lines: string[] = [];
  lines.push('# Beta2.2 performance smoke');
  lines.push('');
  lines.push('自动跑 `datasets/wardrobe-entry` 8 张素材；**不改生产逻辑 / 不改 prompt / 不改 accuracy 评测**。');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- **runId:** \`${meta.runId}\``);
  lines.push(`- **apiBase:** \`${meta.apiBase}\``);
  lines.push(`- **prompt:** 生产 AI_PROMPT + Beta2.2 最小增量 (\`${meta.promptVersion}\`)`);
  lines.push(`- **OCR:** 本机 \`vision-ocr\` + 评测日期规则；**timeout=${OCR_TIMEOUT_MS}ms**（对齐生产）`);
  lines.push('- **时序:** upload → Vision → OCR（模拟生产 P0：OCR 不挡表单，但仍计入 pipeline 完成）');
  lines.push('');

  lines.push('## Summary metrics');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|------|----|');
  lines.push(`| cases | ${rows.length} |`);
  lines.push(`| pipeline 平均耗时 | **${round1(avg(pipeline))} ms** |`);
  lines.push(`| pipeline P50 | **${round1(percentile(pipeline, 50))} ms** |`);
  lines.push(`| pipeline P95 | **${round1(percentile(pipeline, 95))} ms** |`);
  lines.push(`| Vision 平均 | ${round1(avg(vision))} ms |`);
  lines.push(`| Vision P50 / P95 | ${round1(percentile(vision, 50))} / ${round1(percentile(vision, 95))} ms |`);
  lines.push(`| upload 平均 | ${round1(avg(upload))} ms |`);
  lines.push(`| OCR 平均 | ${round1(avg(ocr))} ms |`);
  lines.push(`| OCR 成功率 (抽到日期) | **${ocrSuccess}/${rows.length}** (${rows.length ? round1((ocrSuccess / rows.length) * 100) : 0}%) |`);
  lines.push(`| OCR timeout 数量 | **${ocrTimeout}** |`);
  lines.push(`| OCR fail / empty | ${ocrFail} / ${ocrEmpty} |`);
  lines.push(`| Vision ok / parse ok | ${rows.filter((r) => r.visionOk).length}/${rows.length} / ${rows.filter((r) => r.parseOk).length}/${rows.length} |`);
  lines.push('');

  lines.push('## Per-case');
  lines.push('');
  lines.push(
    '| case | upload ms | Vision start | Vision end | Vision ms | OCR start | OCR end | OCR ms | OCR | pipeline ms | category | purchaseDate |',
  );
  lines.push(
    '|------|-----------|--------------|------------|-----------|-----------|---------|--------|-----|-------------|----------|--------------|',
  );
  for (const r of rows) {
    lines.push(
      `| ${r.caseName} | ${r.uploadMs} | +${r.visionStartOffsetMs} | +${r.visionEndOffsetMs} | ${r.visionMs} | +${r.ocrStartOffsetMs} | +${r.ocrEndOffsetMs} | ${r.ocrMs} | ${r.ocrOutcome} | **${r.pipelineCompleteOffsetMs}** | ${r.category} | ${r.purchaseDate || '(空)'} |`,
    );
  }
  lines.push('');
  lines.push('时间列：`+N` 为相对该 case 开始（ms）；`pipeline ms` = OCR 结束相对 case 开始（Vision 已先完成）。');
  lines.push('');
  lines.push('## Stability note');
  lines.push('');
  const maxPipe = Math.max(...pipeline, 0);
  const unstable =
    ocrTimeout > 0 || maxPipe > 60000 || rows.some((r) => !r.visionOk);
  lines.push(
    unstable
      ? `- 观测到 timeout / Vision 失败 / 单案 >60s → **需关注稳定性**（timeout=${ocrTimeout}, maxPipeline=${maxPipe}ms）。`
      : `- 本轮无 OCR timeout，Vision 全部返回，单案 pipeline ≤60s → **本轮表现稳定**。`,
  );
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const cases = listWardrobeEntryCases();
  if (!cases.length) {
    console.error('no wardrobe-entry cases');
    process.exit(1);
  }

  const { apiBase, timeoutMs } = loadConfig();
  const prod = loadAIPromptFromApp();
  const prompt = getVisionPrompt(prod.prompt, 'beta2');
  const promptVersion = createHash('sha256').update(prompt).digest('hex').slice(0, 12);
  ensureOcr();

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const runId = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-perf`;

  console.log(`apiBase=${apiBase}`);
  console.log(`promptVersion=${promptVersion} cases=${cases.length} ocrTimeout=${OCR_TIMEOUT_MS}ms`);

  const rows: CaseTiming[] = [];

  for (const c of cases) {
    if (!c.localImagePath) throw new Error(`missing image ${c.id}`);
    const caseStart = now();
    console.log(`\n[${c.id}]`);

    process.stdout.write('  upload… ');
    const tUpload0 = now();
    const up = await uploadEvalImage(apiBase, c.localImagePath, timeoutMs);
    const uploadMs = now() - tUpload0;
    if (!up.ok) throw new Error(`upload ${c.id}: ${up.error}`);
    console.log(`${uploadMs}ms`);

    const visionStartOffsetMs = now() - caseStart;
    process.stdout.write('  vision… ');
    const tVis0 = now();
    const vision = await callWorkerVision(apiBase, up.url, prompt, timeoutMs);
    const visionMs = now() - tVis0;
    const visionEndOffsetMs = now() - caseStart;
    const { category, parseOk } = vision.ok
      ? catOf(vision.text)
      : { category: '(调用失败)', parseOk: false };
    console.log(`${visionMs}ms cat=${category}`);

    const ocrStartOffsetMs = now() - caseStart;
    process.stdout.write('  ocr… ');
    const ocr = runOcrTimed(c.localImagePath);
    const ocrEndOffsetMs = now() - caseStart;
    console.log(`${ocr.ms}ms ${ocr.outcome} date=${ocr.purchaseDate || '(空)'}`);

    const pipelineCompleteOffsetMs = ocrEndOffsetMs;

    rows.push({
      caseName: c.id,
      uploadMs,
      visionStartOffsetMs,
      visionEndOffsetMs,
      visionMs,
      ocrStartOffsetMs,
      ocrEndOffsetMs,
      ocrMs: ocr.ms,
      ocrOutcome: ocr.outcome,
      pipelineCompleteOffsetMs,
      category,
      purchaseDate: ocr.purchaseDate,
      visionOk: vision.ok,
      parseOk,
    });
  }

  const md = renderReport(rows, { runId, promptVersion, apiBase });
  fs.writeFileSync(REPORT, md);

  const rawDir = path.join(EVAL_ROOT, 'reports/raw', runId);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'performance.json'), JSON.stringify({ runId, rows }, null, 2));

  const pipes = rows.map((r) => r.pipelineCompleteOffsetMs).sort((a, b) => a - b);
  console.log('\nreport:', REPORT);
  console.log(
    `pipeline avg=${round1(avg(pipes))} P50=${round1(percentile(pipes, 50))} P95=${round1(percentile(pipes, 95))} ms`,
  );
  console.log(
    `OCR success=${rows.filter((r) => r.ocrOutcome === 'success').length}/${rows.length} timeout=${rows.filter((r) => r.ocrOutcome === 'timeout').length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
