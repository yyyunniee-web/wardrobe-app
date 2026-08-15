# wardrobe-entry dataset preflight report

- **生成时间:** 2026-08-14T15:32:34.939Z
- **category 枚举来源:** 产品下拉框（含「内衣」「其他」）
- **category 允许值:** 上衣 / 外套 / 裤装 / 裙装 / 连衣裙 / 鞋 / 包 / 配饰 / 内衣 / 其他
- **season 约定:** 春 / 夏 / 秋 / 冬 / 全年
- **price:** 必须为数字字符串（如 `"60.58"`），禁止 number
- **未运行** AI evaluation

## 总览

| 指标 | 数量 |
|------|------|
| 总图片数量 | **8** |
| 总 label 数量（不含跳过） | **8** |
| 跳过 TEMPLATE/example | **1**（TEMPLATE.json） |
| 配对成功 | **8** |
| 孤立图片 | **0** |
| 孤立 JSON | **0** |
| **通过** | **8** |
| **失败** | **0** |
| **是否可以开始正式 evaluation** | **是** |

## 1. 配对

全部图片与 label 一一对应，无孤立文件。

| 图片 | label |
|------|--------|
| `basic-house-001.jpg` | `basic-house-001.json` |
| `bra_002.jpg` | `bra_002.json` |
| `bra_red.jpg` | `bra_red.json` |
| `bra_yoga_001.jpg` | `bra_yoga_001.json` |
| `order_multi_refund_001.jpg` | `order_multi_refund_001.json` |
| `pants_gray.jpg` | `pants_gray.json` |
| `shoes_gold_wedding.jpg` | `shoes_gold_wedding.json` |
| `shorts_001.jpg` | `shorts_001.json` |

## 2–3. Label 校验

全部配对样本通过结构与字段校验。

### 通过列表

| id | category | season | price | purchaseDate |
|----|----------|--------|-------|--------------|
| basic-house-001 | 连衣裙 | 冬 | "360.44" | 2024-12-15 |
| bra_002 | 内衣 | 全年 | "72.27" | 2025-05-25 |
| bra_red | 内衣 | 全年 | "24.99" | 2025-06-22 |
| bra_yoga_001 | 内衣 | 全年 | "104.26" | 2025-09-23 |
| order_multi_refund_001 | 上衣 | 秋 | "109.12" | (空) |
| pants_gray | 裤装 | 冬 | "167.34" | 2025-12-13 |
| shoes_gold_wedding | 鞋 | 全年 | "599" | 2025-05-14 |
| shorts_001 | 裤装 | 夏 | "63" | 2025-09-23 |

## 4. TEMPLATE / example 与 runner

- 跳过名单: `TEMPLATE.json`, `example.json`（preflight 与未来 wardrobe-entry runner 均应忽略）
- 现有 `listImageRecognitionCases()` 只读 `image-recognition`，不会误读本目录

## 5. 结论

**Preflight 通过，可以开始正式 wardrobe-entry evaluation。**
