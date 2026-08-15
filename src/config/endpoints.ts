/**
 * 大陆访问：默认把 API / 图片收敛到前端同源路径，
 * 由 Vercel（或 Vite dev proxy）反代到 Worker / R2。
 * 也可通过环境变量改回直连或自定义域名。
 */

const trimSlash = (s: string) => s.replace(/\/$/, '');

/** 默认 R2 公网 host（历史 photo_url 仍可能指向此域） */
export const R2_PUBLIC_HOST =
  (import.meta.env.VITE_R2_PUBLIC_HOST as string | undefined)?.trim() ||
  'pub-ab5fbb0dc5a94486aad97da609e95b55.r2.dev';

/** Worker 直连基址（反代目标 / 回退） */
export const WORKER_ORIGIN =
  trimSlash(
    (import.meta.env.VITE_WORKER_ORIGIN as string | undefined)?.trim() ||
      'https://wardrobe-api.yyyunniee.workers.dev',
  );

/**
 * 浏览器侧 API 基址。
 * 生产默认 `/api`（同源），避免直连 workers.dev。
 */
export const API_BASE = trimSlash(
  (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || '/api',
);

/**
 * 浏览器侧图片公网基址。
 * 生产默认 `/media`（同源反代 R2），避免直连 r2.dev。
 * 也可设为 `https://img.example.com`。
 */
export const IMG_PUBLIC_BASE = trimSlash(
  (import.meta.env.VITE_IMG_PUBLIC_BASE as string | undefined)?.trim() || '/media',
);
