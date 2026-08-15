# purchaseDate → season 规则评估

- **输入:** `datasets/image-recognition/labels/*.json` 的 `purchaseDate`
- **不调用** Vision / OCR / Worker
- **不改** 生产代码

## 规则

| 月份 | season |
|------|--------|
| 12, 1, 2 | 冬 |
| 3, 4, 5 | 春 |
| 6, 7, 8 | 夏 |
| 9, 10, 11 | 秋 |

## 结果

| case | purchaseDate | calculatedSeason | label season | diff |
|------|--------------|------------------|--------------|------|
| bra_001 | 2025-12-09 | 冬 | 夏 | `mismatch` |
| shoes-001 | 2026-04-20 | 春 | 夏 | `mismatch` |
| shorts001 | 2025-10-14 | 秋 | 全年 | `mismatch` |
| tshirt_001 | 2025-05-11 | 春 | 夏 | `mismatch` |

## 汇总

- match: **0**
- mismatch: **4**
- missing_label: **0**
- invalid_date: **0**

## 产品预期备注

- 若 label `season` 为「全年」或人工季节判断（非购买月映射），会出现 `mismatch`，属预期差异，不代表日期解析错误。
- 本规则仅评估「购买月份 → 默认季节」是否可作入库默认值；最终是否覆盖用户/AI 季节需产品另定。
