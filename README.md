# 个人智能穿搭衣橱

## 产品介绍

- **项目名称**：个人智能穿搭衣橱（短名：穿搭衣橱）
- **产品定位**：面向个人用户的移动端优先穿搭衣橱 Web App（PWA）。支持衣物管理、AI 订单截图录入、图片裁剪编辑、心情与穿搭打卡、穿着分析；数据经 Cloudflare Worker 云端同步。
- **当前稳定版本**：产品版 `v1.0.0-stable`

## 当前版本

| 项 | 值 |
|----|-----|
| 产品版本 | `v1.0.0-stable`（第一个正式产品版本） |
| Git tag | `v1.3.0-stable` |
| Git commit | `685ad99`（`685ad99ef47c51a272310f055a36ec5b0a59bccf`） |
| 生产地址 | https://wardrobe-app-lilac.vercel.app |
| API | https://wardrobe-api.yyyunniee.workers.dev |

> 产品文档版本号与 Git tag 名称不同，但指向**同一 commit**。详见 [产品版本文档](docs/product/PRODUCT_VERSION_v1.0.0.md)。

## 功能概览

摘自 `docs/product/PRODUCT_VERSION_v1.0.0.md`：

- **衣橱管理**：添加 / 编辑 / 删除、淘汰与恢复、品类浏览与排序、导出与备份
- **AI 订单识别**：订单截图解析预填（名称、价格、日期、品类等）；多商品选择；用户无需填写 API Key（Worker AI Proxy）
- **图片上传 / 裁剪**：云端上传；AI 订单自动裁剪；通用手动裁剪与「裁剪 / 重传 / 取消」编辑入口
- **打卡**：穿搭打卡（拍照或手动选衣）、心情打卡、穿搭日记；打卡识衣匹配仍为占位（后续版本）
- **今日页**：天气、穿衣提示、黄历宜忌、日记与推荐入口
- **分析**：购入区间与标签筛选、穿着 Top、闲置与价值交叉等
- **PWA**：可安装 standalone、Service Worker 壳缓存、移动端安全区适配

## 文档入口

| 目录 | 说明 |
|------|------|
| [docs/product/](docs/product/) | 产品能力与版本说明 |
| [docs/versions/](docs/versions/) | 各版本迭代发布记录 |
| [docs/roadmap/](docs/roadmap/) | 未来功能规划 |
| [docs/DEVELOPMENT_FLOW.md](docs/DEVELOPMENT_FLOW.md) | 标准开发与发版流程 |
| [notes/](notes/) | 临时开发笔记（非正式文档） |

## 开发方式

1. **开发新功能前**：从当前稳定版本出发（`v1.0.0-stable` / tag `v1.3.0-stable`），避免在未记录的脏改动上叠加。
2. **开发完成**：更新版本文档（`docs/versions/`，必要时同步 `docs/product/`、`docs/roadmap/`）。
3. **测试完成**：创建并推送 Git tag；确认 Vercel Production；真机回归 PWA。

本地常用命令：

```bash
npm install
npm run dev
npm run build
```

Worker 后端源码不在本仓库，仅通过 HTTP API 对接。
