# category regression eval

目标：改善 category 误判；重点验证 **内衣是否被错误识别为裤装**。

## Setup

- **runId:** `20260815-000441-category-regression`
- **dataset:** `datasets/wardrobe-entry`（8 配对样本）
- **repeats:** 同图 5 次 / arm
- **A:** 生产 `AI_PROMPT`（`src/wardrobe/app.ts#AI_PROMPT`, version=`1a9a9f12d33b`）
- **B:** category hierarchy 约束 prompt（`prompts/category-hierarchy-exp.txt`, version=`ab09f90a896f`）
- **生产代码 / 生产 prompt:** 未修改
- **purchaseDate:** 本实验不关注（已暂停）

### 已知根因假设

生产 prompt 的 category 枚举为【上衣,裤装,裙装,连衣裙,外套,鞋,包,配饰】——**不含「内衣」**；UI `CATEGORIES` 含「内衣」。B 补齐枚举并加入内衣≠裤装层级规则。

## Verdict（重点）

### 1. category accuracy（exact，相对 gold；分母=labeled×repeats）

| arm | exact | labeled trials | accuracy | parseOk |
|-----|-------|----------------|----------|---------|
| A 生产 | 20/40 | 40 | **50%** | 38/40 |
| B hierarchy | 26/40 | 40 | **65%** | 32/40 |

Δ accuracy (B−A) = **+15** pp

### 2. 内衣 → 裤装 错误次数

| arm | 内衣→裤装 (across all repeats) |
|-----|-------------------------------|
| A | **0** |
| B | **0** |

内衣 gold 样本: `bra_002`, `bra_red`, `bra_yoga_001`

### 3. 同图 5 次稳定性

稳定定义: 5 次预测 category **完全一致**且非空/非失败 → `stable5`; 另报告 mode 占比。

| id | gold | A preds (r1..r5) | A stable5 | A mode | B preds | B stable5 | B mode |
|----|------|------------------|-----------|--------|---------|-----------|--------|
| basic-house-001 | 连衣裙 | 裙装 / 裙装 / 裙装 / 裙装 / 裙装 | yes | 裙装 (5/5) | 裙装 / 裙装 / 裙装 / (解析失败) / 裙装 | no | 裙装 (4/5) |
| bra_002 | 内衣 | 上衣 / 上衣 / 上衣 / 上衣 / 上衣 | yes | 上衣 (5/5) | (解析失败) / 内衣 / 内衣 / 内衣 / 内衣 | no | 内衣 (4/5) |
| bra_red | 内衣 | 上衣 / 上衣 / (解析失败) / (空) / 上衣 | no | 上衣 (3/5) | 裙装 / 上衣 / (解析失败) / (解析失败) / (解析失败) | no | (解析失败) (3/5) |
| bra_yoga_001 | 内衣 | 上衣 / 上衣 / 上衣 / 内衣 / 上衣 | no | 上衣 (4/5) | 内衣 / (解析失败) / 内衣 / 内衣 / 内衣 | no | 内衣 (4/5) |
| order_multi_refund_001 | 上衣 | 上衣 / 上衣 / 上衣 / 上衣 / 上衣 | yes | 上衣 (5/5) | 上衣 / 上衣 / 上衣 / 上衣 / 上衣 | yes | 上衣 (5/5) |
| pants_gray | 裤装 | 裤装 / 裤装 / 裤装 / 裤装 / 裤装 | yes | 裤装 (5/5) | 裤装 / 裤装 / (解析失败) / 裤装 / 裤装 | no | 裤装 (4/5) |
| shoes_gold_wedding | 鞋 | 鞋 / 鞋 / 鞋 / 鞋 / 鞋 | yes | 鞋 (5/5) | 鞋 / 鞋 / 鞋 / 鞋 / 鞋 | yes | 鞋 (5/5) |
| shorts_001 | 裤装 | 裤装 / 裤装 / (解析失败) / 裤装 / 裤装 | no | 裤装 (4/5) | 裤装 / 裤装 / 裤装 / (解析失败) / 裤装 | no | 裤装 (4/5) |

stable5 cases: A **5/8** · B **2/8**

## Confusion matrix（所有 repeats 合计）

### A — 生产 AI_PROMPT

| gold \ pred | 上衣 | 裤装 | 裙装 | 连衣裙 | 鞋 | 内衣 | (空) | (解析失败) |
|---|---|---|---|---|---|---|---|---|
| 上衣 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 内衣 | 12 | 0 | 0 | 0 | 0 | 1 | 1 | 1 |
| 裤装 | 0 | 9 | 0 | 0 | 0 | 0 | 0 | 1 |
| 连衣裙 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 |
| 鞋 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 |

### B — category hierarchy

| gold \ pred | 上衣 | 裤装 | 裙装 | 连衣裙 | 鞋 | 内衣 | (解析失败) |
|---|---|---|---|---|---|---|---|
| 上衣 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| 内衣 | 1 | 0 | 1 | 0 | 0 | 8 | 5 |
| 裤装 | 0 | 8 | 0 | 0 | 0 | 0 | 2 |
| 连衣裙 | 0 | 0 | 4 | 0 | 0 | 0 | 1 |
| 鞋 | 0 | 0 | 0 | 0 | 5 | 0 | 0 |

## Per-case exact rate

| id | gold | A exact/5 | B exact/5 | A 内衣→裤装 | B 内衣→裤装 |
|----|------|-----------|-----------|-------------|-------------|
| basic-house-001 | 连衣裙 | 0/5 | 0/5 | 0 | 0 |
| bra_002 | 内衣 | 0/5 | 4/5 | 0 | 0 |
| bra_red | 内衣 | 0/5 | 0/5 | 0 | 0 |
| bra_yoga_001 | 内衣 | 1/5 | 4/5 | 0 | 0 |
| order_multi_refund_001 | 上衣 | 5/5 | 5/5 | 0 | 0 |
| pants_gray | 裤装 | 5/5 | 4/5 | 0 | 0 |
| shoes_gold_wedding | 鞋 | 5/5 | 5/5 | 0 | 0 |
| shorts_001 | 裤装 | 4/5 | 4/5 | 0 | 0 |

## Method notes

- 每图每 arm 上传一次，再连续调用 Vision 5 次（同 `imageUrl`）。
- category 取自 `items[0].category`，否则顶层 `category`。
- accuracy 分母含全部 labeled trials（含解析失败，计为未命中）。
- B 仅评测用 prompt 文件；未写入 `src/wardrobe/app.ts`。
