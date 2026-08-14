# 个人智能穿搭衣橱

# 版本信息

| 项 | 内容 |
|----|------|
| **产品版本** | `v1.0.0-stable`（第一个正式产品版本） |
| **Git tag** | `v1.3.0-stable` |
| **Git commit** | `685ad99ef47c51a272310f055a36ec5b0a59bccf`（短：`685ad99`） |
| **Commit 说明** | `feat: add universal photo editing and cropping flow` |
| **发布日期** | 2026-08-14（以 commit 时间 2026-08-14 00:01:05 +0800 为准） |
| **线上地址** | https://wardrobe-app-lilac.vercel.app |
| **API 基址** | https://wardrobe-api.yyyunniee.workers.dev |

> 说明：仓库 Git 标签名为 `v1.3.0-stable`；产品文档将本稳定版定义为首个正式版 **`v1.0.0-stable`**。二者指向同一 commit。

---

# 产品定位

面向个人用户的**移动端优先**穿搭衣橱 Web App（PWA）：

- 管理衣物（品类、季节、场景、颜色、面料、价格、购买日期、图片）
- 用 **AI 订单截图**快速录入衣物信息
- 记录心情与穿搭打卡、查看穿着分析
- 数据经 **Cloudflare Worker** 云端同步；图片存对象存储（前端经 `/upload-image` 上传）
- 支持「添加到主屏幕」以 standalone 方式使用

技术形态：Vite + TypeScript 前端壳（主入口 `index.html` → `src/wardrobe/main.ts`），UI 为 vanilla DOM（非 React 主流程）。后端 Worker 源码不在本仓库，仅通过 HTTP API 对接。

---

# 当前已有功能

## 衣橱管理

- **添加衣物**
  - 入口：衣橱页「添加」→ AI 订单截图录入 / 手动录入
  - 字段：名称、品类、季节标签、场景标签、颜色、面料、购买时间、购买价格、图片、状态（编辑时）
  - 自定义场景可新增并云端同步
- **编辑衣物**
  - 详情页进入编辑表单；可改字段、换图、裁剪图
- **删除衣物**
  - 编辑表单内删除；同步删除关联穿着日志（前端逻辑）
- **淘汰 / 恢复**
  - 详情页标记「已淘汰」或恢复「在用」（`status: active | retired`）
- **分类浏览**
  - 品类卡片（上衣、外套、裤装等）→ 品类列表
  - 在用 / 已淘汰切换；名称搜索；品类筛选
  - 列表排序：购买时间、价格、穿着次数、单次穿着成本
- **图片管理**
  - 上传至云端后以 URL 保存在衣物 `photo` / `photo_url`
  - 表单内点击图片：裁剪 / 重新上传 / 取消（见「图片能力」）
- **导出**
  - 单件导出；全量衣橱导出 JSON / CSV（含 photo URL 与建议本地文件名）
- **备份**
  - 设置页：全量备份导出 / 导入（导入会替换远端衣物，需用户确认）

## AI 能力

- **AI 订单截图录入**
  - 上传淘宝/电商等订单截图 → 视觉模型解析 → 预填表单 → 用户核对后入库
- **AI 识别内容（由 prompt + 解析逻辑约束）**
  - 商品名称（标题清洗简化）、品类、实付款价格、购买日期（缺少年份时补当前年）、季节、场景、颜色、面料等
  - 多商品订单：检测多件后让用户选择再裁剪/预览（禁止默认串件）
- **AI 图片处理**
  - 识别用整图上传；入库主图默认按订单左侧缩略图规则自动裁剪
  - 用户可基于**订单原图**再次手动调整裁剪
- **AI Proxy 架构**
  - 前端 `POST /ai/vision`，请求体 `{ imageUrl, prompt }`，返回 `{ ok, text }`
  - API Key 仅在 Worker 服务端；普通用户无需填写 Key
  - 生产默认启用云端 AI；DEV 构建可显示测试用 AI 配置（会话内存，不同步云端）

## 图片能力

- **上传**
  - `POST /upload-image`（FormData 字段 `image`）→ `{ url }`
  - 衣物图、头像、打卡图等走同一上传通道
- **自动裁剪（AI 订单）**
  - 本地 canvas：默认左侧缩略图启发式（`defaultOrderThumbBox`，多件按 `itemIndex` 纵向偏移）
  - 模型 `cropSuggestion` 可作为辅助框；无效或忽略时回退默认
