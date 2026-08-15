# Beta2 candidate final regression

组合既有候选能力（**不新增规则 / 不继续调 prompt**）。

## Setup

- **runId:** `20260815-002018-beta2-final`
- **dataset:** `datasets/wardrobe-entry`（8）
- **A Beta1 线上:** 生产 `AI_PROMPT` Vision-only (`1a9a9f12d33b`)
- **B Beta2 candidate:** `prompts/category-product-focus-exp.txt`（hierarchy + product-focus）+ OCR `purchaseDate` merge (`85b0ed298888`)
- **生产 `src/**`:** 未修改

## Headline metrics（usable = exact + format_mismatch + semantic_match）

| 指标 | A Beta1 | B Beta2 | Δ |
|------|---------|---------|---|
| category accuracy | 50% (4/8) | 75% (6/8) | +25 |
| color accuracy | 25% (2/8) | 0% (0/8) | -25 |
| price accuracy | 75% (6/8) | 37.5% (3/8) | -37.5 |
| purchaseDate accuracy | 14.3% (1/7) | 100% (7/7) | +85.7 |
| season accuracy | 12.5% (1/8) | 12.5% (1/8) | +0 |
| parse success | 100% (8/8) | 100% (8/8) | +0 |

## Focus: bra_* category

| id | gold | A | B | A ok | B ok |
|----|------|---|---|------|------|
| bra_002 | 内衣 | 上衣 | 内衣 | no | yes |
| bra_red | 内衣 | 裙装 | 上衣 | no | no |
| bra_yoga_001 | 内衣 | 上衣 | 内衣 | no | yes |

bra_* 全部正确 (B): **NO** (2/3)

## Focus: purchaseDate（OCR 提升是否保持）

| id | gold | A Vision | B OCR-merge | A usable | B usable |
|----|------|----------|-------------|----------|----------|
| basic-house-001 | 2024-12-15 | (空) | 2024-12-15 | no | yes |
| bra_002 | 2025-05-25 | (空) | 2025-05-25 | no | yes |
| bra_red | 2025-06-22 | 2025年6月22日 | 2025-06-22 | yes | yes |
| bra_yoga_001 | 2025-09-23 | (空) | 2025-09-23 | no | yes |
| order_multi_refund_001 | (空) | (空) | (空) | — | — |
| pants_gray | 2025-12-13 | (空) | 2025-12-13 | no | yes |
| shoes_gold_wedding | 2025-05-14 | (空) | 2025-05-14 | no | yes |
| shorts_001 | 2025-09-23 | (空) | 2025-09-23 | no | yes |

## Focus: 新字段退化？

相对 A：B 在某 labeled 字段从 usable→不可用，计为退化。

| id | field | A status | B status | regress? |
|----|-------|----------|----------|----------|
| basic-house-001 | price | format_mismatch | value_mismatch | YES |
| order_multi_refund_001 | color | semantic_match | missing | YES |
| order_multi_refund_001 | price | format_mismatch | value_mismatch | YES |
| shorts_001 | color | semantic_match | missing | YES |
| shorts_001 | price | format_mismatch | value_mismatch | YES |

退化事件数: **5**

## Per-case predictions

### `basic-house-001`

```json
{
  "gold": {
    "category": "连衣裙",
    "color": "黑珍珠",
    "price": "360.44",
    "purchaseDate": "2024-12-15",
    "season": "冬"
  },
  "A": {
    "category": "裙装",
    "color": "黑",
    "price": "¥360.44",
    "purchaseDate": "",
    "season": "秋冬"
  },
  "B": {
    "category": "裙装",
    "color": "",
    "price": "¥399",
    "purchaseDate": "2024-12-15",
    "season": "",
    "_sources": {
      "category": "vision",
      "color": "vision",
      "price": "vision",
      "season": "vision",
      "purchaseDate": "ocr"
    },
    "ocr": "2024-12-15"
  },
  "statusA": {
    "category": "value_mismatch",
    "color": "value_mismatch",
    "price": "format_mismatch",
    "purchaseDate": "missing",
    "season": "value_mismatch"
  },
  "statusB": {
    "category": "value_mismatch",
    "color": "missing",
    "price": "value_mismatch",
    "purchaseDate": "exact",
    "season": "missing"
  },
  "parseOk": {
    "A": true,
    "B": true
  }
}
```

