/**
 * Beta2.2 本地冒烟：验证生产 prompt 拼装 + OCR merge（不调 prompt、不部署）
 * Vision 走 Worker；OCR 用本机 vision-ocr（与评测同源规则；浏览器侧为 tesseract）
 *
 * node --experimental-strip-types scripts/ai-evaluation/run-beta22-local-smoke.ts
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
import {
  AI_BETA_FIELD_INDEPENDENCE_PATCH,
  AI_BETA_PRODUCT_FOCUS_PATCH,
  getVisionPrompt,
} from '../../src/wardrobe/aiBeta22.ts';

const REPORT = path.join(EVAL_ROOT, 'reports/beta22-local-smoke.md');
const OCR_BIN = path.join(EVAL_ROOT, 'ocr/vision-ocr');

function ensureOcr() {
  if (fs.existsSync(OCR_BIN)) return;
  const swift = path.join(EVAL_ROOT, 'ocr/vision-ocr.swift');
  const r = spawnSync('swiftc', ['-O', swift, '-o', OCR_BIN], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

function runOcr(img: string) {
  const r = spawnSync(OCR_BIN, [img], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return String(r.stdout || '');
}

function catOf(text: string) {
  const parsed = tryParseJsonObject(text);
  if (!parsed) return '(解析失败)';
  const { target } = resolveCompareTarget(parsed);
  const v = (target && target.category) || parsed.category;
  return v == null || v === '' ? '(空)' : String(v).trim();
}

async function main() {
  const prod = loadAIPromptFromApp();
  const beta2 = getVisionPrompt(prod.prompt, 'beta2');
  // 断言：生产拼装 = 原文 + 两段补丁（与 aiBeta22 一致）
  const expect = prod.prompt + AI_BETA_PRODUCT_FOCUS_PATCH + AI_BETA_FIELD_INDEPENDENCE_PATCH;
  if (beta2 !== expect) throw new Error('getVisionPrompt(beta2) 与冻结补丁不一致');
  const ver = createHash('sha256').update(beta2).digest('hex').slice(0, 12);
  console.log('prod=', prod.promptVersion, 'beta2=', ver);

  ensureOcr();
  const { apiBase, timeoutMs } = loadConfig();
  const cases = listWardrobeEntryCases();
  const rows: Array<Record<string, string>> = [];

  for (const c of cases) {
    if (!c.localImagePath) throw new Error(c.id);
    const goldCat = String(c.label.category || '');
    const goldDate = String(c.label.purchaseDate || '');
    process.stdout.write(`[smoke] ${c.id} … `);
    const ocrDate = extractPurchaseDateFromOcr(runOcr(c.localImagePath)).purchaseDate || '';
    const up = await uploadEvalImage(apiBase, c.localImagePath, timeoutMs);
    if (!up.ok) throw new Error(up.error);
    const v = await callWorkerVision(apiBase, up.url, beta2, timeoutMs);
    const predCat = v.ok ? catOf(v.text) : '(调用失败)';
    const predDate = ocrDate;
    console.log(`cat=${predCat} date=${predDate || '(空)'}`);
    rows.push({
      id: c.id,
      goldCat,
      predCat,
      catOk: goldCat && goldCat === predCat ? 'yes' : 'no',
      goldDate: goldDate || '(空)',
      predDate: predDate || '(空)',
      dateOk: !goldDate ? '—' : goldDate === predDate ? 'yes' : 'no',
    });
  }

  const catHit = rows.filter((r) => r.catOk === 'yes').length;
  const dateLabeled = rows.filter((r) => r.dateOk !== '—');
  const dateHit = dateLabeled.filter((r) => r.dateOk === 'yes').length;
  const lines = [
    '# Beta2.2 local smoke',
    '',
    `- promptVersion beta2: \`${ver}\``,
    `- source: production AI_PROMPT + aiBeta22 patches + OCR merge`,
    `- category: **${catHit}/${rows.length}**`,
    `- purchaseDate (OCR): **${dateHit}/${dateLabeled.length}**`,
    '',
    '| id | gold cat | pred cat | ok | gold date | OCR date | ok |',
    '|----|----------|----------|----|-----------|----------|----|',
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.goldCat} | ${r.predCat} | ${r.catOk} | ${r.goldDate} | ${r.predDate} | ${r.dateOk} |`,
    ),
    '',
    'UI 手动验证：`npm run dev` → 设置页切换 Beta2.2 → 上传订单截图核对 category / 购买日期 / 保存。',
    '',
  ];
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log('report:', REPORT);
  console.log(`category ${catHit}/${rows.length} | purchaseDate ${dateHit}/${dateLabeled.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
