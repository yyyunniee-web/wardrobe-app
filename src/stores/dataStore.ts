/**
 * 全局云端数据仓库（唯一业务数据访问入口）
 * - fetchResource / updateResource：按 type 复用
 * - document 资源走 GET|PUT /resource/:type
 * - 禁止业务 localStorage；队列除外（request 层）
 */

import {
  RESOURCE_ENDPOINTS,
  api,
  getResourceEndpoint,
  getSyncQueueSize,
  registerResourceEndpoint,
  resourceApi,
  runSyncQueue,
  unwrapResourceData,
  uploadApi,
  type ApiResult,
  type ResourceEndpointConfig,
  type ResourceType,
} from '@/utils/request';

/* ============================================================
   类型
   ============================================================ */

export interface ClothItem {
  id: string;
  name: string;
  tags: string[];
  photo_url: string;
  notes: string;
}

export type ClothCreateInput = Omit<ClothItem, 'id'> & { id?: string };
export type ClothUpdateInput = ClothItem;

export interface UserProfile {
  id?: string;
  nickname?: string;
  name?: string;
  avatar?: string;
  avatar_url?: string;
  city?: string;
  age?: string | number;
  mbti?: string;
  prefStyles?: string[];
  [key: string]: unknown;
}

export interface OutfitRecord {
  id: string;
  date?: string;
  photo_url?: string;
  mood?: string;
  note?: string;
  item_ids?: string[];
  [key: string]: unknown;
}

export interface FilterSetting {
  buyStart?: string;
  buyEnd?: string;
  includeRetired?: boolean;
  seasons?: string[];
  scenes?: string[];
  categories?: string[];
  [key: string]: unknown;
}

export type CheckinRecord = OutfitRecord;
export type UserSettings = FilterSetting & UserProfile;

export interface ResourceMap {
  clothes: ClothItem;
  user_profile: UserProfile;
  checkins: unknown[];
  logs: unknown[];
  custom_scenes: string[];
  outfit: unknown[];
  filter_setting: FilterSetting;
  [key: string]: unknown;
}

export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ModuleState<T> {
  list: T[];
  /** document 模式完整载荷（数组或对象） */
  document: unknown;
  status: LoadStatus;
  error: string | null;
  updatedAt: number | null;
}

export interface DataStoreState {
  resources: Record<string, ModuleState<unknown>>;
  initialized: boolean;
  syncing: boolean;
  bootstrapError: string | null;
}

export interface StoreActionResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
  queued?: boolean;
}

export interface InitDataStoreResult {
  ok: boolean;
  error?: string;
  results: Partial<Record<ResourceType, StoreActionResult<unknown>>>;
  clothes: ClothItem[];
}

type Listener = () => void;

const SENSITIVE_KEYS = new Set(['apiKey', 'api_key', 'secret', 'token', 'password']);

/* ============================================================
   内部状态
   ============================================================ */

function emptyModule<T>(): ModuleState<T> {
  return {
    list: [],
    document: undefined,
    status: 'idle',
    error: null,
    updatedAt: null,
  };
}

function createInitialResources(): Record<string, ModuleState<unknown>> {
  const map: Record<string, ModuleState<unknown>> = {};
  for (const type of Object.keys(RESOURCE_ENDPOINTS)) {
    map[type] = emptyModule();
  }
  return map;
}

const state: DataStoreState = {
  resources: createInitialResources(),
  initialized: false,
  syncing: false,
  bootstrapError: null,
};

const listeners = new Set<Listener>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('[dataStore] listener error', err);
    }
  });
}

function ensureModule(type: ResourceType): ModuleState<unknown> {
  if (!state.resources[type]) {
    state.resources[type] = emptyModule();
  }
  return state.resources[type];
}

function createId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fromApiResult<T>(result: ApiResult<T>): StoreActionResult<T> {
  if (result.ok) return { ok: true, data: result.data };
  return { ok: false, error: result.error, queued: result.queued };
}

function getItemId(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const o = item as Record<string, unknown>;
  if (typeof o.id === 'string') return o.id;
  if (typeof o.id === 'number') return String(o.id);
  return '';
}

