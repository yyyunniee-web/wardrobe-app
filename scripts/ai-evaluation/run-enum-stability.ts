/**
 * 实验 A：枚举约束稳定性
 * 用法：node --experimental-strip-types scripts/ai-evaluation/run-enum-stability.ts
 * 不改生产 Prompt；结果写入 reports/raw/<suiteId>-enum-stability/
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  EVAL_ROOT,
  listImageRecognitionCases,
  loadAIPromptFromApp,
  loadConfig,
  loadEvalPrompt,
  resolveCompareTarget,
  tryParseJsonObject,
} from './lib/dataset.ts';
import { callWorkerVision, uploadEvalImage } from './lib/vision-client.ts';

const IDS = ['bra_001', 'shoes-001', 'shorts001', 'tshirt_001'];
const REPEATS = 5;
const ENUM_PROMPT = 'prompts/image-recognition.enum-exp.txt';

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

function empty(v: unknown): string {
  return v == null || v === '' ? '(空)' : String(v);
}

function extract(rawText: string) {
  const parsed = tryParseJsonObject(rawText);
  const jsonOk = !!parsed;
  if (!parsed) {
    return { category: '(解析失败)', color: '(解析失败)', price: '(解析失败)', jsonOk: false };
  }
  const { target } = resolveCompareTarget(parsed);
  const item = target || {};
  return {
    category: empty(item.category),
    color: empty(item.color),
    price: empty(item.price),
    jsonOk: true,
  };
}

async function runArm(
  arm: 'prod' | 'enum',
  prompt: string,
  promptVersion: string,
  promptSource: string,
  cases: ReturnType<typeof listImageRecognitionCases>,
  apiBase: string,
  timeoutMs: number,
  suiteId: string,
) {
  const rows: Array<Record<string, unknown>> = [];
  for (const c of cases) {
    if (!c.localImagePath) throw new Error(`no image for ${c.id}`);
    console.log(`[${arm}] upload ${c.id}`);
    const up = await uploadEvalImage(apiBase, c.localImagePath, timeoutMs);
    if (!up.ok) throw new Error(`upload ${c.id}: ${up.error}`);
    for (let i = 1; i <= REPEATS; i++) {
      process.stdout.write(`[${arm}] ${c.id} r${i}/${REPEATS} … `);
      const vision = await callWorkerVision(apiBase, up.url, prompt, timeoutMs);
      if (!vision.ok) {
        console.log('FAIL', vision.error);
        rows.push({
          arm,
          id: c.id,
          repeat: i,
          runId: `${suiteId}-${arm}-${c.id}-r${i}`,
          ok: false,
          error: vision.error,
          jsonOk: false,
          category: '(调用失败)',
          color: '(调用失败)',
          price: '(调用失败)',
          promptVersion,
          promptSource,
        });
        continue;
      }
      const fields = extract(vision.text);
      console.log(
        `OK cat=${fields.category} color=${fields.color} price=${fields.price} json=${fields.jsonOk}`,
      );
      rows.push({
        arm,
        id: c.id,
        repeat: i,
        runId: `${suiteId}-${arm}-${c.id}-r${i}`,
        ok: true,
        promptVersion,
        promptSource,
        imageUrl: up.url,
        ...fields,
        rawText: vision.text,
      });
    }
  }
  return rows;
}

async function main() {
  const { apiBase, timeoutMs } = loadConfig();
  const prod = loadAIPromptFromApp();
  const enumP = loadEvalPrompt(ENUM_PROMPT);
  const cases = listImageRecognitionCases().filter((c) => IDS.includes(c.id));
  if (cases.length !== IDS.length) {
    throw new Error(`expected ${IDS.join(',')}, got ${cases.map((c) => c.id).join(',')}`);
  }

  const suiteId = runIdNow();
  console.log(`suiteId=${suiteId}`);
  console.log(`prod=${prod.promptVersion} enum=${enumP.promptVersion}`);

  const prodRows = await runArm(
    'prod',
    prod.prompt,
    prod.promptVersion,
    prod.source,
    cases,
    apiBase,
    timeoutMs,
    suiteId,
  );
  const enumRows = await runArm(
    'enum',
    enumP.prompt,
    enumP.promptVersion,
    enumP.source,
    cases,
    apiBase,
    timeoutMs,
    suiteId,
  );

  const outDir = path.join(EVAL_ROOT, 'reports/raw', `${suiteId}-enum-stability`);
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    suiteId,
    repeats: REPEATS,
    ids: IDS,
    prodPromptVersion: prod.promptVersion,
    enumPromptVersion: enumP.promptVersion,
    enumPromptFile: ENUM_PROMPT,
    results: [...prodRows, ...enumRows],
  };
  fs.writeFileSync(path.join(outDir, 'enum-stability.json'), JSON.stringify(payload, null, 2));
  console.log('saved', path.join(outDir, 'enum-stability.json'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
