import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 每次 build 改写 dist/sw.js 的 CACHE / BUILD 注释，
 * 保证发布后 ServiceWorkerRegistration.update() 能发现字节变化。
 */
function stampServiceWorker(): Plugin {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist/sw.js');
      if (!fs.existsSync(swPath)) return;
      const buildId = new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, '')
        .slice(0, 14);
      let src = fs.readFileSync(swPath, 'utf8');
      src = src.replace(/\/\* __SW_BUILD_ID__ \*\//, `/* build:${buildId} */`);
      src = src.replace(/const CACHE = '[^']+'/, `const CACHE = 'wardrobe-shell-${buildId}'`);
      fs.writeFileSync(swPath, src);
      console.log(`[PWA] stamped sw.js build=${buildId}`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