/** 禁止密钥进入 D1 */
export function stripSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripSensitiveFields(v)) as T;
  }
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) continue;
    out[k] = stripSensitiveFields(v);
  }
  return out as T;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* ---------- normalize ---------- */

function normalizeCloth(input: unknown): ClothItem | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : typeof o.id === 'number' ? String(o.id) : '';
  if (!id) return null;

  let tags: string[] = [];
  if (Array.isArray(o.tags)) {
    tags = o.tags.filter((t): t is string => typeof t === 'string');
  } else if (typeof o.tags === 'string') {
    try {
      const parsed = JSON.parse(o.tags) as unknown;
      if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
    } catch {
      tags = o.tags ? [o.tags] : [];
    }
  }

  return {
    id,
    name: typeof o.name === 'string' ? o.name : '',
    tags,
    photo_url:
      typeof o.photo_url === 'string'
        ? o.photo_url
        : typeof o.photo === 'string'
          ? o.photo
          : '',
    notes: typeof o.notes === 'string' ? o.notes : o.notes != null ? JSON.stringify(o.notes) : '',
  };
}

function normalizeUserProfile(input: unknown): UserProfile | null {
  if (!input || typeof input !== 'object') return null;
  const o = stripSensitiveFields(input as Record<string, unknown>);
  return {
    ...o,
    id: typeof o.id === 'string' ? o.id : o.id != null ? String(o.id) : 'default',
    nickname: typeof o.nickname === 'string' ? o.nickname : typeof o.name === 'string' ? o.name : '',
    name: typeof o.name === 'string' ? o.name : typeof o.nickname === 'string' ? o.nickname : '',
    avatar:
      typeof o.avatar === 'string'
        ? o.avatar
        : typeof o.avatar_url === 'string'
          ? o.avatar_url
          : '',
    avatar_url:
      typeof o.avatar_url === 'string'
        ? o.avatar_url
        : typeof o.avatar === 'string'
          ? o.avatar
          : '',
  };
}

function normalizeByType(type: ResourceType, input: unknown): unknown | null {
  switch (type) {
    case 'clothes':
      return normalizeCloth(input);
    case 'user_profile':
      return normalizeUserProfile(input);
    default:
      if (input == null) return null;
      return stripSensitiveFields(input);
  }
}

function unwrapUserProfilePayload(data: unknown): unknown {
  if (data && typeof data === 'object' && 'profile' in data) {
    return (data as { profile: unknown }).profile;
  }
  return data;
}

function applyDocumentToModule(type: ResourceType, raw: unknown): unknown {
  const conf = getResourceEndpoint(type);
  const fallback = conf.defaultData !== undefined ? cloneJson(conf.defaultData) : null;
  const data = unwrapResourceData(raw, fallback);
  const safe = stripSensitiveFields(data);
  const mod = ensureModule(type);
  mod.document = safe;
  if (Array.isArray(safe)) {
    mod.list = safe.slice();
  } else if (safe && typeof safe === 'object') {
    mod.list = [safe];
  } else {
    mod.list = [];
  }
  return safe;
}

function normalizeListPayload(type: ResourceType, data: unknown): unknown[] {
  const conf = getResourceEndpoint(type);

  if (type === 'user_profile') {
    const one = normalizeByType(type, unwrapUserProfilePayload(data));
    return one ? [one] : [];
  }

  if (conf.mode === 'document') {
    const doc = applyDocumentToModule(type, data);
    return Array.isArray(doc) ? doc : doc != null ? [doc] : [];
  }

  if (conf.mode === 'singleton') {
    const one = normalizeByType(type, data);
    return one ? [one] : [];
  }

  const raw = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as { items?: unknown; data?: unknown; list?: unknown }).items ??
        (data as { data?: unknown }).data ??
        (data as { list?: unknown }).list)
      : [];

  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeByType(type, item)).filter((x) => x != null);
}

