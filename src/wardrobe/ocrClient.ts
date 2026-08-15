/**
 * 浏览器端 OCR → purchaseDate（Beta2）
 * 使用 tesseract.js；失败/超时返回 ok:false，不得阻塞 Vision 主流程。
 */
import { extractPurchaseDateFromOcr, type OcrDateExtractResult } from '@/wardrobe/aiBeta22';

let workerPromise: Promise<import('tesseract.js').Worker> | null = null;

const DEFAULT_OCR_TIMEOUT_MS = 12000;

async function getWorker(): Promise<import('tesseract.js').Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('chi_sim+eng');
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

export type OcrPurchaseDateResult = OcrDateExtractResult & {
  rawText: string;
  ok: boolean;
  timedOut?: boolean;
  error?: string;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * 对图片 Blob / URL 做 OCR 并抽取购买日期。
 * 任意失败 → ok:false（不抛出），调用方应保留 Vision 日期。
 */
export async function ocrPurchaseDateFromImage(
  source: Blob | string,
  opts?: { timeoutMs?: number },
): Promise<OcrPurchaseDateResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_OCR_TIMEOUT_MS;
  try {
    const extracted = await withTimeout(
      (async () => {
        const worker = await getWorker();
        const { data } = await worker.recognize(source);
        const rawText = String(data?.text || '');
        return { rawText, ...extractPurchaseDateFromOcr(rawText) };
      })(),
      timeoutMs,
      'OCR',
    );
    return { ...extracted, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = /timeout/i.test(msg);
    return {
      purchaseDate: null,
      matchedSnippet: null,
      strategy: 'none',
      rawText: '',
      ok: false,
      timedOut,
      error: msg,
    };
  }
}
