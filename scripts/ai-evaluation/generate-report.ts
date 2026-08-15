import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVAL_ROOT, fieldDiff, tryParseJsonObject, type LabelJson } from './lib/dataset.ts';

type CaseResult = {
  id: string;
  imageUrl: string;
  localImage: string | null;
  label: LabelJson;
  promptVersion: string;
  ok: boolean;
  error?: string;
  rawText?: string;
  parsed?: Record<string, unknown> | null;
};

type RunSummary = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  apiBase: string;
  scene: string;
  promptVersion: string;
  cases: CaseResult[];
};

function renderMarkdown(summary: RunSummary): string {
  const lines: string[] = [];
  lines.push('# AI Evaluation Report');
  lines.push('');
  lines.push(`- runId: \`${summary.runId}\``);
  lines.push(`- 时间: ${summary.startedAt} → ${summary.finishedAt}`);
  lines.push(`- 场景: ${summary.scene}`);
  lines.push(`- API: \`${summary.apiBase}/ai/vision\``);
  lines.push(`- promptVersion: \`${summary.promptVersion}\``);
  lines.push(`- 用例数: ${summary.cases.length}`);
  lines.push('');

  for (const c of summary.cases) {
    lines.push('## Case');
    lines.push('');
    lines.push(`编号：\`${c.id}\``);
    lines.push('');
    lines.push('输入：');
    lines.push('');
    lines.push(`- imageUrl: ${c.imageUrl || '(无)'}`);
    if (c.localImage) lines.push(`- localImage: \`${c.localImage}\``);
    lines.push('');
    lines.push('AI 输出：');
    lines.push('');
    if (!c.ok) {
      lines.push('```');
      lines.push(`ERROR: ${c.error || 'unknown'}`);
      lines.push('```');
    } else {
      lines.push('```');
      lines.push(c.rawText || '');
      lines.push('```');
    }
    lines.push('');
    lines.push('人工标准：');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(c.label, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('差异：');
    lines.push('');
    // 优先从 rawText 再解析（保留 raw 原文展示）；分类不依赖旧 parsed 形态
    const parsedForDiff =
      (c.ok && c.rawText ? tryParseJsonObject(c.rawText) : null) || c.parsed || null;
    const { compareSource, purchaseDateCompareSource, diffs, parseOk } = fieldDiff(
      c.label,
      parsedForDiff,
    );
    lines.push(`- compareSource: \`${compareSource}\``);
    lines.push(`- purchaseDateCompareSource: \`${purchaseDateCompareSource}\``);
    lines.push(
      '- diffKind: `missing` | `format_mismatch` | `semantic_match` | `value_mismatch` | `parse_error`',
    );
    if (!c.ok) {
      lines.push('- （调用失败，未做字段对比）');
    } else if (!parseOk) {
      lines.push('- parseOk: `false`（AI 输出未能解析为 JSON；下列字段均为 parse_error）');
      if (!diffs.length) {
        lines.push('- （标准未填可对比字段）');
      } else {
        for (const d of diffs) {
          lines.push(
            `- **${d.field}** \`${d.kind}\`: 标准 \`${JSON.stringify(d.expected)}\` → AI \`${JSON.stringify(d.actual)}\``,
          );
        }
      }
    } else if (!diffs.length) {
      lines.push('- （所列对比字段与标准一致或标准未填）');
    } else {
      for (const d of diffs) {
        lines.push(
          `- **${d.field}** \`${d.kind}\`: 标准 \`${JSON.stringify(d.expected)}\` → AI \`${JSON.stringify(d.actual)}\``,
        );
      }
    }
    lines.push('');
    lines.push('评价：');
    lines.push('');
    lines.push('- [ ] pass');
    lines.push('- [ ] fail');
    lines.push('- 备注：');
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

export function writeReports(summary: RunSummary): { mdPath: string; jsonPath: string } {
  const reportsDir = path.join(EVAL_ROOT, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const mdPath = path.join(reportsDir, 'latest-report.md');
  const jsonPath = path.join(reportsDir, 'latest-run.json');
  fs.writeFileSync(mdPath, renderMarkdown(summary), 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  return { mdPath, jsonPath };
}

/** CLI：从 latest-run.json 重生成 md */
function main() {
  const jsonPath = path.join(EVAL_ROOT, 'reports/latest-run.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('找不到 reports/latest-run.json，请先 npm run ai:test');
    process.exit(1);
  }
  const summary = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as RunSummary;
  const { mdPath } = writeReports(summary);
  console.log('已重生成:', mdPath);
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) main();
