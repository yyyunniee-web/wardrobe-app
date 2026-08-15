# Beta2.2 performance smoke

自动跑 `datasets/wardrobe-entry` 8 张素材；**不改生产逻辑 / 不改 prompt / 不改 accuracy 评测**。

## Setup

- **runId:** `20260815-151518-perf`
- **apiBase:** `https://wardrobe-api.yyyunniee.workers.dev`
- **prompt:** 生产 AI_PROMPT + Beta2.2 最小增量 (`742bfba9253e`)
- **OCR:** 本机 `vision-ocr` + 评测日期规则；**timeout=12000ms**（对齐生产）
- **时序:** upload → Vision → OCR（模拟生产 P0：OCR 不挡表单，但仍计入 pipeline 完成）

## Summary metrics

| 指标 | 值 |
|------|----|
| cases | 8 |
| pipeline 平均耗时 | **10022.8 ms** |
| pipeline P50 | **9254 ms** |
| pipeline P95 | **12664 ms** |
| Vision 平均 | 8259.9 ms |
| Vision P50 / P95 | 7489 / 11470 ms |
| upload 平均 | 973.3 ms |
| OCR 平均 | 784.5 ms |
| OCR 成功率 (抽到日期) | **7/8** (87.5%) |
| OCR timeout 数量 | **0** |
| OCR fail / empty | 0 / 1 |
| Vision ok / parse ok | 8/8 / 8/8 |

## Per-case

| case | upload ms | Vision start | Vision end | Vision ms | OCR start | OCR end | OCR ms | OCR | pipeline ms | category | purchaseDate |
|------|-----------|--------------|------------|-----------|-----------|---------|--------|-----|-------------|----------|--------------|
| basic-house-001 | 1530 | +1530 | +11540 | 10010 | +11540 | +12655 | 1114 | success | **12655** | 裙装 | 2024-12-15 |
| bra_002 | 1129 | +1129 | +7529 | 6400 | +7530 | +8250 | 720 | success | **8250** | 内衣 | 2025-05-25 |
| bra_red | 701 | +701 | +8630 | 7929 | +8630 | +9254 | 624 | success | **9254** | 内衣 | 2025-06-22 |
| bra_yoga_001 | 1370 | +1370 | +9991 | 8621 | +9992 | +10794 | 802 | success | **10794** | 内衣 | 2025-09-23 |
| order_multi_refund_001 | 494 | +494 | +11964 | 11470 | +11964 | +12664 | 699 | empty | **12664** | 上衣 | (空) |
| pants_gray | 526 | +526 | +8006 | 7480 | +8006 | +8804 | 798 | success | **8804** | 裤装 | 2025-12-13 |
| shoes_gold_wedding | 655 | +655 | +7335 | 6680 | +7371 | +8170 | 798 | success | **8170** | 鞋 | 2025-05-14 |
| shorts_001 | 1381 | +1381 | +8870 | 7489 | +8870 | +9591 | 721 | success | **9591** | 裤装 | 2025-09-23 |

时间列：`+N` 为相对该 case 开始（ms）；`pipeline ms` = OCR 结束相对 case 开始（Vision 已先完成）。

## Stability note

- 本轮无 OCR timeout，Vision 全部返回，单案 pipeline ≤60s → **本轮表现稳定**。