function toApiCloth(item: ClothItem): ClothItem {
  return {
    id: item.id,
    name: item.name,
    tags: [...item.tags],
    photo_url: item.photo_url,
    notes: item.notes,
  };
}

/**
 * POST/PUT /item 常返回精简 ack（仅 ok/id）。
 * 若用 ack 直接 normalize，会把 notes 清空并污染内存，后续再 PUT 会写坏 D1。
 */
function resolveClothFromResponse(apiData: unknown, payload: unknown): ClothItem | null {
  const fromApi = normalizeCloth(apiData);
  const fromPayload = normalizeCloth(payload);
  if (!fromApi && !fromPayload) return null;
  if (!fromApi) return fromPayload;
  if (!fromPayload) return fromApi;

  const apiNotes = (fromApi.notes || '').trim();
  const payloadNotes = (fromPayload.notes || '').trim();
  const notes =
    apiNotes && apiNotes !== '{}' && apiNotes.startsWith('{')
      ? apiNotes
      : payloadNotes || apiNotes;

  return {
    id: fromApi.id || fromPayload.id,
    name: fromApi.name || fromPayload.name,
    tags: fromApi.tags.length ? fromApi.tags : fromPayload.tags,
    photo_url: fromApi.photo_url || fromPayload.photo_url,
    notes,
  };
}

/* ============================================================
   订阅 / 读取
   ============================================================ */

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getState(): Readonly<DataStoreState> {
  return state;
}

export function getResourceList<T = unknown>(type: ResourceType): readonly T[] {
  return (ensureModule(type).list as T[]).slice();
}

export function getResourceDocument<T = unknown>(type: ResourceType): T | null {
  const mod = ensureModule(type);
  if (mod.document !== undefined) return mod.document as T;
  const conf = getResourceEndpoint(type);
  if (conf.mode === 'document') {
    return (conf.defaultData !== undefined ? cloneJson(conf.defaultData) : null) as T | null;
  }
  if (conf.mode === 'singleton') {
    return (mod.list[0] as T) ?? null;
  }
  return mod.list.slice() as T;
}

export function getResourceById<T extends { id?: string }>(
  type: ResourceType,
  id: string,
): T | undefined {
  return getResourceList<T>(type).find((item) => item.id === id);
}

export function registerResource(config: ResourceEndpointConfig): void {
  registerResourceEndpoint(config);
  ensureModule(config.type);
  emit();
}

/* ============================================================
   通用 CRUD
   ============================================================ */

export async function fetchResource<T = unknown>(
  type: ResourceType,
): Promise<StoreActionResult<T[]>> {
  const mod = ensureModule(type);
  mod.status = 'loading';
  mod.error = null;
  emit();

  if (type === 'user_profile') {
    const profileRes = await loadUserProfileFromApi();
    if (!profileRes.ok) {
      return { ok: false, error: profileRes.error, queued: profileRes.queued };
    }
    return { ok: true, data: profileRes.data ? [profileRes.data as T] : [] };
  }

  const conf = getResourceEndpoint(type);
  const result =
    conf.mode === 'document'
      ? await resourceApi.getDocument(type)
      : await resourceApi.list(type);

  if (!result.ok) {
    mod.status = 'error';
    mod.error = result.error;
    emit();
    return fromApiResult(result) as StoreActionResult<T[]>;
  }

  const list = normalizeListPayload(type, result.data) as T[];
  if (conf.mode !== 'document') {
    mod.list = list;
    if (conf.mode === 'singleton') mod.document = list[0] ?? null;
  }
  mod.status = 'success';
  mod.error = null;
  mod.updatedAt = Date.now();
  emit();

  return { ok: true, data: list };
}

