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

export function loadConfig(): { apiBase: string; timeoutMs: number } {
  const example = path.join(EVAL_ROOT, 'config.example.json');
  let apiBase = 'https://wardrobe-api.yyyunniee.workers.dev';
  let timeoutMs = 120_000;
  if (fs.existsSync(example)) {
    try {
      const j = JSON.parse(fs.readFileSync(example, 'utf8')) as {
        apiBase?: string;
        timeoutMs?: number;
      };
      if (j.apiBase) apiBase = j.apiBase;
      if (j.timeoutMs) timeoutMs = j.timeoutMs;
    } catch {
      /* ignore */
    }
  }
  if (process.env.AI_EVAL_API_BASE) apiBase = process.env.AI_EVAL_API_BASE;
  if (process.env.AI_EVAL_TIMEOUT_MS) timeoutMs = Number(process.env.AI_EVAL_TIMEOUT_MS) || timeoutMs;
  return { apiBase: apiBase.replace(/\/$/, ''), timeoutMs };
}

/** 只读抽取 app.ts 中 AI_PROMPT，与线上一致 */
export function loadAIPromptFromApp(): { prompt: string; promptVersion: string } {
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
  return { prompt, promptVersion };
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export function listImageRecognitionCases(): ImageCase[] {
  const labelsDir = path.join(EVAL_ROOT, 'datasets/image-recognition/labels');
  const imagesDir = path.join(EVAL_ROOT, 'datasets/image-recognition/images');
  if (!fs.existsSync(labelsDir)) return [];
  const files = fs.readdirSync(labelsDir).filter((f) => f.endsWith('.json'));
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
    cases.push({ id, labelPath, label, localImagePath });
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
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

/** 仅展示差异，不算准确率 */
export function fieldDiff(
  label: LabelJson,
  parsed: Record<string, unknown> | null,
): Array<{ field: string; expected: unknown; actual: unknown }> {
  const keys = ['category', 'color', 'brand', 'season', 'name', 'fabric', 'price'];
  const diffs: Array<{ field: string; expected: unknown; actual: unknown }> = [];
  for (const k of keys) {
    if (!(k in label) || label[k] === '' || label[k] == null) continue;
    const expected = label[k];
    const actual = parsed ? parsed[k] : undefined;
    const expStr = Array.isArray(expected) ? JSON.stringify(expected) : String(expected);
    const actStr =
      actual == null || actual === ''
        ? ''
        : Array.isArray(actual)
          ? JSON.stringify(actual)
          : String(actual);
    if (expStr !== actStr) {
      diffs.push({ field: k, expected, actual: actual ?? '(缺失或未解析)' });
    }
  }
  return diffs;
}
