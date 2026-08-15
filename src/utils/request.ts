/**
 * Wardrobe API 请求层
 * - 统一 fetch 封装
 * - 离线同步队列（仅队列可写 localStorage）
 * - 通用资源 CRUD：后续拓展只需注册 ResourceType
 */

import { API_BASE } from '@/config/endpoints';

export { API_BASE };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** 业务资源类型 */
export type ResourceType =
  | 'clothes'
  | 'user_profile'
  | 'checkins'
  | 'logs'
  | 'custom_scenes'
  | 'outfit'
  | 'filter_setting'
  | (string & {});

/** 业务域：队列分流 / 埋点 */
export type ApiDomain = ResourceType | 'upload' | 'generic';

/**
 * collection: 逐项 CRUD（衣物）
 * singleton: 单对象（user_profile）
 * document: 整份 JSON 文档 GET/PUT /resource/:type
 */
export type ResourceMode = 'collection' | 'singleton' | 'document';

export interface ResourceEndpointConfig {
  type: ResourceType;
  listPath: string;
  itemPath: string;
  domain: ApiDomain;
  mode: ResourceMode;
  /** 是否在 initDataStore 时自动拉取 */
  bootstrap?: boolean;
  /** document 模式空库时的默认值 */
  defaultData?: unknown;
}

/** 通用资源白名单（与 Worker 一致） */
export const DOCUMENT_RESOURCE_TYPES = [
  'checkins',
  'logs',
  'custom_scenes',
  'outfit',
  'filter_setting',
] as const;

export type DocumentResourceType = (typeof DOCUMENT_RESOURCE_TYPES)[number];

function documentEndpoint(type: DocumentResourceType, defaultData: unknown): ResourceEndpointConfig {
  return {
    type,
    listPath: `/resource/${type}`,
    itemPath: `/resource/${type}`,
    domain: type,
    mode: 'document',
    bootstrap: true,
    defaultData,
  };
}

export const RESOURCE_ENDPOINTS: Record<string, ResourceEndpointConfig> = {
  clothes: {
    type: 'clothes',
    listPath: '/items',
    itemPath: '/item',
    domain: 'clothes',
    mode: 'collection',
    bootstrap: true,
  },
  user_profile: {
    type: 'user_profile',
    listPath: '/user_profile',
    itemPath: '/user_profile',
    domain: 'user_profile',
    mode: 'singleton',
    bootstrap: true,
  },
  checkins: documentEndpoint('checkins', []),
  logs: documentEndpoint('logs', []),
  custom_scenes: documentEndpoint('custom_scenes', []),
  outfit: documentEndpoint('outfit', []),
  filter_setting: documentEndpoint('filter_setting', {
    buyStart: '2000-01-01',
    buyEnd: new Date().toISOString().slice(0, 10),
    includeRetired: false,
    seasons: [],
    scenes: [],
    categories: [],
  }),
};

export function getResourceEndpoint(type: ResourceType): ResourceEndpointConfig {
  const conf = RESOURCE_ENDPOINTS[type];
  if (!conf) {
    throw new Error(`[request] 未知资源类型: ${type}，请先在 RESOURCE_ENDPOINTS 注册`);
  }
  return conf;
}

export function registerResourceEndpoint(config: ResourceEndpointConfig): void {
  RESOURCE_ENDPOINTS[config.type] = config;
}

export interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null>;
  enqueueOnFail?: boolean;
  domain?: ApiDomain;
  signal?: AbortSignal;
}

export interface ApiSuccess<T = unknown> {
  ok: true;
  data: T;
  status: number;
  queued?: false;
}

export interface ApiFailure {
  ok: false;
  error: string;
  status: number;
  queued?: boolean;
  cause?: unknown;
}

export type ApiResult<T = unknown> = ApiSuccess<T> | ApiFailure;

export interface QueuedRequest {
  id: string;
  path: string;
  method: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  domain: ApiDomain;
  createdAt: number;
  retries: number;
}

/** 唯一允许写入 localStorage 的键：离线同步任务队列 */
const SYNC_QUEUE_KEY = 'wardrobe.syncQueue.v1';

const syncQueue: QueuedRequest[] = loadQueueFromStorage();
let syncRunning = false;
let onlineBound = false;

