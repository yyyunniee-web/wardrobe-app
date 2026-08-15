# Beta2.1 merge isolation

验证：**最小增量规则**（生产原文 + 三条 product-focus + OCR date）是否导致 color/price 退化。

## Setup

- **runId:** `20260815-002522-beta21`
- **dataset:** `datasets/wardrobe-entry`（8）
- **A Beta1:** 生产 `AI_PROMPT` Vision-only (`1a9a9f12d33b`)
- **B Beta2.1:** 生产 `AI_PROMPT` + 三条商品主体优先规则 + OCR `purchaseDate` merge (`905d3d600f0c`)
- **不用** `category-product-focus-exp.txt` 全文
- **不改** category hierarchy 其它规则；**不改** `src/**`

### B 追加的三条规则

```
【category 商品主体优先·最小增量】
1. category 判断以商品本体为准，不以模特穿搭、场景、搭配物为准。
2. 文胸 / bra / 内衣 / 胸衣 / 运动内衣必须归类为「内衣」。
3. 即使模特穿着环境出现裙子、裤子，也不能改变商品主体 category。
```

## Metrics（usable = exact + format_mismatch + semantic_match）

| 指标 | A Beta1 | B Beta2.1 | Δ | color/price gate |
|------|---------|-----------|---|------------------|
| category | 50% (4/8) | 87.5% (7/8) | +37.5 | — |
| color | 37.5% (3/8) | 25% (2/8) | -12.5 | FAIL ↓ |
| price | 62.5% (5/8) | 75% (6/8) | +12.5 | PASS |
| purchaseDate | 14.3% (1/7) | 100% (7/7) | +85.7 | — |
| parse | 100% (8/8) | 100% (8/8) | +0 | — |

## Gate: color/price 不允许下降

- color: **FAIL**
- price: **PASS**
- overall gate: **FAIL**

## bra_* category

| id | gold | A | B |
|----|------|---|---|
| bra_002 | 内衣 | 上衣 | 内衣 |
| bra_red | 内衣 | (空) | 内衣 |
| bra_yoga_001 | 内衣 | 上衣 | 内衣 |

## purchaseDate

| id | gold | A | B (OCR) |
|----|------|---|----------|
| basic-house-001 | 2024-12-15 | (空) | 2024-12-15 |
| bra_002 | 2025-05-25 | (空) | 2025-05-25 |
| bra_red | 2025-06-22 | 2025年6月22日 | 2025-06-22 |
| bra_yoga_001 | 2025-09-23 | (空) | 2025-09-23 |
| order_multi_refund_001 | (空) | (空) | (空) |
| pants_gray | 2025-12-13 | (空) | 2025-12-13 |
| shoes_gold_wedding | 2025-05-14 | (空) | 2025-05-14 |
| shorts_001 | 2025-09-23 | (空) | 2025-09-23 |

## color / price 逐案（退化检查）

| id | color A→B | price A→B | color regress | price regress |
|----|-----------|-----------|---------------|---------------|
| basic-house-001 | 黑 → 黑 | ¥360.44 → ¥360.44 | no | no |
| bra_002 | 其他 → (空) | ¥72.27 → ¥72.27 | no | no |
| bra_red | 酒红 → 酒红 | ¥24.99 → ¥24.99 | no | no |
| bra_yoga_001 | 黑 → 黑 | ¥129 → ¥129 | no | no |
| order_multi_refund_001 | 灰 → (空) | ¥109.12 → ¥109.12 | YES | no |
| pants_gray | 灰 → 灰 | ¥199 → ¥199 | no | no |
| shoes_gold_wedding | 金 → (空) | ¥599 → ¥599 | no | no |
| shorts_001 | 黑 → 黑 | ¥79 → ¥63 | no | no |

## all predictions

| id | gold.cat | A cat/color/price/date | B cat/color/price/date |
|----|----------|------------------------|------------------------|
| basic-house-001 | 连衣裙 | 裙装 / 黑 / ¥360.44 / (空) | 裙装 / 黑 / ¥360.44 / 2024-12-15 |
| bra_002 | 内衣 | 上衣 / 其他 / ¥72.27 / (空) | 内衣 / (空) / ¥72.27 / 2025-05-25 |
| bra_red | 内衣 | (空) / 酒红 / ¥24.99 / 2025年6月22日 | 内衣 / 酒红 / ¥24.99 / 2025-06-22 |
| bra_yoga_001 | 内衣 | 上衣 / 黑 / ¥129 / (空) | 内衣 / 黑 / ¥129 / 2025-09-23 |
| order_multi_refund_001 | 上衣 | 上衣 / 灰 / ¥109.12 / (空) | 上衣 / (空) / ¥109.12 / (空) |
| pants_gray | 裤装 | 裤装 / 灰 / ¥199 / (空) | 裤装 / 灰 / ¥199 / 2025-12-13 |
| shoes_gold_wedding | 鞋 | 鞋 / 金 / ¥599 / (空) | 鞋 / (空) / ¥599 / 2025-05-14 |
| shorts_001 | 裤装 | 裤装 / 黑 / ¥79 / (空) | 裤装 / 黑 / ¥63 / 2025-09-23 |
