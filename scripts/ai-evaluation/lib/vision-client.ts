/**
 * 复用线上契约：POST {apiBase}/ai/vision
 * body: { imageUrl, prompt } → { ok, text?, error? }
 * 不直连智谱、不绕过 Worker。
 */

export type VisionResult = { ok: true; text: string } | { ok: false; error: string };

export async function callWorkerVision(
  apiBase: string,
  imageUrl: string,
  prompt: string,
  timeoutMs: number,
): Promise<VisionResult> {
  const endpoint = `${apiBase.replace(/\/$/, '')}/ai/vision`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, prompt }),
      signal: ctrl.signal,
    });
    let data: { ok?: boolean; text?: string; error?: string } | null = null;
    try {
      data = (await res.json()) as { ok?: boolean; text?: string; error?: string };
    } catch {
      data = null;
    }
    if (!res.ok) {
      return { ok: false, error: (data && data.error) || `AI 代理失败 HTTP ${res.status}` };
    }
    if (!data || data.ok === false) {
      return { ok: false, error: (data && data.error) || 'AI 代理返回失败' };
    }
    const text = data.text != null ? String(data.text).trim() : '';
    if (!text) return { ok: false, error: '返回内容为空' };
    return { ok: true, text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** 评测集本地图 → Worker /upload-image → 公网 URL（非用户数据抓取） */
export async function uploadEvalImage(
  apiBase: string,
  filePath: string,
  timeoutMs: number,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const endpoint = `${apiBase.replace(/\/$/, '')}/upload-image`;
  const buf = await import('node:fs/promises').then((fs) => fs.readFile(filePath));
  const name = filePath.split(/[/\\]/).pop() || 'eval.jpg';
  const fd = new FormData();
  fd.append('image', new Blob([buf]), name);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, { method: 'POST', body: fd, signal: ctrl.signal });
    const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!res.ok) {
      return { ok: false, error: (data && data.error) || `upload HTTP ${res.status}` };
    }
    const url = data && data.url ? String(data.url).trim() : '';
    if (!url) return { ok: false, error: 'upload 未返回 url' };
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