function createId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadQueueFromStorage(): QueuedRequest[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedRequest[]) : [];
  } catch {
    return [];
  }
}

function persistQueue(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(syncQueue));
  } catch (err) {
    console.warn('[request] 离线队列持久化失败', err);
  }
}

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function buildUrl(path: string, query?: ApiRequestOptions['query']): string {
  const base = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!query) return base;

  const url = new URL(base);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
    return false;
  }
  return false;
}

function shouldEnqueue(method: HttpMethod, body: unknown, explicit?: boolean): boolean {
  if (explicit === false) return false;
  if (method === 'GET') return false;
  if (isFormData(body)) return false;
  if (explicit === true) return true;
  return true;
}

function enqueueRequest(entry: Omit<QueuedRequest, 'id' | 'createdAt' | 'retries'>): QueuedRequest {
  const item: QueuedRequest = {
    ...entry,
    id: createId(),
    createdAt: Date.now(),
    retries: 0,
  };
  syncQueue.push(item);
  persistQueue();
  return item;
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.error === 'string' && obj.error) return obj.error;
    if (typeof obj.message === 'string' && obj.message) return obj.message;
    if (typeof obj.msg === 'string' && obj.msg) return obj.msg;
  }
  if (typeof data === 'string' && data.trim()) return data;
  return `请求失败 HTTP ${status}`;
}

/**
 * 通用请求：统一异常捕获；网络失败且可序列化时入离线队列
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const method: HttpMethod = options.method ?? 'GET';
  const url = buildUrl(path, options.query);
  const headers: Record<string, string> = { ...(options.headers ?? {}) };

  let body: BodyInit | undefined;
  if (options.body !== undefined && options.body !== null) {
    if (isFormData(options.body)) {
      body = options.body;
      delete headers['Content-Type'];
    } else {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      body = JSON.stringify(options.body);
    }
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : body,
      signal: options.signal,
    });

    const data = await parseResponseBody(res);

    if (!res.ok) {
      return {
        ok: false,
        error: extractErrorMessage(data, res.status),
        status: res.status,
        cause: data,
      };
    }

    return {
      ok: true,
      data: data as T,
      status: res.status,
    };
  } catch (err) {
    const networkFail = isNetworkError(err);
    const canQueue = networkFail && shouldEnqueue(method, options.body, options.enqueueOnFail);

    if (canQueue) {
      enqueueRequest({
        path,
        method,
        body: isFormData(options.body) ? undefined : options.body,
        headers: options.headers,
        domain: options.domain ?? 'generic',
      });

      return {
        ok: false,
        error: '网络不可用，操作已加入离线同步队列',
        status: 0,
        queued: true,
        cause: err,
      };
    }

    return {
      ok: false,
      error: err instanceof Error ? err.message : '未知网络错误',
      status: 0,
      cause: err,
    };
  }
}

export const http = {
  get: <T = unknown>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),

  post: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),

  put: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),

  delete: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE', body }),
};

export interface ResourceDocumentPayload<T = unknown> {
  type?: string;
  data: T;
  updated_at?: string | null;
}

/** 从 GET /resource/:type 或裸 JSON 解包 data */
export function unwrapResourceData<T = unknown>(payload: unknown, fallback: T): T {
  if (payload == null) return fallback;
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const data = (payload as ResourceDocumentPayload<T>).data;
    return data === null || data === undefined ? fallback : data;
  }
  return payload as T;
}

/* ---------- 通用资源请求（按 type 路由） ---------- */

