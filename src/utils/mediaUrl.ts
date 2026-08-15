/**
 * 图片 URL：展示走同源/自定义域；存库与 Worker 拉取仍用可直达的绝对地址。
 */
import { IMG_PUBLIC_BASE, R2_PUBLIC_HOST } from '@/config/endpoints';

function trimUrl(url: unknown): string {
  if (url == null || url === '') return '';
  return String(url).trim();
}

function isR2Host(hostname: string): boolean {
  const h = String(hostname || '').toLowerCase();
  return h === R2_PUBLIC_HOST.toLowerCase() || h.endsWith('.r2.dev');
}

/** 仅规范化空白；不改写域名（写入 DB / 队列保持 canonical） */
export function normalizePublicUrl(url: unknown): string {
  return trimUrl(url);
}

/**
 * 浏览器 <img> / OCR 用：把历史 r2.dev 改写到 IMG_PUBLIC_BASE。
 */
export function toDisplayPhotoUrl(url: unknown): string {
  const raw = trimUrl(url);
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  try {
    const base =
      typeof location !== 'undefined' && location.href
        ? location.href
        : 'https://localhost/';
    const parsed = new URL(raw, base);

    if (parsed.pathname.startsWith('/media/')) {
      // 已是同源 media 路径
      return `${parsed.pathname}${parsed.search}`;
    }

    if (isR2Host(parsed.hostname)) {
      const path = parsed.pathname || '/';
      if (IMG_PUBLIC_BASE.startsWith('http')) {
        return `${IMG_PUBLIC_BASE}${path}${parsed.search}`;
      }
      return `${IMG_PUBLIC_BASE}${path}${parsed.search}`;
    }
  } catch {
    /* ignore */
  }
  return raw;
}

/**
 * Worker /ai/vision 拉取用：同源 /media 还原为 R2 绝对地址（Worker 侧可稳定访问 R2）。
 */
export function toWorkerFetchUrl(url: unknown): string {
  const raw = trimUrl(url);
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  try {
    const base =
      typeof location !== 'undefined' && location.href
        ? location.href
        : 'https://localhost/';
    const parsed = new URL(raw, base);
    const path = parsed.pathname || '/';

    if (path.startsWith('/media/')) {
      const objectPath = path.slice('/media'.length) || '/';
      return `https://${R2_PUBLIC_HOST}${objectPath}${parsed.search}`;
    }

    if (IMG_PUBLIC_BASE.startsWith('http')) {
      try {
        const imgBase = new URL(IMG_PUBLIC_BASE);
        if (parsed.hostname === imgBase.hostname) {
          return `https://${R2_PUBLIC_HOST}${path}${parsed.search}`;
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return raw;
}
