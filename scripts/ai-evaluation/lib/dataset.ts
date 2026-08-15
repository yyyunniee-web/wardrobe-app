import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EVAL_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(EVAL_ROOT, '../..');

export type LabelJson = Record<string, unknown> & {
  imageUrl?: string;
  category?: string;
  color?: string;
  brand?: string;
  season?: string;
};

export type ImageCase = {
  id: string;
  labelPath: string;
  label: LabelJson;
  localImagePath: string | null;
};

export function loadConfig(): {
  apiBase: string;
  timeoutMs: number;
  promptFile: string | null;
} {
  const example = path.join(EVAL_ROOT, 'config.example.json');
  let apiBase = 'https://wardrobe-api.yyyunniee.workers.dev';
  let timeoutMs = 120_000;
  let promptFile: string | null = null;
  if (fs.existsSync(example)) {
    try {
      const j = JSON.parse(fs.readFileSync(example, 'utf8')) as {
        apiBase?: string;
        timeoutMs?: number;
        promptFile?: string;
      };
      if (j.apiBase) apiBase = j.apiBase;
      if (j.timeoutMs) timeoutMs = j.timeoutMs;
      if (j.promptFile && String(j.promptFile).trim()) promptFile = String(j.promptFile).trim();
    } catch {
      /* ignore */
    }
  }
  if (process.env.AI_EVAL_API_BASE) apiBase = process.env.AI_EVAL_API_BASE;
  if (process.env.AI_EVAL_TIMEOUT_MS) timeoutMs = Number(process.env.AI_EVAL_TIMEOUT_MS) || timeoutMs;
  if (process.env.AI_EVAL_PROMPT_FILE) {
    const v = process.env.AI_EVAL_PROMPT_FILE.trim();
    promptFile = v ? v : null;
  }
  return { apiBase: apiBase.replace(/\/$/, ''), timeoutMs, promptFile };
}