export const resourceApi = {
  list: <T = unknown>(type: ResourceType) => {
    const conf = getResourceEndpoint(type);
    return http.get<T>(conf.listPath, { domain: conf.domain });
  },

  create: <T = unknown>(type: ResourceType, body: unknown) => {
    const conf = getResourceEndpoint(type);
    return http.post<T>(conf.itemPath, body, {
      domain: conf.domain,
      enqueueOnFail: true,
    });
  },

  update: <T = unknown>(type: ResourceType, body: unknown) => {
    const conf = getResourceEndpoint(type);
    let payload: unknown = body;
    if (type === 'user_profile') {
      payload = { profile: body };
    } else if (conf.mode === 'document') {
      payload = { data: body };
    }
    return http.put<T>(conf.itemPath, payload, {
      domain: conf.domain,
      enqueueOnFail: true,
    });
  },

  remove: <T = unknown>(type: ResourceType, id: string) => {
    const conf = getResourceEndpoint(type);
    return http.delete<T>(conf.itemPath, { id }, {
      domain: conf.domain,
      enqueueOnFail: true,
    });
  },

  /** document：读取整份资源 */
  getDocument: <T = unknown>(type: ResourceType) => {
    const conf = getResourceEndpoint(type);
    return http.get<ResourceDocumentPayload<T>>(conf.listPath, { domain: conf.domain });
  },

  /** document：写入整份资源 */
  putDocument: <T = unknown>(type: ResourceType, data: T) => {
    const conf = getResourceEndpoint(type);
    return http.put<ResourceDocumentPayload<T>>(conf.itemPath, { data }, {
      domain: conf.domain,
      enqueueOnFail: true,
    });
  },
};

export function getSyncQueue(): readonly QueuedRequest[] {
  return syncQueue.slice();
}

export function clearSyncQueue(): void {
  syncQueue.length = 0;
  persistQueue();
}

export function getSyncQueueSize(): number {
  return syncQueue.length;
}

export async function runSyncQueue(): Promise<{
  total: number;
  success: number;
  failed: number;
}> {
  if (syncRunning) {
    return { total: 0, success: 0, failed: 0 };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { total: syncQueue.length, success: 0, failed: syncQueue.length };
  }

  syncRunning = true;
  let success = 0;
  let failed = 0;
  const total = syncQueue.length;

  try {
    const pending = syncQueue.splice(0, syncQueue.length);

    for (const item of pending) {
      const result = await apiRequest(item.path, {
        method: item.method,
        body: item.body,
        headers: item.headers,
        domain: item.domain,
        enqueueOnFail: false,
      });

      if (result.ok) {
        success += 1;
      } else {
        failed += 1;
        item.retries += 1;
        syncQueue.push(item);
      }
    }
    persistQueue();
  } finally {
    syncRunning = false;
  }

  return { total, success, failed };
}

export function bindOnlineSync(): void {
  if (typeof window === 'undefined' || onlineBound) return;
  onlineBound = true;
  window.addEventListener('online', () => {
    void runSyncQueue();
  });
}

bindOnlineSync();

/* ---------- 兼容旧命名 ---------- */

export const itemsApi = {
  list: () => resourceApi.list('clothes'),
  create: (item: unknown) => resourceApi.create('clothes', item),
  update: (item: unknown) => resourceApi.update('clothes', item),
  remove: (id: string) => resourceApi.remove('clothes', id),
};

export const uploadApi = {
  image: (file: Blob | File, fieldName = 'image') => {
    const fd = new FormData();
    fd.append(fieldName, file);
    return apiRequest<{ url: string }>('/upload-image', {
      method: 'POST',
      body: fd,
      domain: 'upload',
      enqueueOnFail: false,
    });
  },
};

export const profileApi = {
  getUserProfile: () =>
    http.get<{ profile?: Record<string, unknown> } | Record<string, unknown>>('/user_profile', {
      domain: 'user_profile',
    }),
  updateUserProfile: (profile: unknown) =>
    http.put<{ profile?: Record<string, unknown> }>('/user_profile', { profile }, {
      domain: 'user_profile',
      enqueueOnFail: true,
    }),
  get: () => profileApi.getUserProfile(),
  update: (profile: unknown) => profileApi.updateUserProfile(profile),
};

/** 统一 api 入口 */
export const api = {
  getUserProfile: profileApi.getUserProfile,
  updateUserProfile: profileApi.updateUserProfile,
  uploadImage: (file: Blob | File) => uploadApi.image(file),
  listItems: itemsApi.list,
  createItem: itemsApi.create,
  updateItem: itemsApi.update,
  deleteItem: itemsApi.remove,
  getResource: <T = unknown>(type: ResourceType) => resourceApi.getDocument<T>(type),
  updateResource: <T = unknown>(type: ResourceType, data: T) => resourceApi.putDocument<T>(type, data),
};