### `bra_002`

```json
{
  "gold": {
    "category": "内衣",
    "color": "香槟色",
    "price": "72.27",
    "purchaseDate": "2025-05-25",
    "season": "全年"
  },
  "A": {
    "category": "上衣",
    "color": "其他",
    "price": "¥72.27",
    "purchaseDate": "",
    "season": ""
  },
  "B": {
    "category": "内衣",
    "color": "",
    "price": "¥72.27",
    "purchaseDate": "2025-05-25",
    "season": "",
    "_sources": {
      "category": "vision",
      "color": "vision",
      "price": "vision",
      "season": "vision",
      "purchaseDate": "ocr"
    },
    "ocr": "2025-05-25"
  },
  "statusA": {
    "category": "value_mismatch",
    "color": "value_mismatch",
    "price": "format_mismatch",
    "purchaseDate": "missing",
    "season": "missing"
  },
  "statusB": {
    "category": "exact",
    "color": "missing",
    "price": "format_mismatch",
    "purchaseDate": "exact",
    "season": "missing"
  },
  "parseOk": {
    "A": true,
    "B": true
  }
}
```

### `bra_red`

```json
{
  "gold": {
    "category": "内衣",
    "color": "暗红",
    "price": "24.99",
    "purchaseDate": "2025-06-22",
    "season": "全年"
  },
  "A": {
    "category": "裙装",
    "color": "酒红",
    "price": "¥24.99",
    "purchaseDate": "2025年6月22日",
    "season": "夏"
  },
  "B": {
    "category": "上衣",
    "color": "",
    "price": "¥24.99",
    "purchaseDate": "2025-06-22",
    "season": "",
    "_sources": {
      "category": "vision",
      "color": "vision",
      "price": "vision",
      "season": "vision",
      "purchaseDate": "ocr"
    },
    "ocr": "2025-06-22"
  },
  "statusA": {
    "category": "value_mismatch",
    "color": "value_mismatch",
    "price": "format_mismatch",
    "purchaseDate": "format_mismatch",
    "season": "value_mismatch"
  },
  "statusB": {
    "category": "value_mismatch",
    "color": "missing",
    "price": "format_mismatch",
    "purchaseDate": "exact",
    "season": "missing"
  },
  "parseOk": {
    "A": true,
    "B": true
  }
}
```

### `bra_yoga_001`

```json
{
  "gold": {
    "category": "内衣",
    "color": "黑色",
    "price": "104.26",
    "purchaseDate": "2025-09-23",
    "season": "全年"
  },
  "A": {
    "category": "上衣",
    "color": "",
    "price": "¥129",
    "purchaseDate": "",
    "season": "春"
  },
  "B": {
    "category": "内衣",
    "color": "",
    "price": "¥129",
    "purchaseDate": "2025-09-23",
    "season": "",
    "_sources": {
      "category": "vision",
      "color": "vision",
      "price": "vision",
      "season": "vision",
      "purchaseDate": "ocr"
    },
    "ocr": "2025-09-23"
  },
  "statusA": {
    "category": "value_mismatch",
    "color": "missing",
    "price": "value_mismatch",
    "purchaseDate": "missing",
    "season": "value_mismatch"
  },
  "statusB": {
    "category": "exact",
    "color": "missing",
    "price": "value_mismatch",
    "purchaseDate": "exact",
    "season": "missing"
  },
  "parseOk": {
    "A": true,
    "B": true
  }
}
```

### `order_multi_refund_001`

