# Beta2.2 local smoke

- promptVersion beta2: `742bfba9253e`
- source: production AI_PROMPT + aiBeta22 patches + OCR merge
- category: **7/8**
- purchaseDate (OCR): **7/7**

| id | gold cat | pred cat | ok | gold date | OCR date | ok |
|----|----------|----------|----|-----------|----------|----|
| basic-house-001 | 连衣裙 | 裙装 | no | 2024-12-15 | 2024-12-15 | yes |
| bra_002 | 内衣 | 内衣 | yes | 2025-05-25 | 2025-05-25 | yes |
| bra_red | 内衣 | 内衣 | yes | 2025-06-22 | 2025-06-22 | yes |
| bra_yoga_001 | 内衣 | 内衣 | yes | 2025-09-23 | 2025-09-23 | yes |
| order_multi_refund_001 | 上衣 | 上衣 | yes | (空) | (空) | — |
| pants_gray | 裤装 | 裤装 | yes | 2025-12-13 | 2025-12-13 | yes |
| shoes_gold_wedding | 鞋 | 鞋 | yes | 2025-05-14 | 2025-05-14 | yes |
| shorts_001 | 裤装 | 裤装 | yes | 2025-09-23 | 2025-09-23 | yes |

UI 手动验证：`npm run dev` → 设置页切换 Beta2.2 → 上传订单截图核对 category / 购买日期 / 保存。
