/**
 * PWA：注册 Service Worker、检查更新、提示用户刷新
 * 不介入 dataStore / Worker 业务逻辑
 *
 * 更新检测策略：
 * 1) Service Worker update()（依赖每次构建改写的 sw.js / CACHE 名）
 * 2) 比对当前页与远端 index.html 的 /assets/* 指纹（覆盖「只改了 JS、忘改 SW」的情况）
 */

let bootstrapped = false;
let refreshing = false;
let updatePromptOpen = false;

function canUseSw(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

async function activateWaitingWorker(worker: ServiceWorker | null | undefined): Promise<void> {
  if (!worker) return;
  worker.postMessage('SKIP_WAITING');
}

function reloadOnce(): void {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
}

function promptAppUpdate(worker: ServiceWorker | null | undefined): boolean {
  if (updatePromptOpen || !worker) return false;
  updatePromptOpen = true;
  const ok = window.confirm('发现衣橱应用新版本，是否立即更新？');
  updatePromptOpen = false;
  if (!ok) return false;
  activateWaitingWorker(worker).then(() => {
    // controllerchange 也会触发 reload；这里兜底一次
    setTimeout(reloadOnce, 300);
  });
  return true;
}

/** 无新 SW、但壳资源已变：直接刷新页面（network-first 会拉到新 HTML/JS） */
function promptShellReload(): boolean {
  if (updatePromptOpen) return false;
  updatePromptOpen = true;
  const ok = window.confirm('发现衣橱应用新版本，是否立即更新？');
  updatePromptOpen = false;
  if (!ok) return false;
  reloadOnce();
  return true;
}

function handleInstalledWorker(reg: ServiceWorkerRegistration, worker: ServiceWorker | null | undefined): void {
  if (!worker) return;
  // 已有旧控制器：提示用户确认后更新
  if (navigator.serviceWorker.controller) {
    promptAppUpdate(reg.waiting || worker);
    return;
  }
  // 首次安装 / 尚无控制器：静默激活，避免卡在 waiting，也不走旧缓存
  activateWaitingWorker(reg.waiting || worker);
}

function watchWorker(reg: ServiceWorkerRegistration): void {
  if (reg.waiting) {
    handleInstalledWorker(reg, reg.waiting);
  }

  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') {
        handleInstalledWorker(reg, reg.waiting || installing);
      }
    });
  });
}

/** 从 HTML 文本提取 Vite 产物路径指纹 */
function fingerprintFromHtml(html: string): string {
  const hits: string[] = [];
  const re = /\/assets\/[^"'\\\s>]+\.(?:js|css)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    hits.push(m[0]);
  }
  return hits.sort().join('|');
}

/** 当前已加载页面的壳资源指纹 */
function currentShellFingerprint(): string {
  const hits: string[] = [];
  document.querySelectorAll('script[src*="/assets/"]').forEach((el) => {
    try {
      hits.push(new URL((el as HTMLScriptElement).src, location.href).pathname);
    } catch {
      /* ignore */
    }
  });
  document.querySelectorAll('link[rel="stylesheet"][href*="/assets/"]').forEach((el) => {
    try {
      hits.push(new URL((el as HTMLLinkElement).href, location.href).pathname);
    } catch {
      /* ignore */
    }
  });
  return hits.sort().join('|');
}

/** 绕过本地/HTTP 缓存拉取线上 index.html 的指纹 */
async function fetchRemoteShellFingerprint(): Promise<string> {
  const url = `/index.html?_sw_check=${Date.now()}`;
  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'text/html' },
  });
  if (!res.ok) throw new Error('无法获取线上页面');
  return fingerprintFromHtml(await res.text());
}

async function hasRemoteShellUpdate(): Promise<boolean> {
  const local = currentShellFingerprint();
  if (!local) return false;
  const remote = await fetchRemoteShellFingerprint();
  if (!remote) return false;
  return local !== remote;
}

/** 等 install 完成后再读 waiting，避免 update() resolve 过早 */
async function waitForWorkerInstall(reg: ServiceWorkerRegistration): Promise<void> {
  const installing = reg.installing;
  if (!installing) return;
  if (installing.state === 'installed' || installing.state === 'activated' || installing.state === 'redundant') {
    return;
  }
  await new Promise<void>((resolve) => {
    const done = () => {
      if (
        installing.state === 'installed' ||
        installing.state === 'activated' ||
        installing.state === 'redundant'
      ) {
        installing.removeEventListener('statechange', done);
        resolve();
      }
    };
    installing.addEventListener('statechange', done);
    // 兜底，避免永久挂起
    setTimeout(() => {
      installing.removeEventListener('statechange', done);
      resolve();
    }, 8000);
  });
}

/** 启动时注册 SW（全页只执行一次），并在回到前台时检查更新 */
export function registerPwa(): void {
  if (!canUseSw() || bootstrapped) return;
  bootstrapped = true;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    reloadOnce();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        watchWorker(reg);
        // 启动后再查一次，避免长期挂着旧 waiting
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker 注册失败', err);
      });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return;
      try {
        await reg.update();
        await waitForWorkerInstall(reg);
      } catch {
        /* ignore */
      }
      if (reg.waiting && navigator.serviceWorker.controller) {
        promptAppUpdate(reg.waiting);
        return;
      }
      try {
        if (await hasRemoteShellUpdate()) {
          promptShellReload();
        }
      } catch {
        /* ignore */
      }
    });
  });
}

/** 手动检查应用壳更新（设置页）；register 对同一 scope 幂等，不会重复安装 */
export async function checkForAppUpdate(): Promise<'updated' | 'latest' | 'unsupported' | 'error'> {
  if (!canUseSw()) return 'unsupported';
  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw.js');
      // 首次注册后仍比对壳资源，避免「刚装 SW 但页面已是旧 HTML」
    } else {
      // 强制走更新算法；构建时会改写 sw.js / CACHE，字节变化才会进入 waiting
      await reg.update();
      await waitForWorkerInstall(reg);
      reg = (await navigator.serviceWorker.getRegistration()) || reg;
      if (reg.waiting && navigator.serviceWorker.controller) {
        const accepted = promptAppUpdate(reg.waiting);
        return accepted ? 'updated' : 'latest';
      }
    }

    // SW 无变化时：直接比对线上 index.html 的 hashed assets（覆盖仅更新 app 代码的发布）
    if (await hasRemoteShellUpdate()) {
      const accepted = promptShellReload();
      return accepted ? 'updated' : 'latest';
    }
    return 'latest';
  } catch (err) {
    console.warn('[PWA] 检查更新失败', err);
    return 'error';
  }
}