/** 写入资源：collection 单条 / singleton 对象 / document 整份 */
export async function updateResource<T = unknown>(
  type: ResourceType,
  input: T,
): Promise<StoreActionResult<T>> {
  const conf = getResourceEndpoint(type);
  const mod = ensureModule(type);
  const safeInput = stripSensitiveFields(cloneJson(input));

  if (type === 'user_profile') {
    return saveUserProfileToApi(safeInput as UserProfile) as Promise<StoreActionResult<T>>;
  }

  if (conf.mode === 'document') {
    const result = await resourceApi.putDocument(type, safeInput);
    if (!result.ok) {
      return fromApiResult(result) as StoreActionResult<T>;
    }
    applyDocumentToModule(type, { data: safeInput });
    mod.status = 'success';
    mod.updatedAt = Date.now();
    emit();
    return { ok: true, data: safeInput };
  }

  let payload: unknown = { ...(safeInput as object) };

  if (type === 'clothes') {
    const cloth = normalizeCloth(payload);
    if (!cloth?.id) return { ok: false, error: '缺少衣物 id' };
    if (!cloth.name) return { ok: false, error: '名称不能为空' };
    payload = toApiCloth(cloth) as unknown;
  } else if (conf.mode === 'collection' && !getItemId(payload)) {
    return { ok: false, error: `缺少 ${type} id` };
  }

  const result = await resourceApi.update(type, payload);
  if (!result.ok) {
    return fromApiResult(result) as StoreActionResult<T>;
  }

  const updated = (
    type === 'clothes'
      ? resolveClothFromResponse(result.data, payload)
      : (normalizeByType(type, result.data) ?? normalizeByType(type, payload))
  ) as T | null;
  if (!updated) {
    return { ok: false, error: '更新成功但无法解析返回数据' };
  }

  if (conf.mode === 'singleton') {
    mod.list = [updated];
    mod.document = updated;
  } else {
    const id = getItemId(updated);
    const idx = mod.list.findIndex((x) => getItemId(x) === id);
    if (idx >= 0) mod.list[idx] = updated;
    else mod.list = [updated, ...mod.list];
  }
  mod.updatedAt = Date.now();
  emit();

  return { ok: true, data: updated };
}

export async function addResource<T extends { id?: string } = Record<string, unknown>>(
  type: ResourceType,
  input: T,
): Promise<StoreActionResult<T>> {
  const conf = getResourceEndpoint(type);
  const mod = ensureModule(type);

  if (conf.mode === 'document') {
    return { ok: false, error: `${type} 为整份文档资源，请使用 updateResource` };
  }

  let payload: unknown = { ...(input as object) };
  if (conf.mode === 'collection' && !getItemId(payload)) {
    payload = { ...(payload as object), id: createId(type) };
  }

  if (type === 'clothes') {
    const cloth = normalizeCloth(payload);
    if (!cloth?.name) return { ok: false, error: '名称不能为空' };
    payload = toApiCloth(cloth) as unknown;
  }

  const result = await resourceApi.create(type, payload);
  if (!result.ok) {
    return fromApiResult(result) as StoreActionResult<T>;
  }

  const created = (
    type === 'clothes'
      ? resolveClothFromResponse(result.data, payload)
      : (normalizeByType(type, result.data) ?? normalizeByType(type, payload))
  ) as T | null;
  if (!created) {
    return { ok: false, error: '新增成功但无法解析返回数据' };
  }

  if (conf.mode === 'singleton') {
    mod.list = [created];
  } else {
    const id = getItemId(created);
    const idx = mod.list.findIndex((x) => getItemId(x) === id);
    if (idx >= 0) mod.list[idx] = created;
    else mod.list = [created, ...mod.list];
  }
  mod.updatedAt = Date.now();
  emit();

  return { ok: true, data: created };
}

export async function deleteResource(
  type: ResourceType,
  id: string,
): Promise<StoreActionResult<void>> {
  if (!id) return { ok: false, error: '缺少 id' };

  const mod = ensureModule(type);
  const result = await resourceApi.remove(type, id);
  if (!result.ok) {
    return fromApiResult(result) as StoreActionResult<void>;
  }

  mod.list = mod.list.filter((x) => getItemId(x) !== id);
  mod.updatedAt = Date.now();
  emit();

  return { ok: true };
}

/** 高频变更防抖写入 document 资源 */
export function updateResourceDebounced<T = unknown>(
  type: ResourceType,
  input: T,
  waitMs = 600,
): Promise<StoreActionResult<T>> {
  const key = String(type);
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      debounceTimers.delete(key);
      void updateResource<T>(type, input).then(resolve);
    }, waitMs);
    debounceTimers.set(key, timer);
  });
}