```json
{
  "gold": {
    "category": "上衣",
    "color": "灰色",
    "price": "109.12",
    "purchaseDate": "",
    "season": "秋"
  },
  "A": {
    "category": "上衣",
    "color": "灰",
    "price": "¥109.12",
    "purchaseDate": "",
    "season": "秋"
  },
  "B": {
    "category": "上衣",
    "color": "",
    "price": "¥200",
    "purchaseDate": "",
    "season": "秋",
    "_sources": {
      "category": "vision",
      "color": "vision",
      "price": "vision",
      "season": "vision",
      "purchaseDate": "ocr"
    },
    "ocr": null
  },
  "statusA": {
    "category": "exact",
    "color": "semantic_match",
    "price": "format_mismatch",
    "purchaseDate": "unlabeled",
    "season": "exact"
  },
  "statusB": {
    "category": "exact",
    "color": "missing",
    "price": "value_mismatch",
    "purchaseDate": "unlabeled",
    "season": "exact"
  },
  "parseOk": {
    "A": true,
    "B": true
  }
}
```

### `pants_gray`

```json
{
  "gold": {
    "category": "裤装",
    "color": "浅灰色",
    "price": "167.34",
    "purchaseDate": "2025-12-13",
    "season": "冬"
  },
  "A": {
    "category": "裤装",
    "color": "灰",
    "price": "¥199",
    "purchaseDate": "",
    "season": ""
  },
  "B": {
    "category": "裤装",
    "color": "",
    "price": "¥199",
    "purchaseDate": "2025-12-13",
    "season": "",
    "_sources": {
      "category": "vision",
      "color": "vision",
      "price": "vision",
      "season": "vision",
      "purchaseDate": "ocr"
    },
    "ocr": "2025-12-13"
  },
  "statusA": {
    "category": "exact",
    "color": "value_mismatch",
    "price": "value_mismatch",
    "purchaseDate": "missing",
    "season": "missing"
  },
  "statusB": {
    "category": "exact",
    "color": "missing",
    "price": "value_mismatch",
    "purchaseDate": "exact",
    "season": "missing"
  },
  "parseOk": {
    "A": true,
    "B": true
  }
}
```

### `shoes_gold_wedding`

```json
{
  "gold": {
    "category": "鞋",
    "color": "金色",
    "price": "599",
    "purchaseDate": "2025-05-14",
    "season": "全年"
  },
  "A": {
    "category": "鞋",
    "color": "金",
    "price": "¥599",
    "purchaseDate": "",
    "season": ""
  },
  "B": {
    "category": "鞋",
    "color": "",
    "price": "¥599",
    "purchaseDate": "2025-05-14",
    "season": "春",
    "_sources": {
      "category": "vision",
      "color": "vision",
      "price": "vision",
      "season": "vision",
      "purchaseDate": "ocr"
    },
    "ocr": "2025-05-14"
  },
  "statusA": {
    "category": "exact",
    "color": "value_mismatch",
    "price": "format_mismatch",
    "purchaseDate": "missing",
    "season": "missing"
  },
  "statusB": {
    "category": "exact",
    "color": "missing",
    "price": "format_mismatch",
    "purchaseDate": "exact",
    "season": "value_mismatch"
  },
  "parseOk": {
    "A": true,
    "B": true
  }
}
```

### `shorts_001`

```json
{
  "gold": {
    "category": "裤装",
    "color": "黑色",
    "price": "63",
    "purchaseDate": "2025-09-23",
    "season": "夏"
  },
  "A": {
    "category": "裤装",
    "color": "黑",
    "price": "¥63",
    "purchaseDate": "",
    "season": ""
  },
  "B": {
    "category": "裤装",
    "color": "",
    "price": "¥79",
    "purchaseDate": "2025-09-23",
    "season": "",
    "_sources": {
      "category": "vision",
      "color": "vision",
      "price": "vision",
      "season": "vision",
      "purchaseDate": "ocr"
    },
    "ocr": "2025-09-23"
  },
  "statusA": {
    "category": "exact",
    "color": "semantic_match",
    "price": "format_mismatch",
    "purchaseDate": "missing",
    "season": "missing"
  },
  "statusB": {
    "category": "exact",
    "color": "missing",
    "price": "value_mismatch",
    "purchaseDate": "exact",
    "season": "missing"
  },
  "parseOk": {
    "A": true,
    "B": true
  }
}
```

## Verdict

- category: A 50% → B 75%
- purchaseDate: A 14.3% → B 100%
- bra_* all correct on B: **NO**
- field regressions (usable→fail): **5**
- parse success: A 100% → B 100%
