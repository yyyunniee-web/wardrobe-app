/**
 * 衣橱应用入口（Vite）
 * 页面挂载时通过 dataStore 拉取云端衣物
 */
import '@/index.css';
import { Solar } from 'lunar-javascript';
import { mountWardrobeApp } from '@/wardrobe/app';
import { registerPwa } from '@/wardrobe/pwa';

// 黄历：自托管，避免 jsdelivr CDN 在大陆不可达
(window as unknown as { Solar: typeof Solar }).Solar = Solar;

registerPwa();
mountWardrobeApp();