/* ============================================================
   衣物
   ============================================================ */

export function getClothes(): readonly ClothItem[] {
  return getResourceList<ClothItem>('clothes');
}

export function getClothById(id: string): ClothItem | undefined {
  return getResourceById<ClothItem>('clothes', id);
}

export function fetchClothes(): Promise<StoreActionResult<ClothItem[]>> {
  return fetchResource<ClothItem>('clothes');
}

export async function addCloth(input: ClothCreateInput): Promise<StoreActionResult<ClothItem>> {
  return addResource<ClothItem>('clothes', {
    id: input.id?.trim() || createId('cloth'),
    name: input.name?.trim() || '',
    tags: Array.isArray(input.tags) ? input.tags : [],
    photo_url: input.photo_url || '',
    notes: input.notes || '',
  });
}

export function updateCloth(input: ClothUpdateInput): Promise<StoreActionResult<ClothItem>> {
  return updateResource<ClothItem>('clothes', input);
}

export function removeCloth(id: string): Promise<StoreActionResult<void>> {
  return deleteResource('clothes', id);
}

export async function uploadClothImage(file: Blob | File): Promise<StoreActionResult<string>> {
  const result = await uploadApi.image(file);
  if (!result.ok) {
    return { ok: false, error: result.error, queued: result.queued };
  }
  const url =
    result.data && typeof result.data === 'object' && 'url' in result.data
      ? String((result.data as { url: string }).url || '')
      : '';
  if (!url) return { ok: false, error: '上传接口未返回 url' };
  return { ok: true, data: url };
}

/* ============================================================
   用户资料
   ============================================================ */

export function getUserProfile(): UserProfile | null {
  const list = getResourceList<UserProfile>('user_profile');
  return list[0] ?? null;
}

export async function loadUserProfileFromApi(): Promise<StoreActionResult<UserProfile>> {
  const mod = ensureModule('user_profile');
  mod.status = 'loading';
  mod.error = null;
  emit();

  const result = await api.getUserProfile();
  if (!result.ok) {
    mod.status = 'error';
    mod.error = result.error;
    emit();
    return { ok: false, error: result.error, queued: result.queued };
  }

  const raw = unwrapUserProfilePayload(result.data);
  const profile = normalizeUserProfile(raw) ?? (raw && typeof raw === 'object' ? (raw as UserProfile) : null);
  if (!profile) {
    mod.list = [{}];
    mod.document = {};
    mod.status = 'success';
    mod.updatedAt = Date.now();
    emit();
    return { ok: true, data: {} };
  }

  mod.list = [profile];
  mod.document = profile;
  mod.status = 'success';
  mod.error = null;
  mod.updatedAt = Date.now();
  emit();
  return { ok: true, data: profile };
}

export async function saveUserProfileToApi(
  profile: UserProfile,
): Promise<StoreActionResult<UserProfile>> {
  const safe = stripSensitiveFields(cloneJson(profile));
  const result = await api.updateUserProfile(safe);
  if (!result.ok) {
    return { ok: false, error: result.error, queued: result.queued };
  }

  const savedRaw = unwrapUserProfilePayload(result.data) ?? safe;
  const saved = normalizeUserProfile(savedRaw) ?? { ...safe };
  const mod = ensureModule('user_profile');
  mod.list = [saved];
  mod.document = saved;
  mod.status = 'success';
  mod.updatedAt = Date.now();
  emit();
  return { ok: true, data: saved };
}

export function fetchUserProfile(): Promise<StoreActionResult<UserProfile[]>> {
  return loadUserProfileFromApi().then((res) => {
    if (!res.ok) return { ok: false as const, error: res.error, queued: res.queued };
    return { ok: true as const, data: res.data ? [res.data] : [] };
  });
}

export async function updateNickname(nickname: string): Promise<StoreActionResult<UserProfile>> {
  const current = getUserProfile() ?? {};
  return saveUserProfileToApi({
    ...current,
    nickname: nickname.trim(),
    name: nickname.trim(),
  });
}

