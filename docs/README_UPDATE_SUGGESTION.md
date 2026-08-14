# README 更新建议（未改根目录 README）

当前仓库根目录**没有** `README.md`。建议新增一份面向协作者的 README，结构如下（可直接复制后按需删减）。

---

## 建议的根目录 README 大纲

```markdown
# 个人智能穿搭衣橱

简短产品定位（1–2 句）。

## 在线地址
- 生产：https://wardrobe-app-lilac.vercel.app
- API：https://wardrobe-api.yyyunniee.workers.dev

## 本地开发
- Node / npm 版本要求（需要确认）
- npm install
- npm run dev
- npm run build

## 仓库结构
- src/          前端业务（wardrobe / stores / utils）
- public/       PWA 静态资源
- docs/product/ 产品与版本说明
- docs/versions/版本迭代记录
- docs/roadmap/ 未来规划
- scripts/      开发辅助脚本
- notes/        临时笔记（可清理）

## 版本与回滚
- 产品首版说明：docs/product/PRODUCT_VERSION_v1.0.0.md
- 稳定 tag：v1.3.0-stable → commit 685ad99
- 版本记录模板：docs/versions/VERSION_TEMPLATE.md

## 部署
- 前端：push main → Vercel
- Worker：本仓库不含 Worker 源码（需要确认部署仓库路径）
```

---

## 日常如何维护目录

| 目录 | 何时更新 | 注意 |
|------|----------|------|
| `docs/product/` | 产品能力大改、里程碑说明 | 可保留 `PRODUCT_VERSION_v*.md` 快照 |
| `docs/versions/` | 每次正式发版 | 复制 `VERSION_TEMPLATE.md` 填好；与 Git tag 对齐 |
| `docs/roadmap/` | 规划变更时 | 只写计划，不替代版本记录 |
| `scripts/` | 测试/工具脚本 | 勿放密钥；勿当运行时依赖 |
| `notes/` | 临时排查 | 结论成熟后迁到 docs，过期可删 |
| `src/` `public/` 等 | 业务迭代 | 发版前 `npm run build`；PWA 注意 sw 缓存 |

## 发版检查清单（建议写进 README）

1. 工作区干净，`main` 已推送  
2. 更新 / 新增 `docs/versions/vX.Y.Z.md`  
3. 打 Git tag 并 `git push origin <tag>`  
4. 确认 Vercel Production  
5. 真机 PWA 强刷或重装图标  

---

如需我把上述内容写入根目录 `README.md`，请再说一声即可。
