# wardrobe-entry evaluation — baseline(v1) vs current(v2)

- **baseline runId:** `20260814-233808-baseline` — Vision-only
- **current runId:** `20260814-233939-current` — Vision + OCR(purchaseDate)

## 字段 usable% 对比

| 字段 | baseline v1 | current v2 | Δ |
|------|-------------|------------|---|
| name | 0% (0/8) | 12.5% (1/8) | +12.5 |
| category | 50% (4/8) | 37.5% (3/8) | -12.5 |
| color | 37.5% (3/8) | 25% (2/8) | -12.5 |
| price | 62.5% (5/8) | 62.5% (5/8) | +0 |
| purchaseDate | 0% (0/7) | 85.7% (6/7) | +85.7 |
| season | 0% (0/8) | 12.5% (1/8) | +12.5 |

## 分 case purchaseDate

| id | gold | v1 Vision | v2 OCR |
|----|------|-----------|--------|
| basic-house-001 | 2024-12-15 | (空) | 2024-12-15 |
| bra_002 | 2025-05-25 | (空) | 2025-05-25 |
| bra_red | 2025-06-22 | (空) | 2025-06-22 |
| bra_yoga_001 | 2025-09-23 | (空) | 2025-09-23 |
| order_multi_refund_001 | (空) | (空) | (空) |
| pants_gray | 2025-12-13 | (空) | 2025-12-13 |
| shoes_gold_wedding | 2025-05-14 | (空) | 2025-05-14 |
| shorts_001 | 2025-09-23 | (空) | 2025-09-23 |

详细报告: `wardrobe-entry-eval-baseline.md` / `wardrobe-entry-eval-current.md`