export async function updateAvatar(avatarUrl: string): Promise<StoreActionResult<UserProfile>> {
  const current = getUserProfile() ?? {};
  const url = avatarUrl.trim();
  return saveUserProfileToApi({
    ...current,
    avatar: url,
    avatar_url: url,
  });
}

export async function uploadAvatarImage(file: Blob | File): Promise<StoreActionResult<string>> {
  return uploadClothImage(file);
}

/* ============================================================
   document 便捷方法
   ============================================================ */

export function saveCheckins(data: unknown[]): Promise<StoreActionResult<unknown[]>> {
  return updateResource('checkins', data);
}

export function saveLogs(data: unknown[]): Promise<StoreActionResult<unknown[]>> {
  return updateResource('logs', data);
}

export function saveCustomScenes(data: string[]): Promise<StoreActionResult<string[]>> {
  return updateResource('custom_scenes', data);
}

export function saveOutfit(data: unknown[]): Promise<StoreActionResult<unknown[]>> {
  return updateResource('outfit', data);
}

export function saveFilterSetting(data: FilterSetting): Promise<StoreActionResult<FilterSetting>> {
  return updateResource('filter_setting', data);
}

export function saveFilterSettingDebounced(
  data: FilterSetting,
  waitMs = 600,
): Promise<StoreActionResult<FilterSetting>> {
  return updateResourceDebounced('filter_setting', data, waitMs);
}

/* ============================================================
   初始化：并行拉取全部 bootstrap 资源
   ============================================================ */

export async function initDataStore(): Promise<InitDataStoreResult> {
  state.initialized = true;
  state.bootstrapError = null;
  emit();

  if (getSyncQueueSize() > 0) {
    state.syncing = true;
    emit();
    try {
      await runSyncQueue();
    } finally {
      state.syncing = false;
      emit();
    }
  }

  const bootstrapTypes = Object.values(RESOURCE_ENDPOINTS)
    .filter((c) => c.bootstrap !== false)
    .map((c) => c.type);

  const settled = await Promise.all(
    bootstrapTypes.map(async (type) => {
      const res = await fetchResource(type);
      return [type, res] as const;
    }),
  );

  const results: InitDataStoreResult['results'] = {};
  const errors: string[] = [];
  for (const [type, res] of settled) {
    results[type] = res;
    if (!res.ok) errors.push(`${type}: ${res.error || '加载失败'}`);
  }

  if (errors.length) {
    const error = `云端数据加载失败（${errors.join('；')}）`;
    state.bootstrapError = error;
    emit();
    return {
      ok: false,
      error,
      results,
      clothes: getClothes().slice(),
    };
  }

  state.bootstrapError = null;
  emit();
  return {
    ok: true,
    results,
    clothes: getClothes().slice(),
  };
}

export async function syncPendingAndRefresh(): Promise<StoreActionResult<ClothItem[]>> {
  state.syncing = true;
  emit();
  try {
    await runSyncQueue();
  } finally {
    state.syncing = false;
    emit();
  }
  return fetchClothes();
}

/* ============================================================
   聚合导出
   ============================================================ */

export const dataStore = {
  subscribe,
  getState,
  getResourceList,
  getResourceDocument,
  getResourceById,
  registerResource,
  fetchResource,
  addResource,
  updateResource,
  updateResourceDebounced,
  deleteResource,
  initDataStore,
  stripSensitiveFields,
  getClothes,
  getClothById,
  fetchClothes,
  addCloth,
  updateCloth,
  removeCloth,
  uploadClothImage,
  getUserProfile,
  fetchUserProfile,
  loadUserProfileFromApi,
  saveUserProfileToApi,
  updateNickname,
  updateAvatar,
  uploadAvatarImage,
  saveCheckins,
  saveLogs,
  saveCustomScenes,
  saveOutfit,
  saveFilterSetting,
  saveFilterSettingDebounced,
  syncPendingAndRefresh,
};

export default dataStore;
