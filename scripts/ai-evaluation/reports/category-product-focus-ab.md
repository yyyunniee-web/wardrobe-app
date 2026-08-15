# category product-focus A/B

- dataset: `datasets/wardrobe-entry`（8，单次）
- A hierarchy: `prompts/category-hierarchy-exp.txt` (`ab09f90a896f`)
- B product-focus: `prompts/category-product-focus-exp.txt` (`85b0ed298888`)
- 生产代码未改

## category accuracy

| arm | exact | accuracy |
|-----|-------|----------|
| A | 4/8 | **50%** |
| B | 8/8 | **100%** |

Δ (B−A) = **+50** pp

## Focus: bra_*

| id | gold | A | B | A ok | B ok |
|----|------|---|---|------|------|
| bra_002 | 内衣 | 内衣 | 内衣 | yes | yes |
| bra_red | 内衣 | 裙装 | 内衣 | no | yes |
| bra_yoga_001 | 内衣 | 内衣 | 内衣 | yes | yes |

## 其他类别是否退化（非 bra_*）

| id | gold | A | B | regress? |
|----|------|---|---|----------|
| basic-house-001 | 连衣裙 | 裙装 | 连衣裙 | no |
| order_multi_refund_001 | 上衣 | 上衣 | 上衣 | no |
| pants_gray | 裤装 | (解析失败) | 裤装 | no |
| shoes_gold_wedding | 鞋 | 鞋 | 鞋 | no |
| shorts_001 | 裤装 | (解析失败) | 裤装 | no |

非 bra 退化数: **0**

## confusion matrix

### A

| gold \ pred | (解析失败) | 上衣 | 内衣 | 裙装 | 裤装 | 连衣裙 | 鞋 |
|---|---|---|---|---|---|---|---|
| 上衣 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 内衣 | 0 | 0 | 2 | 1 | 0 | 0 | 0 |
| 裤装 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| 连衣裙 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| 鞋 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

### B

| gold \ pred | 上衣 | 内衣 | 裤装 | 连衣裙 | 鞋 |
|---|---|---|---|---|---|
| 上衣 | 1 | 0 | 0 | 0 | 0 |
| 内衣 | 0 | 3 | 0 | 0 | 0 |
| 裤装 | 0 | 0 | 2 | 0 | 0 |
| 连衣裙 | 0 | 0 | 0 | 1 | 0 |
| 鞋 | 0 | 0 | 0 | 0 | 1 |

## all predictions

| id | gold | A | B |
|----|------|---|---|
| basic-house-001 | 连衣裙 | 裙装 | 连衣裙 |
| bra_002 | 内衣 | 内衣 | 内衣 |
| bra_red | 内衣 | 裙装 | 内衣 |
| bra_yoga_001 | 内衣 | 内衣 | 内衣 |
| order_multi_refund_001 | 上衣 | 上衣 | 上衣 |
| pants_gray | 裤装 | (解析失败) | 裤装 |
| shoes_gold_wedding | 鞋 | 鞋 | 鞋 |
| shorts_001 | 裤装 | (解析失败) | 裤装 |
