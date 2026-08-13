/**
 * PWA：注册 Service Worker、检查更新、提示用户刷新
 * 不介入 dataStore / Worker 业务逻辑
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

function promptAppUpdate(worker: ServiceWorker | null | undefined): void {
  if (updatePromptOpen || !worker) return;
  updatePromptOpen = true;
  const ok = window.confirm('发现衣橱应用新版本，是否立即更新？');
  updatePromptOpen = false;
  if (!ok) return;
  activateWaitingWorker(worker).then(() => {
    // controllerchange 也会触发 reload；这里兜底一次
    setTimeout(reloadOnce, 300);
  });
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
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      reg.update().catch(() => {});
      if (reg.waiting && navigator.serviceWorker.controller) {
        promptAppUpdate(reg.waiting);
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
      return 'latest';
    }
    await reg.update();
    if (reg.waiting && navigator.serviceWorker.controller) {
      promptAppUpdate(reg.waiting);
      return 'updated';
    }
    return 'latest';
  } catch (err) {
    console.warn('[PWA] 检查更新失败', err);
    return 'error';
  }
}
