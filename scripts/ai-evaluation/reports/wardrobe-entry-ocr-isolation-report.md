# wardrobe-entry OCR merge isolation experiment

验证：**purchaseDate OCR 接入是否只提升日期，不影响 Vision 商品字段。**

## Setup

- **runId:** `20260814-234549-ocr-isolation`
- **dataset:** `datasets/wardrobe-entry`（8 配对样本）
- **prompt:** 生产 `AI_PROMPT`（`promptVersion=1a9a9f12d33b`）— **未修改**
- **A:** Vision-only（同一 Vision 输出）
- **B:** 完全相同 Vision 输出 + OCR `purchaseDate` merge
- **隔离保证:** 每图只调用一次 Vision；B 不重跑 Vision
- **生产代码:** 未改动

## Verdict（重点）

### 1. purchaseDate 是否提升

| arm | usable | usable% | exact | missing |
|-----|--------|---------|-------|---------|
| A Vision-only | 0/7 | 0% | 0 | 7 |
| B Vision+OCR merge | 7/7 | 100% | 7 | 0 |

**结论:** purchaseDate usable% **提升 100 个百分点**（OCR merge 有效）。

### 2. category / color / price 是否保持

- **商品字段字节级相同（A≡B）:** 8/8 cases

| 字段 | A usable% | B usable% | Δ | A≡B predictions? |
|------|-----------|-----------|---|------------------|
| category | 50% (4/8) | 50% (4/8) | +0 | yes |
| color | 37.5% (3/8) | 37.5% (3/8) | +0 | yes |
| price | 75% (6/8) | 75% (6/8) | +0 | yes |
| name | 37.5% (3/8) | 37.5% (3/8) | +0 | yes |
| season | 12.5% (1/8) | 12.5% (1/8) | +0 | yes |

**结论:** category/color/price（及 name/season）预测与 A **完全一致**；OCR merge **未扰动** Vision 商品字段。Accuracy 表上 Δ=0 是隔离成立的直接结果。

## Accuracy 总表（usable = exact + format_mismatch + semantic_match）

| 字段 | A usable% | B usable% | Δ |
|------|-----------|-----------|---|
| name | 37.5% (3/8) | 37.5% (3/8) | +0 |
| category | 50% (4/8) | 50% (4/8) | +0 |
| color | 37.5% (3/8) | 37.5% (3/8) | +0 |
| price | 75% (6/8) | 75% (6/8) | +0 |
| purchaseDate | 0% (0/7) | 100% (7/7) | +100 |
| season | 12.5% (1/8) | 12.5% (1/8) | +0 |

## 分 case：purchaseDate

| id | gold | A Vision | B OCR-merge | A status | B status |
|----|------|----------|-------------|----------|----------|
| basic-house-001 | 2024-12-15 | (空) | 2024-12-15 | missing | exact |
| bra_002 | 2025-05-25 | (空) | 2025-05-25 | missing | exact |
| bra_red | 2025-06-22 | (空) | 2025-06-22 | missing | exact |
| bra_yoga_001 | 2025-09-23 | (空) | 2025-09-23 | missing | exact |
| order_multi_refund_001 | (空) | (空) | (空) | unlabeled | unlabeled |
| pants_gray | 2025-12-13 | (空) | 2025-12-13 | missing | exact |
| shoes_gold_wedding | 2025-05-14 | (空) | 2025-05-14 | missing | exact |
| shorts_001 | 2025-09-23 | (空) | 2025-09-23 | missing | exact |

## 分 case：商品字段（A≡B 校验）

| id | category A/B | color A/B | price A/B | identical? |
|----|--------------|-----------|-----------|------------|
| basic-house-001 | 裙装 | 黑 | ¥360.44 | yes |
| bra_002 | 上衣 | 其他 | ¥72.27 | yes |
| bra_red | 上衣 | 酒红 | ¥24.99 | yes |
| bra_yoga_001 | 上衣 | 黑 | ¥129 | yes |
| order_multi_refund_001 | 上衣 | 灰 | ¥109.12 | yes |
| pants_gray | 裤装 | 灰 | ¥199 | yes |
| shoes_gold_wedding | 鞋 | 金 | ¥599 | yes |
| shorts_001 | 裤装 | 黑 | ¥63 | yes |