/** 只读抽取 app.ts 中 AI_PROMPT，与线上一致 */
export function loadAIPromptFromApp(): { prompt: string; promptVersion: string; source: string } {
  const srcPath = path.join(REPO_ROOT, 'src/wardrobe/app.ts');
  const src = fs.readFileSync(srcPath, 'utf8');
  const m = src.match(/var AI_PROMPT = \[([\s\S]*?)\]\.join\('\\n'\);/);
  if (!m) throw new Error('无法从 src/wardrobe/app.ts 解析 AI_PROMPT');
  const parts: string[] = [];
  const re = /'((?:\\'|[^'])*)'/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(m[1]))) {
    parts.push(mm[1].replace(/\\'/g, "'").replace(/\\n/g, '\n'));
  }
  if (parts.length < 5) throw new Error('AI_PROMPT 解析异常');
  const prompt = parts.join('\n');
  const promptVersion = createHash('sha256').update(prompt).digest('hex').slice(0, 12);
  return { prompt, promptVersion, source: 'src/wardrobe/app.ts#AI_PROMPT' };
}

/** 评测实验 Prompt：优先 config.promptFile，否则回退 app.ts */
export function loadEvalPrompt(promptFile: string | null): {
  prompt: string;
  promptVersion: string;
  source: string;
} {
  if (promptFile) {
    const abs = path.isAbsolute(promptFile) ? promptFile : path.join(EVAL_ROOT, promptFile);
    if (!fs.existsSync(abs)) throw new Error(`找不到评测 Prompt 文件: ${abs}`);
    const prompt = fs.readFileSync(abs, 'utf8').trim();
    if (!prompt) throw new Error(`评测 Prompt 文件为空: ${abs}`);
    const promptVersion = createHash('sha256').update(prompt).digest('hex').slice(0, 12);
    return {
      prompt,
      promptVersion,
      source: path.relative(EVAL_ROOT, abs) || abs,
    };
  }
  return loadAIPromptFromApp();
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const SKIP_LABEL_FILES = new Set(['TEMPLATE.json', 'example.json']);

function listDatasetCases(
  datasetRel: string,
  opts: { requireImage?: boolean; skipTemplates?: boolean } = {},
): ImageCase[] {
  const requireImage = opts.requireImage ?? false;
  const skipTemplates = opts.skipTemplates ?? false;
  const labelsDir = path.join(EVAL_ROOT, datasetRel, 'labels');
  const imagesDir = path.join(EVAL_ROOT, datasetRel, 'images');
  if (!fs.existsSync(labelsDir)) return [];
  const files = fs.readdirSync(labelsDir).filter((f) => {
    if (!f.endsWith('.json')) return false;
    if (skipTemplates && SKIP_LABEL_FILES.has(f)) return false;
    return true;
  });
  const cases: ImageCase[] = [];
  for (const file of files) {
    const id = file.replace(/\.json$/i, '');
    const labelPath = path.join(labelsDir, file);
    const label = JSON.parse(fs.readFileSync(labelPath, 'utf8')) as LabelJson;
    let localImagePath: string | null = null;
    for (const ext of IMAGE_EXTS) {
      const p = path.join(imagesDir, id + ext);
      if (fs.existsSync(p)) {
        localImagePath = p;
        break;
      }
    }
    if (requireImage && !localImagePath) continue;
    cases.push({ id, labelPath, label, localImagePath });
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

export function listImageRecognitionCases(): ImageCase[] {
  return listDatasetCases('datasets/image-recognition');
}

/** 端到端衣橱条目评测集：datasets/wardrobe-entry（需图+label 配对，跳过模板） */
export function listWardrobeEntryCases(): ImageCase[] {
  return listDatasetCases('datasets/wardrobe-entry', {
    requireImage: true,
    skipTemplates: true,
  });
}

export function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    return JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type CompareSource = 'items[0]' | 'top-level';
export type PurchaseDateCompareSource = 'items[0]' | 'top-level fallback';

/** 字段对比分类（评测报告用，不算准确率） */
export type DiffKind =
  | 'missing'
  | 'format_mismatch'
  | 'semantic_match'
  | 'value_mismatch'
  | 'parse_error';

export type FieldDiffEntry = {
  field: string;
  expected: unknown;
  actual: unknown;
  kind: DiffKind;
};

export type FieldDiffResult = {
  /** category/color/price/season 等：items[0] 优先 */
  compareSource: CompareSource;
  /** purchaseDate：items[0] 有值用 items[0]，否则顶层 */
  purchaseDateCompareSource: PurchaseDateCompareSource;
  diffs: FieldDiffEntry[];
  /** 整案 JSON 是否可解析；false 时字段多为 parse_error */
  parseOk: boolean;
};

function hasFieldValue(v: unknown): boolean {
  if (v == null || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/** 订单等场景有效字段常在 items[0]；无 items 时回退顶层 */
export function resolveCompareTarget(
  parsed: Record<string, unknown> | null,
): { compareSource: CompareSource; target: Record<string, unknown> | null } {
  if (!parsed) return { compareSource: 'top-level', target: null };
  const items = parsed.items;
  if (Array.isArray(items) && items.length > 0) {
    const first = items[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return { compareSource: 'items[0]', target: first as Record<string, unknown> };
    }
  }
  return { compareSource: 'top-level', target: parsed };
}

/** purchaseDate 为订单级字段：items[0] → 顶层 */
export function resolvePurchaseDateActual(
  parsed: Record<string, unknown> | null,
  itemTarget: Record<string, unknown> | null,
  compareSource: CompareSource,
): { actual: unknown; purchaseDateCompareSource: PurchaseDateCompareSource } {
  const fromItem = itemTarget && compareSource === 'items[0]' ? itemTarget.purchaseDate : undefined;
  if (hasFieldValue(fromItem)) {
    return { actual: fromItem, purchaseDateCompareSource: 'items[0]' };
  }
  const fromTop = parsed ? parsed.purchaseDate : undefined;
  if (hasFieldValue(fromTop)) {
    return { actual: fromTop, purchaseDateCompareSource: 'top-level fallback' };
  }
  // 均无值：记录优先检查路径
  if (compareSource === 'items[0]') {
    return { actual: fromItem, purchaseDateCompareSource: 'items[0]' };
  }
  return { actual: fromTop, purchaseDateCompareSource: 'top-level fallback' };
}

function valueToCompareString(v: unknown): string {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v);
}

/** 去货币符号/千分位/空白，便于价格 format 对比 */
export function normalizePrice(v: unknown): string {
  const s = valueToCompareString(v).trim();
  if (!s) return '';
  const n = s.replace(/[¥￥,\s]/g, '');
  const num = Number(n);
  if (!Number.isNaN(num) && n !== '') {
    // 保留合理小数，避免 48.90 vs 48.9 被当成 value 差
    return String(num);
  }
  return n;
}

/** 日期：统一为 YYYY-MM-DD 或可解析片段 */
export function normalizePurchaseDate(v: unknown): string {
  const s = valueToCompareString(v).trim();
  if (!s) return '';
  const m = s.match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return s;
  return s.replace(/\s+/g, '');
}

const COLOR_ALIASES: Record<string, string> = {
  白: '白',
  白色: '白',
  黑: '黑',
  黑色: '黑',
  灰: '灰',
  灰色: '灰',
  米: '米',
  米色: '米',
  卡其: '卡其',
  卡其色: '卡其',
  棕: '棕',
  棕色: '棕',
  蓝: '蓝',
  蓝色: '蓝',
  绿: '绿',
  绿色: '绿',
  粉: '粉',
  粉色: '粉',
  红: '红',
  红色: '红',
  紫: '紫',
  紫色: '紫',
  黄: '黄',
  黄色: '黄',
  花色: '花色',
  其他: '其他',
  肤色: '肤色',
  肉色: '肤色',
  隐形肤: '肤色',
};

const CATEGORY_ALIASES: Record<string, string> = {
  上衣: '上衣',
  裤装: '裤装',
  裙装: '裙装',
  连衣裙: '连衣裙',
  外套: '外套',
  鞋: '鞋',
  包: '包',
  配饰: '配饰',
  内衣: '内衣',
  bra: '内衣',
  内裤: '内裤',
};

export function normalizeColor(v: unknown): string {
  const s = valueToCompareString(v).trim();
  if (!s) return '';
  return COLOR_ALIASES[s] || s;
}

export function normalizeCategory(v: unknown): string {
  const s = valueToCompareString(v).trim();
  if (!s) return '';
  return CATEGORY_ALIASES[s] || s;
}

function normalizeForFormat(field: string, v: unknown): string {
  if (field === 'price') return normalizePrice(v);
  if (field === 'purchaseDate') return normalizePurchaseDate(v);
  // 通用：去首尾空白、全角空格
  return valueToCompareString(v).trim().replace(/\s+/g, '');
}

function normalizeForSemantic(field: string, v: unknown): string {
  if (field === 'price') return normalizePrice(v);
  if (field === 'purchaseDate') return normalizePurchaseDate(v);
  if (field === 'color') return normalizeColor(v);
  if (field === 'category') return normalizeCategory(v);
  if (field === 'season') {
    const s = valueToCompareString(v).trim();
    if (s === 'summer') return '夏';
    if (s === 'winter') return '冬';
    if (s === 'spring') return '春';
    if (s === 'autumn' || s === 'fall') return '秋';
    return s;
  }
  return normalizeForFormat(field, v);
}

/**
 * 对单个字段分类：
 * missing → format_mismatch → semantic_match → value_mismatch
 * parse_error 由整案无 parsed 时统一打标
 */
export function classifyFieldDiff(
  field: string,
  expected: unknown,
  actual: unknown,
  opts?: { parseOk?: boolean },
): DiffKind {
  if (opts && opts.parseOk === false) return 'parse_error';
  if (!hasFieldValue(actual)) return 'missing';
  const expRaw = valueToCompareString(expected);
  const actRaw = valueToCompareString(actual);
  if (expRaw === actRaw) {
    // 调用方通常不会把 exact match 放进 diffs；若放入则视为 semantic 已对齐
    return 'semantic_match';
  }
  const expFmt = normalizeForFormat(field, expected);
  const actFmt = normalizeForFormat(field, actual);
  if (expFmt && actFmt && expFmt === actFmt) return 'format_mismatch';
  const expSem = normalizeForSemantic(field, expected);
  const actSem = normalizeForSemantic(field, actual);
  if (expSem && actSem && expSem === actSem) return 'semantic_match';
  return 'value_mismatch';
}

function pushComparedField(
  diffs: FieldDiffEntry[],
  field: string,
  expected: unknown,
  actual: unknown,
  parseOk: boolean,
): void {
  if (!hasFieldValue(expected)) return;
  if (Array.isArray(expected) && expected.length === 0) return;

  if (!parseOk) {
    diffs.push({
      field,
      expected,
      actual: '(缺失或未解析)',
      kind: 'parse_error',
    });
    return;
  }

  const actDisplay = hasFieldValue(actual) ? actual : '(缺失或未解析)';
  const expRaw = valueToCompareString(expected);
  const actRaw = hasFieldValue(actual) ? valueToCompareString(actual) : '';
  if (expRaw === actRaw) return; // exact match：不进 diffs

  const kind = classifyFieldDiff(field, expected, actual, { parseOk: true });
  diffs.push({ field, expected, actual: actDisplay, kind });
}

/** 仅展示差异（含分类），不算准确率 */
export function fieldDiff(
  label: LabelJson,
  parsed: Record<string, unknown> | null,
): FieldDiffResult {
  const parseOk = parsed != null;
  const { compareSource, target } = resolveCompareTarget(parsed);
  const { actual: purchaseDateActual, purchaseDateCompareSource } = resolvePurchaseDateActual(
    parsed,
    target,
    compareSource,
  );

  const itemKeys = ['name', 'category', 'color', 'brand', 'season', 'scenes', 'fabric', 'price'];
  const diffs: FieldDiffEntry[] = [];

  for (const k of itemKeys) {
    if (!(k in label)) continue;
    const actual = target ? target[k] : undefined;
    pushComparedField(diffs, k, label[k], actual, parseOk);
  }

  if ('purchaseDate' in label) {
    pushComparedField(diffs, 'purchaseDate', label.purchaseDate, purchaseDateActual, parseOk);
  }

  return { compareSource, purchaseDateCompareSource, diffs, parseOk };
}
