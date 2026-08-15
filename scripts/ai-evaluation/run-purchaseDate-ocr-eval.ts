/**
 * 实验 B：purchaseDate Vision-only vs OCR+规则
 * node --experimental-strip-types scripts/ai-evaluation/run-purchaseDate-ocr-eval.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  EVAL_ROOT,
  listImageRecognitionCases,
  loadAIPromptFromApp,
  loadConfig,
  resolveCompareTarget,
  resolvePurchaseDateActual,
  tryParseJsonObject,
} from './lib/dataset.ts';
import { callWorkerVision, uploadEvalImage } from './lib/vision-client.ts';
import { extractPurchaseDateFromOcr } from './ocr/extract-purchase-date.ts';

const IDS = ['bra_001', 'shoes-001', 'shorts001', 'tshirt_001'];
const REPEATS = 5;
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
  const r = spawnSync('swiftc', ['-O', OCR_SWIFT, '-o', OCR_BIN], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`swiftc failed: ${r.stderr || r.stdout}`);
  }
}

function runOcr(imagePath: string): string {
  const r = spawnSync(OCR_BIN, [imagePath], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`ocr failed for ${imagePath}: ${r.stderr || r.stdout}`);
  }
  return String(r.stdout || '').trim();
}

function visionPurchaseDate(rawText: string): string | null {
  const parsed = tryParseJsonObject(rawText);
  if (!parsed) return null;
  const { compareSource, target } = resolveCompareTarget(parsed);
  const { actual } = resolvePurchaseDateActual(parsed, target, compareSource);
  if (actual == null || actual === '') return null;
  return String(actual);
}

async function main() {
  ensureOcrBinary();
  const { apiBase, timeoutMs } = loadConfig();
  const prod = loadAIPromptFromApp();
  const cases = listImageRecognitionCases().filter((c) => IDS.includes(c.id));
  if (cases.length !== IDS.length) {
    throw new Error(`missing cases: need ${IDS.join(',')}`);
  }

  const suiteId = runIdNow();
  const nowYear = new Date().getFullYear();
  console.log(`suiteId=${suiteId}`);
  console.log(`promptVersion=${prod.promptVersion}`);
  console.log(`nowYear=${nowYear}`);

  type CaseOut = {
    id: string;
    label: string;
    imagePath: string;
    ocrText: string;
    ocrRuns: Array<{ repeat: number; purchaseDate: string | null; snippet: string | null; strategy: string }>;
    visionRuns: Array<{
      repeat: number;
      purchaseDate: string | null;
      jsonOk: boolean;
      ok: boolean;
      error?: string;
    }>;
  };

  const outs: CaseOut[] = [];

  for (const c of cases) {
    if (!c.localImagePath) throw new Error(`no image ${c.id}`);
    const label = c.label.purchaseDate ? String(c.label.purchaseDate) : '';
    console.log(`\n=== ${c.id} OCR ×${REPEATS} ===`);
    const ocrRuns: CaseOut['ocrRuns'] = [];
    let ocrText = '';
    for (let i = 1; i <= REPEATS; i++) {
      const text = runOcr(c.localImagePath);
      if (i === 1) ocrText = text;
      const ext = extractPurchaseDateFromOcr(text, { nowYear });
      ocrRuns.push({
        repeat: i,
        purchaseDate: ext.purchaseDate,
        snippet: ext.matchedSnippet,
        strategy: ext.strategy,
      });
      console.log(`[ocr] r${i} date=${ext.purchaseDate || '(空)'} strategy=${ext.strategy}`);
    }

    console.log(`[vision] upload ${c.id}`);
    const up = await uploadEvalImage(apiBase, c.localImagePath, timeoutMs);
    if (!up.ok) throw new Error(`upload ${c.id}: ${up.error}`);

    const visionRuns: CaseOut['visionRuns'] = [];
    for (let i = 1; i <= REPEATS; i++) {
      process.stdout.write(`[vision] ${c.id} r${i}/${REPEATS} … `);
      const vision = await callWorkerVision(apiBase, up.url, prod.prompt, timeoutMs);
      if (!vision.ok) {
        console.log('FAIL', vision.error);
        visionRuns.push({
          repeat: i,
          purchaseDate: null,
          jsonOk: false,
          ok: false,
          error: vision.error,
        });
        continue;
      }
      const jsonOk = !!tryParseJsonObject(vision.text);
      const pd = visionPurchaseDate(vision.text);
      console.log(`OK purchaseDate=${pd || '(空)'} json=${jsonOk}`);
      visionRuns.push({ repeat: i, purchaseDate: pd, jsonOk, ok: true });
    }

    outs.push({
      id: c.id,
      label,
      imagePath: c.localImagePath,
      ocrText,
      ocrRuns,
      visionRuns,
    });
  }

  const rawDir = path.join(EVAL_ROOT, 'reports/raw', `${suiteId}-purchaseDate-ocr`);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(
    path.join(rawDir, 'comparison.json'),
    JSON.stringify(
      {
        suiteId,
        promptSource: prod.source,
        promptVersion: prod.promptVersion,
        nowYear,
        repeats: REPEATS,
        cases: outs,
      },
      null,
      2,
    ),
  );

  // write report
  const md = renderReport({
    suiteId,
    promptVersion: prod.promptVersion,
    nowYear,
    repeats: REPEATS,
    cases: outs,
  });
  const mdPath = path.join(EVAL_ROOT, 'reports/purchaseDate-ocr-comparison.md');
  fs.writeFileSync(mdPath, md);
  console.log('\nreport:', mdPath);
  console.log('raw:', rawDir);
}

function uniqueDates(runs: Array<{ purchaseDate: string | null }>): string[] {
  return [
    ...new Set(runs.map((r) => (r.purchaseDate == null || r.purchaseDate === '' ? '(空)' : r.purchaseDate))),
  ];
}

function hitRate(runs: Array<{ purchaseDate: string | null }>, label: string): string {
  if (!label) return 'n/a';
  const ok = runs.filter((r) => r.purchaseDate === label).length;
  return `${ok}/${runs.length}`;
}

function stableRate(runs: Array<{ purchaseDate: string | null }>): string {
  const vals = runs.map((r) => r.purchaseDate || '(空)');
  const freq: Record<string, number> = {};
  for (const v of vals) freq[v] = (freq[v] || 0) + 1;
  const modeCount = Math.max(...Object.values(freq));
  return `${Math.round((modeCount / runs.length) * 1000) / 10}%`;
}

function renderReport(args: {
  suiteId: string;
  promptVersion: string;
  nowYear: number;
  repeats: number;
  cases: Array<{
    id: string;
    label: string;
    ocrText: string;
    ocrRuns: Array<{
      repeat: number;
      purchaseDate: string | null;
      snippet: string | null;
      strategy: string;
    }>;
    visionRuns: Array<{ repeat: number; purchaseDate: string | null; jsonOk: boolean; ok: boolean }>;
  }>;
}): string {
  const lines: string[] = [];
  lines.push('# 实验 B：purchaseDate OCR 对照');
  lines.push('');
  lines.push(`- **suiteId:** \`${args.suiteId}\``);
  lines.push(`- **Vision Prompt:** 生产 \`AI_PROMPT\` / \`${args.promptVersion}\``);
  lines.push(`- **OCR:** macOS Vision framework（\`ocr/vision-ocr\`）+ 规则 \`extract-purchase-date.ts\``);
  lines.push(`- **补年规则:** 仅月日时补当前年 **${args.nowYear}**`);
  lines.push(`- **每图重复:** ${args.repeats} 次（测稳定性）`);
  lines.push(`- **范围:** 仅评测，不接入生产`);
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push('| 图片 | label | OCR 众数/命中 | OCR 稳定率 | Vision 众数/命中 | Vision 稳定率 |');
  lines.push('|------|-------|---------------|------------|------------------|---------------|');
  for (const c of args.cases) {
    const oUniq = uniqueDates(c.ocrRuns);
    const vUniq = uniqueDates(c.visionRuns);
    lines.push(
      `| ${c.id} | ${c.label} | ${oUniq.join(', ')} / ${hitRate(c.ocrRuns, c.label)} | ${stableRate(c.ocrRuns)} | ${vUniq.join(', ')} / ${hitRate(c.visionRuns, c.label)} | ${stableRate(c.visionRuns)} |`,
    );
  }
  lines.push('');

  for (const c of args.cases) {
    lines.push(`## ${c.id}`);
    lines.push('');
    lines.push(`**label:** \`${c.label}\``);
    lines.push('');
    lines.push('### OCR 原文（第 1 次）');
    lines.push('');
    lines.push('```');
    lines.push(c.ocrText || '(空)');
    lines.push('```');
    lines.push('');
    lines.push('### OCR 提取（5 次）');
    lines.push('');
    lines.push('| repeat | purchaseDate | strategy | snippet |');
    lines.push('|--------|--------------|----------|---------|');
    for (const r of c.ocrRuns) {
      lines.push(
        `| r${r.repeat} | ${r.purchaseDate || '(空)'} | ${r.strategy} | ${r.snippet || '—'} |`,
      );
    }
    lines.push('');
    lines.push(
      `- OCR vs label 命中: **${hitRate(c.ocrRuns, c.label)}**；稳定率: **${stableRate(c.ocrRuns)}**`,
    );
    lines.push('');
    lines.push('### Vision-only purchaseDate（生产 Prompt，5 次）');
    lines.push('');
    lines.push('| repeat | purchaseDate | jsonOk |');
    lines.push('|--------|--------------|--------|');
    for (const r of c.visionRuns) {
      lines.push(`| r${r.repeat} | ${r.purchaseDate || '(空)'} | ${r.jsonOk} |`);
    }
    lines.push('');
    lines.push(
      `- Vision vs label 命中: **${hitRate(c.visionRuns, c.label)}**；稳定率: **${stableRate(c.visionRuns)}**`,
    );
    lines.push('');
  }

  lines.push('## 结论');
  lines.push('');
  const ocrHits = args.cases.reduce(
    (n, c) => n + c.ocrRuns.filter((r) => r.purchaseDate === c.label).length,
    0,
  );
  const visHits = args.cases.reduce(
    (n, c) => n + c.visionRuns.filter((r) => r.purchaseDate === c.label).length,
    0,
  );
  const total = args.cases.length * args.repeats;
  lines.push(`- OCR+规则 总命中: **${ocrHits}/${total}**`);
  lines.push(`- Vision-only 总命中: **${visHits}/${total}**`);
  lines.push('- 若 OCR 稳定率接近 100% 且命中高于 Vision，则建议 purchaseDate 拆出 Vision，改 OCR/规则链路（另开产品 PR，本实验不改生产）。');
  lines.push('');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