## Per-case detail

### `basic-house-001`

- image: `basic-house-001.jpg` / label: `basic-house-001.json`
- visionOk=true parseOk=true
- OCR purchaseDate=`2024-12-15` strategy=`snapshot_full_year`
- productFieldsIdentical=true

**gold**
```json
{
  "name": "Basic House高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬",
  "category": "连衣裙",
  "color": "黑珍珠",
  "price": "360.44",
  "purchaseDate": "2024-12-15",
  "season": "冬"
}
```

**A prediction (Vision-only)**
```json
{
  "name": "Basic House/百家好 高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬 黑珍珠-长款;M",
  "category": "裙装",
  "color": "黑",
  "price": "¥360.44",
  "purchaseDate": "",
  "season": "秋冬"
}
```

**B prediction (Vision + OCR date)**
```json
{
  "name": "Basic House/百家好 高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬 黑珍珠-长款;M",
  "category": "裙装",
  "color": "黑",
  "price": "¥360.44",
  "purchaseDate": "2024-12-15",
  "season": "秋冬",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

**diffs (B vs gold，含日期；商品字段应与 A 同源)**

- **name** `value_mismatch`: gold `"Basic House高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬"` → pred `"Basic House/百家好 高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬 黑珍珠-长款;M"`
- **category** `value_mismatch`: gold `"连衣裙"` → pred `"裙装"`
- **color** `value_mismatch`: gold `"黑珍珠"` → pred `"黑"`
- **season** `value_mismatch`: gold `"冬"` → pred `"秋冬"`
- **price** `format_mismatch`: gold `"360.44"` → pred `"¥360.44"`

### `bra_002`

- image: `bra_002.jpg` / label: `bra_002.json`
- visionOk=true parseOk=true
- OCR purchaseDate=`2025-05-25` strategy=`snapshot_full_year`
- productFieldsIdentical=true

**gold**
```json
{
  "name": "猫人挂脖美背内衣女粉底液小胸聚拢大露背吊带隐形细肩带无痕文胸",
  "category": "内衣",
  "color": "香槟色",
  "price": "72.27",
  "purchaseDate": "2025-05-25",
  "season": "全年"
}
```

**A prediction (Vision-only)**
```json
{
  "name": "猫人挂脖美背内衣女粉底液小胸聚拢大露背吊带隐形细肩带无痕文胸",
  "category": "上衣",
  "color": "其他",
  "price": "¥72.27",
  "purchaseDate": "",
  "season": ""
}
```

**B prediction (Vision + OCR date)**
```json
{
  "name": "猫人挂脖美背内衣女粉底液小胸聚拢大露背吊带隐形细肩带无痕文胸",
  "category": "上衣",
  "color": "其他",
  "price": "¥72.27",
  "purchaseDate": "2025-05-25",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

**diffs (B vs gold，含日期；商品字段应与 A 同源)**

- **category** `value_mismatch`: gold `"内衣"` → pred `"上衣"`
- **color** `value_mismatch`: gold `"香槟色"` → pred `"其他"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"72.27"` → pred `"¥72.27"`

### `bra_red`

- image: `bra_red.jpg` / label: `bra_red.json`
- visionOk=true parseOk=true
- OCR purchaseDate=`2025-06-22` strategy=`snapshot_full_year`
- productFieldsIdentical=true

**gold**
```json
{
  "name": "带乳胶胸垫背心",
  "category": "内衣",
  "color": "暗红",
  "price": "24.99",
  "purchaseDate": "2025-06-22",
  "season": "全年"
}
```

**A prediction (Vision-only)**
```json
{
  "name": "带乳胶胸垫背心",
  "category": "上衣",
  "color": "酒红",
  "price": "¥24.99",
  "purchaseDate": "",
  "season": ""
}
```

**B prediction (Vision + OCR date)**
```json
{
  "name": "带乳胶胸垫背心",
  "category": "上衣",
  "color": "酒红",
  "price": "¥24.99",
  "purchaseDate": "2025-06-22",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

**diffs (B vs gold，含日期；商品字段应与 A 同源)**

- **category** `value_mismatch`: gold `"内衣"` → pred `"上衣"`
- **color** `value_mismatch`: gold `"暗红"` → pred `"酒红"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"24.99"` → pred `"¥24.99"`

### `bra_yoga_001`

- image: `bra_yoga_001.jpg` / label: `bra_yoga_001.json`
- visionOk=true parseOk=true
- OCR purchaseDate=`2025-09-23` strategy=`snapshot_full_year`
- productFieldsIdentical=true

**gold**
```json
{
  "name": "CrzYoga Butterluxe女士运动内衣瑜伽服美背bra",
  "category": "内衣",
  "color": "黑色",
  "price": "104.26",
  "purchaseDate": "2025-09-23",
  "season": "全年"
}
```

**A prediction (Vision-only)**
```json
{
  "name": "CrzYoga Butterluxe 黄油女士运动内衣瑜伽文胸瑜伽服美背bra",
  "category": "上衣",
  "color": "黑",
  "price": "¥129",
  "purchaseDate": "",
  "season": ""
}
```

**B prediction (Vision + OCR date)**
```json
{
  "name": "CrzYoga Butterluxe 黄油女士运动内衣瑜伽文胸瑜伽服美背bra",
  "category": "上衣",
  "color": "黑",
  "price": "¥129",
  "purchaseDate": "2025-09-23",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

**diffs (B vs gold，含日期；商品字段应与 A 同源)**

- **name** `value_mismatch`: gold `"CrzYoga Butterluxe女士运动内衣瑜伽服美背bra"` → pred `"CrzYoga Butterluxe 黄油女士运动内衣瑜伽文胸瑜伽服美背bra"`
- **category** `value_mismatch`: gold `"内衣"` → pred `"上衣"`
- **color** `semantic_match`: gold `"黑色"` → pred `"黑"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `value_mismatch`: gold `"104.26"` → pred `"¥129"`

### `order_multi_refund_001`

- image: `order_multi_refund_001.jpg` / label: `order_multi_refund_001.json`
- visionOk=true parseOk=true
- OCR purchaseDate=`(空)` strategy=`none`
- productFieldsIdentical=true

**gold**
```json
{
  "name": "Basic House/百家好祥意打底衫2024秋季上衣复古扎染印花长袖T恤",
  "category": "上衣",
  "color": "灰色",
  "price": "109.12",
  "purchaseDate": "",
  "season": "秋"
}
```

**A prediction (Vision-only)**
```json
{
  "name": "Basic House/百家好禅意打底衫2024秋季上衣复古扎染印花长袖T恤",
  "category": "上衣",
  "color": "灰",
  "price": "¥109.12",
  "purchaseDate": "",
  "season": "秋"
}
```

**B prediction (Vision + OCR date)**
```json
{
  "name": "Basic House/百家好禅意打底衫2024秋季上衣复古扎染印花长袖T恤",
  "category": "上衣",
  "color": "灰",
  "price": "¥109.12",
  "purchaseDate": "",
  "season": "秋",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

**diffs (B vs gold，含日期；商品字段应与 A 同源)**

- **name** `value_mismatch`: gold `"Basic House/百家好祥意打底衫2024秋季上衣复古扎染印花长袖T恤"` → pred `"Basic House/百家好禅意打底衫2024秋季上衣复古扎染印花长袖T恤"`
- **color** `semantic_match`: gold `"灰色"` → pred `"灰"`
- **price** `format_mismatch`: gold `"109.12"` → pred `"¥109.12"`

### `pants_gray`

- image: `pants_gray.jpg` / label: `pants_gray.json`
- visionOk=true parseOk=true
- OCR purchaseDate=`2025-12-13` strategy=`snapshot_full_year`
- productFieldsIdentical=true

**gold**
```json
{
  "name": "asomesone美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子",
  "category": "裤装",
  "color": "浅灰色",
  "price": "167.34",
  "purchaseDate": "2025-12-13",
  "season": "冬"
}
```

**A prediction (Vision-only)**
```json
{
  "name": "asomesome美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子",
  "category": "裤装",
  "color": "灰",
  "price": "¥199",
  "purchaseDate": "",
  "season": ""
}
```

**B prediction (Vision + OCR date)**
```json
{
  "name": "asomesome美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子",
  "category": "裤装",
  "color": "灰",
  "price": "¥199",
  "purchaseDate": "2025-12-13",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

**diffs (B vs gold，含日期；商品字段应与 A 同源)**

- **name** `value_mismatch`: gold `"asomesone美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子"` → pred `"asomesome美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子"`
- **color** `value_mismatch`: gold `"浅灰色"` → pred `"灰"`
- **season** `missing`: gold `"冬"` → pred `"(缺失或未解析)"`
- **price** `value_mismatch`: gold `"167.34"` → pred `"¥199"`

### `shoes_gold_wedding`

- image: `shoes_gold_wedding.jpg` / label: `shoes_gold_wedding.json`
- visionOk=true parseOk=true
- OCR purchaseDate=`2025-05-14` strategy=`snapshot_full_year`
- productFieldsIdentical=true

**gold**
```json
{
  "name": "pjjuu订婚鞋绝美平底婚鞋女秀婚纱两穿新娘结婚鞋大码低跟单鞋",
  "category": "鞋",
  "color": "金色",
  "price": "599",
  "purchaseDate": "2025-05-14",
  "season": "全年"
}
```

**A prediction (Vision-only)**
```json
{
  "name": "pjjuu订婚鞋 绝美平底婚鞋女禾秀 婚纱两穿新娘结婚鞋大码低跟单鞋",
  "category": "鞋",
  "color": "金",
  "price": "¥599",
  "purchaseDate": "",
  "season": ""
}
```

**B prediction (Vision + OCR date)**
```json
{
  "name": "pjjuu订婚鞋 绝美平底婚鞋女禾秀 婚纱两穿新娘结婚鞋大码低跟单鞋",
  "category": "鞋",
  "color": "金",
  "price": "¥599",
  "purchaseDate": "2025-05-14",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

**diffs (B vs gold，含日期；商品字段应与 A 同源)**

- **name** `value_mismatch`: gold `"pjjuu订婚鞋绝美平底婚鞋女秀婚纱两穿新娘结婚鞋大码低跟单鞋"` → pred `"pjjuu订婚鞋 绝美平底婚鞋女禾秀 婚纱两穿新娘结婚鞋大码低跟单鞋"`
- **color** `value_mismatch`: gold `"金色"` → pred `"金"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"599"` → pred `"¥599"`

### `shorts_001`

- image: `shorts_001.jpg` / label: `shorts_001.json`
- visionOk=true parseOk=true
- OCR purchaseDate=`2025-09-23` strategy=`snapshot_full_year`
- productFieldsIdentical=true

**gold**
```json
{
  "name": "Beemen瑜伽裤女高腰提臀外穿健身五分短裤夏季运动紧身裸感骑行裤",
  "category": "裤装",
  "color": "黑色",
  "price": "63",
  "purchaseDate": "2025-09-23",
  "season": "夏"
}
```

**A prediction (Vision-only)**
```json
{
  "name": "Beemen瑜伽裤女高腰提臀外穿健身五分短裤夏季运动紧身裸感骑行裤",
  "category": "裤装",
  "color": "黑",
  "price": "¥63",
  "purchaseDate": "",
  "season": ""
}
```

**B prediction (Vision + OCR date)**
```json
{
  "name": "Beemen瑜伽裤女高腰提臀外穿健身五分短裤夏季运动紧身裸感骑行裤",
  "category": "裤装",
  "color": "黑",
  "price": "¥63",
  "purchaseDate": "2025-09-23",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

**diffs (B vs gold，含日期；商品字段应与 A 同源)**

- **color** `semantic_match`: gold `"黑色"` → pred `"黑"`
- **season** `missing`: gold `"夏"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"63"` → pred `"¥63"`

## Method notes

- 与先前 `wardrobe-entry-eval-compare`（baseline/current 各跑一遍 Vision）不同：本实验 **强制共享同一 Vision raw**，排除模型非确定性对商品字段 Δ 的干扰。
- B 仅覆盖 `purchaseDate`；其余字段浅拷贝自 A。