- **手动裁剪 / 通用图片编辑**
  - 会话保留原图（`sourceUrl` + 内存 Image），展示/入库用 `_formPhoto`（可为裁剪结果）
  - 底部菜单：裁剪图片 / 重新上传 / 取消
  - 移动端优先：手指拖动裁剪框、右下角缩放；取消不改当前预览；完成才上传并替换预览
  - 适用于：AI 确认页、手动添加上传、已有衣物编辑
- **已知限制（代码约束）**
  - 原图会话不入库；关掉表单后仅能以当前 `photo` URL 再裁（无独立 original 字段）
  - 需要确认：R2 跨域是否始终允许 canvas 二次裁剪远端图

## 打卡功能

- **入口**：底部中央 FAB「打卡穿搭」
- **当前打卡流程（代码实现）**
  1. 可选：拍摄/相册上传穿搭照片，或跳过直接手动选衣
  2. 有照片时：用**随机占位**匹配 2–4 件在用衣物（代码注释标明 V1 UI 占位，真实识图为 V2）
  3. 确认/勾选衣物；可从衣橱追加挑选；可跳转添加衣物后返回
  4. 校验衣物在衣橱中存在（ID 或名称相似度）
  5. 写入打卡记录 + 各衣物穿着日志；附带当日天气快照与心情（若有）
- **已支持能力**
  - 穿搭照片上传（云端 URL）
  - 手动多选衣物、筛选排序挑选
  - 今日页心情 emoji + 文字打卡（`source: 'mood'`）
  - 穿搭日记列表、按日筛选、左滑删除、详情查看
  - 规则化「今日穿搭推荐」可生成打卡（`source: 'recommend'`）
- **未完成 / 占位**
  - 打卡照片的真实 AI 识衣匹配（明确为后续版本）

## 今日页与分析

- **今日**
  - 用户头像与昵称、短日期、城市天气（今日/明日切换）、修改城市
  - 基于气温/天气的穿衣提示文案
  - 黄历宜忌（CDN `lunar-javascript`）
  - 心情打卡、近期穿搭日记入口、穿搭推荐入口
- **分析**
  - 购入日期区间、是否含已淘汰、季节/场景/品类多选筛选（云端 `filter_setting`）
  - 统计：穿着 Top、闲置列表、价值交叉（贵但穿得少 / 便宜高频刚需）等

## 设置与资料

- 头像上传、昵称、年龄、MBTI、城市、偏好风格等 → `PUT /user_profile`
- 手动云端同步、PWA「检查应用更新」
- 全量备份导入导出
- DEV-only：AI 测试配置区块

## 数据同步

- **前端数据层**
  - `src/utils/request.ts`：统一请求、资源 CRUD、离线变更队列（`localStorage` 键 `wardrobe.syncQueue.v1`，上传类一般不入队）
  - `src/stores/dataStore.ts`：启动拉取衣物/资料/打卡/日志/场景/穿搭文档/筛选设置
- **主要 API（基址见上）**

  | 方法 | 路径 | 用途 |
  |------|------|------|
  | GET | `/items` | 衣物列表 |
  | POST/PUT/DELETE | `/item` | 衣物增改删 |
  | GET/PUT | `/user_profile` | 用户资料 |
  | GET/PUT | `/resource/checkins` | 打卡文档 |
  | GET/PUT | `/resource/logs` | 穿着日志 |
  | GET/PUT | `/resource/custom_scenes` | 自定义场景 |
  | GET/PUT | `/resource/outfit` | 穿搭文档（前端有读写；**无明显独立 UI**） |
  | GET/PUT | `/resource/filter_setting` | 分析筛选 |
  | POST | `/upload-image` | 图片上传 |
  | POST | `/ai/vision` | AI 视觉代理 |

- **衣物存储模型（前端约定）**
  - 远端：`id, name, tags[], photo_url, notes`（`notes` 为 JSON，承载品类/季节/颜色等扩展字段）
- **图片存储**
  - 前端注释与流程表明上传至云端对象存储（R2）；具体 bucket 名在本仓库不可见 → **需要确认（Worker 侧）**
- **数据库**
  - 前端不直连 DB；推断为 Cloudflare D1（历史部署记录）→ **需要确认表结构以 Worker 为准**
- **第三方**
  - 天气：Open-Meteo（地理编码 + 预报），非 Worker
- **明确不同步**
  - `aiConfig`（含 Key）、实时天气会话态、多数纯 UI 状态
  - 业务数据不以 `localStorage` 做主存储（`saveStore` 为空实现）；离线队列除外

## PWA / App 能力

- **安装**
  - `manifest.webmanifest`：`display: standalone`，名称「个人智能穿搭衣橱」/ 短名「穿搭衣橱」
  - iOS：`apple-mobile-web-app-capable`、状态栏样式、touch icon
