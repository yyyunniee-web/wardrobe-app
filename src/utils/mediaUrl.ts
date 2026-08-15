/**
 * 图片 URL：存库保持 canonical（通常为 R2 绝对地址）；展示可按需改写。
 * v0.2.3-hotfix：默认不改写，浏览器直连 R2。
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

function r2AbsoluteFromMediaPath(pathname: string, search: string): string {
  const objectPath = pathname.slice('/media'.length) || '/';
  return `https://${R2_PUBLIC_HOST}${objectPath}${search}`;
}

/** 仅规范化空白；不改写域名（写入 DB / 队列保持 canonical） */
export function normalizePublicUrl(url: unknown): string {
  return trimUrl(url);
}

/**
 * 浏览器 <img> / OCR 用。
 * - IMG_PUBLIC_BASE 为空：直连原 URL；若误为 /media/* 则还原为 R2
 * - IMG_PUBLIC_BASE 有值：把 r2.dev 改写到该基址（同源反代或自定义图床域）
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
    const path = parsed.pathname || '/';

    if (path.startsWith('/media/')) {
      if (!IMG_PUBLIC_BASE) {
        return r2AbsoluteFromMediaPath(path, parsed.search);
      }
      return `${path}${parsed.search}`;
    }

    if (!IMG_PUBLIC_BASE) {
      return raw;
    }

    if (isR2Host(parsed.hostname)) {
      return `${IMG_PUBLIC_BASE}${path}${parsed.search}`;
    }
  } catch {
    /* ignore */
  }
  return raw;
}

/**
 * Worker /ai/vision 拉取用：相对 /media 或自定义图床域还原为 R2 绝对地址。
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
      return r2AbsoluteFromMediaPath(path, parsed.search);
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
