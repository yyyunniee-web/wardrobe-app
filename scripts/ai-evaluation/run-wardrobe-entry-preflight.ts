/**
 * wardrobe-entry dataset preflight（不跑 AI evaluation）
 * node --experimental-strip-types scripts/ai-evaluation/run-wardrobe-entry-preflight.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { EVAL_ROOT } from './lib/dataset.ts';

const ROOT = path.join(EVAL_ROOT, 'datasets/wardrobe-entry');
const IMG_DIR = path.join(ROOT, 'images');
const LBL_DIR = path.join(ROOT, 'labels');
const REPORT = path.join(EVAL_ROOT, 'reports/wardrobe-entry-preflight-report.md');

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const REQUIRED = ['name', 'category', 'color', 'price', 'purchaseDate', 'season', 'notes'] as const;

/** 产品下拉框真实 category enum */
const CATEGORIES = new Set([
  '上衣',
  '外套',
  '裤装',
  '裙装',
  '连衣裙',
  '鞋',
  '包',
  '配饰',
  '内衣',
  '其他',
]);

const SEASONS = new Set(['春', '夏', '秋', '冬', '全年']);
const SKIP_LABELS = new Set(['TEMPLATE.json', 'example.json']);

type Issue = { id: string; label: string; image: string | null; issues: string[] };

function stem(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return file.slice(0, -ext.length);
}

