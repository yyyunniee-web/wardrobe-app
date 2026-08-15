/**
 * 最小 category A/B（评测专用，不改生产）
 *
 * 默认（回归）:
 *   A = 生产 AI_PROMPT
 *   B = prompts/category-hierarchy-exp.txt
 *   → reports/category-regression-eval.md
 *
 * 商品主体优先:
 *   node --experimental-strip-types scripts/ai-evaluation/run-category-ab.ts --product-focus
 *   A = hierarchy
 *   B = prompts/category-product-focus-exp.txt
 *   → reports/category-product-focus-ab.md
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  EVAL_ROOT,
  listWardrobeEntryCases,
  loadAIPromptFromApp,
  loadConfig,
  loadEvalPrompt,
  resolveCompareTarget,
  tryParseJsonObject,
} from './lib/dataset.ts';
import { callWorkerVision, uploadEvalImage } from './lib/vision-client.ts';

const HIERARCHY = 'prompts/category-hierarchy-exp.txt';
const PRODUCT_FOCUS = 'prompts/category-product-focus-exp.txt';

function parseMode(argv: string[]) {
  if (argv.includes('--product-focus')) {
    return {
      title: 'category product-focus A/B',
      aLabel: 'A hierarchy',
      bLabel: 'B product-focus',
      aSource: 'file' as const,
      aFile: HIERARCHY,
      bFile: PRODUCT_FOCUS,
      reportRel: 'reports/category-product-focus-ab.md',
      focusBras: true,
      checkRegression: true,
    };
  }
  return {
    title: 'category regression eval（最小 A/B）',
    aLabel: 'A 生产',
    bLabel: 'B hierarchy',
    aSource: 'prod' as const,
    aFile: null as string | null,
    bFile: HIERARCHY,
    reportRel: 'reports/category-regression-eval.md',
    focusBras: true,
    checkRegression: false,
  };
}

function catOf(text: string): string {
  const parsed = tryParseJsonObject(text);
  if (!parsed) return '(解析失败)';
  const { target } = resolveCompareTarget(parsed);
  const v = (target && target.category) || parsed.category;
  return v == null || v === '' ? '(空)' : String(v).trim();
}

async function runArm(
  label: string,
  prompt: string,
  cases: ReturnType<typeof listWardrobeEntryCases>,
  apiBase: string,
  timeoutMs: number,
) {
  const rows: { id: string; gold: string; pred: string }[] = [];
  for (const c of cases) {
    if (!c.localImagePath) throw new Error(`no image ${c.id}`);
    const gold = String(c.label.category || '').trim();
    process.stdout.write(`[${label}] ${c.id} … `);
    const up = await uploadEvalImage(apiBase, c.localImagePath, timeoutMs);
    if (!up.ok) throw new Error(up.error);
    const v = await callWorkerVision(apiBase, up.url, prompt, timeoutMs);
    const pred = v.ok ? catOf(v.text) : '(调用失败)';
    console.log(`gold=${gold} pred=${pred}`);
    rows.push({ id: c.id, gold, pred });
  }
  return rows;
}

function accuracy(rows: { gold: string; pred: string }[]) {
  const hit = rows.filter((r) => r.gold && r.gold === r.pred).length;
  return { hit, n: rows.length, pct: rows.length ? Math.round((hit / rows.length) * 1000) / 10 : 0 };
}

function confusion(rows: { gold: string; pred: string }[]) {
  const m = new Map<string, Map<string, number>>();
  const labels = new Set<string>();
  for (const r of rows) {
    labels.add(r.gold);
    labels.add(r.pred);
    if (!m.has(r.gold)) m.set(r.gold, new Map());
    const row = m.get(r.gold)!;
    row.set(r.pred, (row.get(r.pred) || 0) + 1);
  }
  const cols = [...labels].sort();
  const lines = [
    '| gold \\ pred | ' + cols.join(' | ') + ' |',
    '|---|' + cols.map(() => '---').join('|') + '|',
  ];
  for (const g of [...m.keys()].sort()) {
    const row = m.get(g)!;
    lines.push(`| ${g} | ${cols.map((p) => String(row.get(p) || 0)).join(' | ')} |`);
  }
  return lines.join('\n');
}

function mainReport(
  mode: ReturnType<typeof parseMode>,
  a: { id: string; gold: string; pred: string }[],
  b: { id: string; gold: string; pred: string }[],
  aMeta: { promptVersion: string; source: string },
  bMeta: { promptVersion: string; source: string },
) {
  const accA = accuracy(a);
  const accB = accuracy(b);
  const bras = a.filter((r) => r.id.startsWith('bra_'));
  const lines: string[] = [];
  lines.push(`# ${mode.title}`);
  lines.push('');
  lines.push('- dataset: `datasets/wardrobe-entry`（8，单次）');
  lines.push(`- ${mode.aLabel}: \`${aMeta.source}\` (\`${aMeta.promptVersion}\`)`);
  lines.push(`- ${mode.bLabel}: \`${bMeta.source}\` (\`${bMeta.promptVersion}\`)`);
  lines.push('- 生产代码未改');
  lines.push('');
  lines.push('## category accuracy');
  lines.push('');
  lines.push('| arm | exact | accuracy |');
  lines.push('|-----|-------|----------|');
  lines.push(`| A | ${accA.hit}/${accA.n} | **${accA.pct}%** |`);
  lines.push(`| B | ${accB.hit}/${accB.n} | **${accB.pct}%** |`);
  const delta = Math.round((accB.pct - accA.pct) * 10) / 10;
  lines.push('');
  lines.push(`Δ (B−A) = **${delta >= 0 ? '+' : ''}${delta}** pp`);
  lines.push('');

  if (mode.focusBras) {
    lines.push('## Focus: bra_*');
    lines.push('');
    lines.push('| id | gold | A | B | A ok | B ok |');
    lines.push('|----|------|---|---|------|------|');
    for (const r of bras) {
      const rb = b.find((x) => x.id === r.id)!;
      lines.push(
        `| ${r.id} | ${r.gold} | ${r.pred} | ${rb.pred} | ${r.pred === r.gold ? 'yes' : 'no'} | ${rb.pred === rb.gold ? 'yes' : 'no'} |`,
      );
    }
    lines.push('');
  }

  if (mode.checkRegression) {
    lines.push('## 其他类别是否退化（非 bra_*）');
    lines.push('');
    lines.push('| id | gold | A | B | regress? |');
    lines.push('|----|------|---|---|----------|');
    for (const r of a.filter((x) => !x.id.startsWith('bra_'))) {
      const rb = b.find((x) => x.id === r.id)!;
      const aOk = r.pred === r.gold;
      const bOk = rb.pred === rb.gold;
      const regress = aOk && !bOk ? 'YES' : 'no';
      lines.push(`| ${r.id} | ${r.gold} | ${r.pred} | ${rb.pred} | ${regress} |`);
    }
    const regressN = a
      .filter((x) => !x.id.startsWith('bra_'))
      .filter((r) => {
        const rb = b.find((x) => x.id === r.id)!;
        return r.pred === r.gold && rb.pred !== rb.gold;
      }).length;
    lines.push('');
    lines.push(`非 bra 退化数: **${regressN}**`);
    lines.push('');
  }

  lines.push('## confusion matrix');
  lines.push('');
  lines.push('### A');
  lines.push('');
  lines.push(confusion(a));
  lines.push('');
  lines.push('### B');
  lines.push('');
  lines.push(confusion(b));
  lines.push('');
  lines.push('## all predictions');
  lines.push('');
  lines.push('| id | gold | A | B |');
  lines.push('|----|------|---|---|');
  for (const r of a) {
    const rb = b.find((x) => x.id === r.id)!;
    lines.push(`| ${r.id} | ${r.gold} | ${r.pred} | ${rb.pred} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const cases = listWardrobeEntryCases();
  const { apiBase, timeoutMs } = loadConfig();
  const pa =
    mode.aSource === 'prod' ? loadAIPromptFromApp() : loadEvalPrompt(mode.aFile);
  const pb = loadEvalPrompt(mode.bFile);
  const reportPath = path.join(EVAL_ROOT, mode.reportRel);

  console.log(`mode=${mode.title}`);
  console.log(`cases=${cases.length} A=${pa.promptVersion} B=${pb.promptVersion}`);
  const rowsA = await runArm('A', pa.prompt, cases, apiBase, timeoutMs);
  const rowsB = await runArm('B', pb.prompt, cases, apiBase, timeoutMs);
  fs.writeFileSync(
    reportPath,
    mainReport(mode, rowsA, rowsB, { promptVersion: pa.promptVersion, source: pa.source }, {
      promptVersion: pb.promptVersion,
      source: pb.source,
    }),
  );
  console.log('report:', reportPath);
  console.log(accuracy(rowsA), '→', accuracy(rowsB));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
