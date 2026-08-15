/**
 * 访问入口配置。
 *
 * v0.2.3-hotfix：默认恢复直连 Worker / R2（与 v0.2.2 数据面一致）。
 * 国内 CDN / 自定义域就绪后，可通过 VITE_* 再切回同源 /api、/media。
 */

const trimSlash = (s: string) => s.replace(/\/$/, '');

/** 默认 R2 公网 host（历史 photo_url 仍可能指向此域） */
export const R2_PUBLIC_HOST =
  (import.meta.env.VITE_R2_PUBLIC_HOST as string | undefined)?.trim() ||
  'pub-ab5fbb0dc5a94486aad97da609e95b55.r2.dev';

/** Worker 直连基址 */
export const WORKER_ORIGIN =
  trimSlash(
    (import.meta.env.VITE_WORKER_ORIGIN as string | undefined)?.trim() ||
      'https://wardrobe-api.yyyunniee.workers.dev',
  );

/**
 * 浏览器侧 API 基址。
 * hotfix 默认：直连 Worker（不再走 Vercel /api）。
 */
export const API_BASE = trimSlash(
  (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || WORKER_ORIGIN,
);

/**
 * 浏览器侧图片公网基址。
 * hotfix 默认：空 = 不改写，直接使用 R2 URL。
 * 可选：`/media` 或 `https://img.example.com`（需配合反代/CDN）。
 */
export const IMG_PUBLIC_BASE = trimSlash(
  (import.meta.env.VITE_IMG_PUBLIC_BASE as string | undefined)?.trim() || '',
);