function main() {
  const images = fs
    .readdirSync(IMG_DIR)
    .filter((f) => !f.startsWith('.') && IMAGE_EXTS.includes(path.extname(f).toLowerCase()));
  const allLabelFiles = fs.readdirSync(LBL_DIR).filter((f) => f.endsWith('.json'));
  const skipped = allLabelFiles.filter((f) => SKIP_LABELS.has(f));
  const labels = allLabelFiles.filter((f) => !SKIP_LABELS.has(f));

  const imgIds = new Map(images.map((f) => [stem(f), f]));
  const lblIds = new Map(labels.map((f) => [f.replace(/\.json$/i, ''), f]));

  const pairingIssues: Array<{ type: string; id: string; file: string }> = [];
  for (const [id, f] of imgIds) {
    if (!lblIds.has(id)) pairingIssues.push({ type: 'orphan_image', id, file: f });
  }
  for (const [id, f] of lblIds) {
    if (!imgIds.has(id)) pairingIssues.push({ type: 'orphan_label', id, file: f });
  }

  const caseIds = [...imgIds.keys()].filter((id) => lblIds.has(id)).sort();
  const failures: Issue[] = [];
  const passes: Array<{ id: string; obj: Record<string, unknown> }> = [];
  const warnings: string[] = [];

  for (const id of caseIds) {
    const issues: string[] = [];
    const labelFile = lblIds.get(id)!;
    const labelPath = path.join(LBL_DIR, labelFile);
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(fs.readFileSync(labelPath, 'utf8')) as Record<string, unknown>;
    } catch (e) {
      failures.push({
        id,
        label: labelFile,
        image: imgIds.get(id) || null,
        issues: [`JSON parse 失败: ${e instanceof Error ? e.message : String(e)}`],
      });
      continue;
    }

    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      issues.push('根节点必须是 JSON object');
    } else if (Array.isArray(obj.items)) {
      issues.push(
        '检测到 items[] 多商品结构：端到端要求「一张图对应一个 wardrobe entry」。请拆成多个单品样本（各需独立图片+label），或仅保留主购商品为扁平 TEMPLATE 字段，并在 notes 说明其余行。',
      );
    } else {
      for (const k of REQUIRED) {
        if (!(k in obj)) issues.push(`缺少必填键: ${k}`);
      }
      for (const k of Object.keys(obj)) {
        if (!REQUIRED.includes(k as (typeof REQUIRED)[number])) {
          issues.push(`多余字段(非 TEMPLATE): ${k}`);
        }
      }

      const cat = obj.category;
      if (cat !== '' && cat != null && !CATEGORIES.has(String(cat))) {
        issues.push(
          `category 不在产品下拉枚举: ${JSON.stringify(cat)}；允许: ${[...CATEGORIES].join(',')}`,
        );
      }
      const season = obj.season;
      if (season !== '' && season != null && !SEASONS.has(String(season))) {
        issues.push(`season 不在约定值: ${JSON.stringify(season)}；允许: 春/夏/秋/冬/全年`);
      }
      const pd = obj.purchaseDate;
      if (pd !== '' && pd != null) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(pd))) {
          issues.push(`purchaseDate 非 YYYY-MM-DD: ${JSON.stringify(pd)}`);
        } else {
          const [y, m, d] = String(pd).split('-').map(Number);
          const dt = new Date(Date.UTC(y, m - 1, d));
          if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
            issues.push(`purchaseDate 日期无效: ${pd}`);
          }
        }
      }
      const price = obj.price;
      if (price !== '' && price != null) {
        if (typeof price === 'number') {
          issues.push(`price 必须为数字字符串，当前为 number: ${price}（请改为 "${price}"）`);
        } else if (!/^\d+(\.\d+)?$/.test(String(price).trim())) {
          issues.push(`price 必须为数字字符串（如 "60.58"），当前: ${JSON.stringify(price)}`);
        }
      }
      if (!String(obj.name ?? '').trim()) issues.push('name 为空');
      if (!String(obj.category ?? '').trim()) issues.push('category 为空');
    }

    if (issues.length) {
      failures.push({ id, label: labelFile, image: imgIds.get(id) || null, issues });
    } else {
      passes.push({ id, obj });
    }
  }

  const ready = pairingIssues.length === 0 && failures.length === 0;
  const lines: string[] = [];
  lines.push('# wardrobe-entry dataset preflight report');
  lines.push('');
  lines.push(`- **生成时间:** ${new Date().toISOString()}`);
  lines.push(`- **category 枚举来源:** 产品下拉框（含「内衣」「其他」）`);
  lines.push(
    `- **category 允许值:** ${[...CATEGORIES].join(' / ')}`,
  );
  lines.push(`- **season 约定:** 春 / 夏 / 秋 / 冬 / 全年`);
  lines.push(`- **price:** 必须为数字字符串（如 \`"60.58"\`），禁止 number`);
  lines.push(`- **未运行** AI evaluation`);
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push('| 指标 | 数量 |');
  lines.push('|------|------|');
  lines.push(`| 总图片数量 | **${images.length}** |`);
  lines.push(`| 总 label 数量（不含跳过） | **${labels.length}** |`);
  lines.push(`| 跳过 TEMPLATE/example | **${skipped.length}**（${skipped.join(', ') || '无'}） |`);
  lines.push(`| 配对成功 | **${caseIds.length}** |`);
  lines.push(`| 孤立图片 | **${pairingIssues.filter((p) => p.type === 'orphan_image').length}** |`);
  lines.push(`| 孤立 JSON | **${pairingIssues.filter((p) => p.type === 'orphan_label').length}** |`);
  lines.push(`| **通过** | **${passes.length}** |`);
  lines.push(`| **失败** | **${failures.length}** |`);
  lines.push(`| **是否可以开始正式 evaluation** | **${ready ? '是' : '否'}** |`);
  lines.push('');

  lines.push('## 1. 配对');
  lines.push('');
  if (!pairingIssues.length) {
    lines.push('全部图片与 label 一一对应，无孤立文件。');
  } else {
    for (const p of pairingIssues) {
      lines.push(`- \`${p.type}\`: \`${p.file}\``);
    }
  }
  lines.push('');
  lines.push('| 图片 | label |');
  lines.push('|------|--------|');
  for (const id of caseIds) {
    lines.push(`| \`${imgIds.get(id)}\` | \`${lblIds.get(id)}\` |`);
  }
  lines.push('');

  lines.push('## 2–3. Label 校验');
  lines.push('');
  if (failures.length) {
    lines.push('### 失败');
    lines.push('');
    for (const f of failures) {
      lines.push(`#### \`${f.label}\``);
      lines.push('');
      for (const issue of f.issues) lines.push(`- ${issue}`);
      lines.push('');
    }
  } else {
    lines.push('全部配对样本通过结构与字段校验。');
    lines.push('');
  }

  lines.push('### 通过列表');
  lines.push('');
  lines.push('| id | category | season | price | purchaseDate |');
  lines.push('|----|----------|--------|-------|--------------|');
  for (const p of passes) {
    lines.push(
      `| ${p.id} | ${p.obj.category} | ${p.obj.season} | ${JSON.stringify(p.obj.price)} | ${p.obj.purchaseDate === '' ? '(空)' : p.obj.purchaseDate} |`,
    );
  }
  lines.push('');

  lines.push('## 4. TEMPLATE / example 与 runner');
  lines.push('');
  lines.push(
    `- 跳过名单: \`TEMPLATE.json\`, \`example.json\`（preflight 与未来 wardrobe-entry runner 均应忽略）`,
  );
  lines.push(
    `- 现有 \`listImageRecognitionCases()\` 只读 \`image-recognition\`，不会误读本目录`,
  );
  lines.push('');

  lines.push('## 5. 结论');
  lines.push('');
  if (ready) {
    lines.push('**Preflight 通过，可以开始正式 wardrobe-entry evaluation。**');
  } else {
    lines.push('**Preflight 未通过，请先修复失败项后再跑 evaluation。**');
  }
  lines.push('');
  if (warnings.length) {
    lines.push('### 警告');
    lines.push('');
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log(`images=${images.length} labels=${labels.length} pass=${passes.length} fail=${failures.length} ready=${ready}`);
  console.log('report:', REPORT);
  if (!ready) process.exitCode = 1;
}

main();
