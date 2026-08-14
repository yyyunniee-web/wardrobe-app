# AI Evaluation Framework（MVP）

人工准备测试数据 → 调用线上同源 Worker `POST /ai/vision` → 保存原始结果 → 生成报告（人工评价）。

## 本阶段范围

- **已实现：** `image-recognition`
- **目录占位：** `checkin-matching`、`outfit-recommendation`（暂不跑）

## 禁止

- 修改 `src/**`、Worker、DB、生产 AI 流程
- 直连智谱 Key / 绕过 Worker
- 自动采集线上用户图片

## 数据约定（image-recognition）

```text
datasets/image-recognition/
  images/shirt001.jpg    # 可选本地图
  labels/shirt001.json   # 必填人工标准
```

`labels/shirt001.json` 示例：

```json
{
  "category": "衬衫",
  "color": "白色",
  "brand": "优衣库",
  "season": "春夏"
}
```

图片来源（推荐本地）：

1. **优先** 放入同名 `images/<id>.jpg|png|webp` → 脚本调用 Worker `/upload-image` 得到 R2 URL（与线上一致）
2. 或在 label 填 `imageUrl`（须为 Worker/智谱可拉取的 URL；任意外链常失败）

本地 `images/*` 已 gitignore，请人工放入测试图，勿自动抓用户数据。

## 运行

```bash
# 可选：覆盖 API
export AI_EVAL_API_BASE=https://wardrobe-api.yyyunniee.workers.dev

npm run ai:test
```

产物：

- `reports/raw/<runId>/` — 每案原始 AI text + meta JSON
- `reports/latest-report.md` — 汇总报告（含人工评价栏）
- `reports/latest-run.json` — 机器可读摘要

仅根据已有 raw 重生成报告：

```bash
npm run ai:report
```

## 闭环

测试数据 → AI 运行 → 报告 → 人工评价 → 改 Prompt/模型（业务侧另 PR）→ 再测