- **离线能力**
  - Service Worker：预缓存壳资源；同源 HTML/JS/CSS **network-first**；不拦截跨域 API
  - 构建时给 CACHE 名打时间戳，便于发版更新
  - 设置页可检查更新；`vercel.json` 对 `/`、`index.html`、`sw.js` 设 `no-cache`
  - **限制**：无完整离线业务数据能力；无网时主要依赖已缓存壳 + 同步队列重试
- **移动端适配**
  - `viewport-fit=cover`；底部 Tab 一次叠加 `safe-area-inset-bottom`
  - iOS PWA 顶部：避免 safe-area 与系统状态栏双重留白（`html.is-ios-pwa` 等 CSS）
  - 竖屏、触控友好的表单与裁剪层

---

# 当前已知问题

依据代码注释、实现缺口与近期 commit 历史整理：

1. **打卡识图仍为占位**  
   有照片时的衣物匹配为随机选取（`simulateMatch`），非真实 AI 识衣。注释写明真实识图属 V2。

2. **Manifest 文案过时**  
   `description` 仍写「本地存储…数据不上云」，与当前云端同步事实不符。

3. **原图不持久化**  
   裁剪原图仅存在表单会话；关闭后无法还原「裁剪前原图」，只能基于当前入库图再裁。

4. **部分云端资源无对应 UI**  
   如 `outfit` 文档有同步、界面无独立管理入口。

5. **资料字段冗余**  
   `profile` 默认中有部分字段在设置页无完整编辑入口（如部分理想风格/关注点等）→ **需要确认是否故意预留**。

6. **依赖残留**  
   `package.json` 含 `@supabase/supabase-js`，`src/` 中未见使用。

7. **React 脚手架未作为主应用**  
   `src/App.tsx` / `src/main.tsx` 存在，但产品入口是 `index.html` + wardrobe 模块。

8. **历史移动端问题（已修、需回归）**  
   iOS PWA 顶部双倍空白、底栏 safe-area、分析页日期布局、PWA 缓存更新等已有多轮修复；发版后仍建议真机回归。

9. **Worker / D1 / R2 细节不在本仓**  
   AI 模型名、配额、鉴权、库表等以线上 Worker 为准 → **需要确认**。

---

# 下一版本规划建议

（仅记录，不改代码）

1. **打卡 AI 识衣（优先）**  
   替换随机匹配：上传穿搭照 → 视觉识别/检索衣橱 → 用户确认后入库打卡。注意与现有 `/ai/vision`、裁剪/编辑能力复用。

2. **产品文案与 Manifest**  
   更新「数据不上云」等过时描述；统一产品版本号展示（文档 `v1.0.0` vs Git tag `v1.3.0`）。

3. **图片原图策略（可选）**  
   若需反复精修，评估是否在不破坏现有 `notes`/`photo_url` 的前提下保存 `photoOriginal`（会涉及 API/存储约定）。

4. **离线与同步体验**  
   明确离线可读范围；队列失败提示与冲突策略。

5. **清理**  
   未使用依赖、死代码路径、无 UI 的 `outfit` 资源策略（做功能或文档标明预留）。

6. **回归清单**  
   iOS/Android PWA 安装、顶部/底部安全区、AI 订单多件选择、通用裁剪、入库与导出。

---

# 附录：仓库结构速览（本版本）

| 路径 | 作用 |
|------|------|
| `index.html` | 应用壳、样式、Tab、PWA meta |
| `src/wardrobe/app.ts` | 主业务 UI 与 AI/裁剪/打卡逻辑 |
| `src/wardrobe/external.ts` | 天气、AI vision 调用 |
| `src/wardrobe/pwa.ts` | Service Worker 注册与更新 |
| `src/wardrobe/main.ts` | 前端入口 |
| `src/stores/dataStore.ts` | 云端数据存储层 |
| `src/utils/request.ts` | API 与离线队列 |
| `public/manifest.webmanifest` / `public/sw.js` | PWA |
| `dist/` | 生产构建产物（仓库跟踪） |
| `scripts/` | AI/订单相关测试脚本（非运行时） |
| `docs/product/` | 产品版本文档（本文件所在目录） |
| `docs/versions/` | 版本迭代记录 |
| `docs/roadmap/` | 未来规划 |

**回滚本产品版本（Git）：**

```bash
git fetch origin tag v1.3.0-stable
git checkout v1.3.0-stable
# 或重置 main（需明确确认后再 push）
git checkout main && git reset --hard v1.3.0-stable
```
