/**
 * AI Evaluation MVP：image-recognition
 * 读取 datasets → Worker /ai/vision → 保存 raw → latest-report.md
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  EVAL_ROOT,
  fieldDiff,
  listImageRecognitionCases,
  loadAIPromptFromApp,
  loadConfig,
  tryParseJsonObject,
} from './lib/dataset.ts';
import { callWorkerVision, uploadEvalImage } from './lib/vision-client.ts';
import { writeReports } from './generate-report.ts';

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

async function resolveImageUrl(
  apiBase: string,
  timeoutMs: number,
  c: ReturnType<typeof listImageRecognitionCases>[0],
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // 优先本地图 → /upload-image（与线上一致）；label.imageUrl 仅作可选覆盖
  if (c.localImagePath) {
    console.log(`[${c.id}] 上传评测图 → /upload-image …`);
    return uploadEvalImage(apiBase, c.localImagePath, timeoutMs);
  }
  const fromLabel = c.label.imageUrl && String(c.label.imageUrl).trim();
  if (fromLabel) return { ok: true, url: fromLabel };
  return {
    ok: false,
    error: '缺少本地 images/<id>.* 与 label.imageUrl，请放入测试图或填写可拉取的 imageUrl',
  };
}

async function main() {
  const { apiBase, timeoutMs } = loadConfig();
  const { prompt, promptVersion } = loadAIPromptFromApp();
  const cases = listImageRecognitionCases();
  if (!cases.length) {
    console.error('datasets/image-recognition/labels 下没有 .json 用例');
    process.exit(1);
  }

  const runId = runIdNow();
  const startedAt = new Date().toISOString();
  const rawDir = path.join(EVAL_ROOT, 'reports/raw', runId);
  fs.mkdirSync(rawDir, { recursive: true });

  console.log(`runId=${runId}`);
  console.log(`apiBase=${apiBase}`);
  console.log(`promptVersion=${promptVersion}`);
  console.log(`cases=${cases.length}`);

  const results: Array<{
    id: string;
    imageUrl: string;
    localImage: string | null;
    label: (typeof cases)[0]['label'];
    promptVersion: string;
    ok: boolean;
    error?: string;
    rawText?: string;
    parsed?: Record<string, unknown> | null;
  }> = [];

  for (const c of cases) {
    const resolved = await resolveImageUrl(apiBase, timeoutMs, c);
    if (!resolved.ok) {
      console.warn(`[${c.id}] SKIP/FAIL: ${resolved.error}`);
      results.push({
        id: c.id,
        imageUrl: '',
        localImage: c.localImagePath,
        label: c.label,
        promptVersion,
        ok: false,
        error: resolved.error,
        parsed: null,
      });
      fs.writeFileSync(
        path.join(rawDir, `${c.id}.meta.json`),
        JSON.stringify({ id: c.id, ok: false, error: resolved.error }, null, 2),
      );
      continue;
    }

    console.log(`[${c.id}] vision …`);
    const vision = await callWorkerVision(apiBase, resolved.url, prompt, timeoutMs);
    const parsed = vision.ok ? tryParseJsonObject(vision.text) : null;
    const entry = {
      id: c.id,
      imageUrl: resolved.url,
      localImage: c.localImagePath,
      label: c.label,
      promptVersion,
      ok: vision.ok,
      error: vision.ok ? undefined : vision.error,
      rawText: vision.ok ? vision.text : undefined,
      parsed,
    };
    results.push(entry);

    fs.writeFileSync(
      path.join(rawDir, `${c.id}.txt`),
      vision.ok ? vision.text : `ERROR: ${vision.error}`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(rawDir, `${c.id}.meta.json`),
      JSON.stringify(
        {
          id: c.id,
          imageUrl: resolved.url,
          ok: vision.ok,
          error: entry.error,
          promptVersion,
          diffs: fieldDiff(c.label, parsed),
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`[${c.id}] ${vision.ok ? 'OK' : 'FAIL'}`);
  }

  const finishedAt = new Date().toISOString();
  const summary = {
    runId,
    startedAt,
    finishedAt,
    apiBase,
    scene: 'image-recognition',
    promptVersion,
    cases: results,
  };
  const { mdPath, jsonPath } = writeReports(summary);
  fs.writeFileSync(path.join(rawDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('raw:', rawDir);
  console.log('report:', mdPath);
  console.log('json:', jsonPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
