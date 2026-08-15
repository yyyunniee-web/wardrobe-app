# Beta2.2 color isolation

基于 Beta2.1，**仅追加**字段独立性约束；不改既有 category 三条规则；OCR merge 不变。

## Setup

- **runId:** `20260815-002955-beta22`
- **dataset:** `datasets/wardrobe-entry`（8）
- **A Beta2.1:** prod + product-focus×3 + OCR (`905d3d600f0c`)
- **B Beta2.2:** Beta2.1 + 字段独立性×3 + OCR (`742bfba9253e`)
- **不改** `src/**`

### B 追加规则

```
【字段独立性·最小增量】
1. category 判断规则只影响 category 字段，不得改变或清空 color / price 等其它字段。
2. color 必须独立识别商品实际颜色（商品本体主色），与 category 判定解耦。
3. 如果图片中有明确颜色信息（色名文案或可见主色），不允许因为 category 判断而跳过 color；应填写 color。
```

## Metrics

| 指标 | A Beta2.1 | B Beta2.2 | Δ | gate |
|------|-----------|-----------|---|------|
| category | 75% (6/8) | 87.5% (7/8) | +12.5 | PASS ≥2.1 |
| color | 25% (2/8) | 37.5% (3/8) | +12.5 | RECOVER ↑ |
| price | 75% (6/8) | 62.5% (5/8) | -12.5 | FAIL ↓ |
| purchaseDate | 100% (7/7) | 100% (7/7) | +0 | OCR |
| parse | 100% (8/8) | 100% (8/8) | +0 | — |

## Gates

- color 是否恢复（B > A）: **YES** (25% → 37.5%)
- category 保持 ≥ Beta2.1: **PASS** (75% → 87.5%)
- price 保持 ≥ Beta2.1: **FAIL** (75% → 62.5%)

## color 逐案

| id | gold | A | B | A usable | B usable |
|----|------|---|---|----------|----------|
| basic-house-001 | 黑珍珠 | 黑 | 黑 | no | no |
| bra_002 | 香槟色 | (空) | 其他 | no | no |
| bra_red | 暗红 | 酒红 | 酒红 | no | no |
| bra_yoga_001 | 黑色 | (空) | 黑 | no | yes |
| order_multi_refund_001 | 灰色 | 灰 | 灰 | yes | yes |
| pants_gray | 浅灰色 | 灰 | 灰 | no | no |
| shoes_gold_wedding | 金色 | 金 | 金 | no | no |
| shorts_001 | 黑色 | 黑 | 黑 | yes | yes |

## category / price 逐案

| id | gold.cat | A cat | B cat | A price | B price |
|----|----------|-------|-------|---------|---------|
| basic-house-001 | 连衣裙 | 裙装 | 裙装 | ¥360.44 | ¥360.44 |
| bra_002 | 内衣 | 内衣 | 内衣 | ¥72.27 | ¥72.27 |
| bra_red | 内衣 | 上衣 | 内衣 | ¥24.99 | ¥24.99 |
| bra_yoga_001 | 内衣 | 内衣 | 内衣 | ¥129 | ¥129 |
| order_multi_refund_001 | 上衣 | 上衣 | 上衣 | ¥109.12 | ¥109.12 |
| pants_gray | 裤装 | 裤装 | 裤装 | ¥199 | ¥199 |
| shoes_gold_wedding | 鞋 | 鞋 | 鞋 | ¥599 | ¥599 |
| shorts_001 | 裤装 | 裤装 | 裤装 | ¥63 | ¥79 |
