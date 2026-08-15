# wardrobe-entry evaluation — v2 Vision+OCR(date)

- **runId:** `20260814-233939-current`
- **version:** `current`
- **dataset:** `datasets/wardrobe-entry`
- **promptVersion:** `1a9a9f12d33b`
- **样本数:** 8

## Accuracy（相对 gold；usable = exact + format_mismatch + semantic_match）

| 字段 | labeled | exact | usable | usable% | missing | value_mismatch |
|------|---------|-------|--------|---------|---------|----------------|
| name | 8 | 1 | 1 | 12.5% | 0 | 6 |
| category | 8 | 3 | 3 | 37.5% | 0 | 4 |
| color | 8 | 0 | 2 | 25% | 1 | 4 |
| price | 8 | 0 | 5 | 62.5% | 0 | 2 |
| purchaseDate | 7 | 6 | 6 | 85.7% | 0 | 0 |
| season | 8 | 1 | 1 | 12.5% | 5 | 1 |

## Case `basic-house-001`

- image: `basic-house-001.jpg`
- label: `basic-house-001.json`
- visionOk=true parseOk=true

### gold
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

### prediction
```json
{
  "name": "Basic House/百家好高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬 黑珍珠-长款;M",
  "category": "裙装",
  "color": "黑",
  "price": "¥360.44",
  "purchaseDate": "2024-12-15",
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

### diff

- **name** `value_mismatch`: gold `"Basic House高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬"` → pred `"Basic House/百家好高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬 黑珍珠-长款;M"`
- **category** `value_mismatch`: gold `"连衣裙"` → pred `"裙装"`
- **color** `value_mismatch`: gold `"黑珍珠"` → pred `"黑"`
- **season** `missing`: gold `"冬"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"360.44"` → pred `"¥360.44"`

### Vision raw
```
{  
    "imageType": "order",  
    "itemCount": 2,  
    "items": [ {  
        "skuLabel": "",   
        "name": "Basic House/百家好高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬 黑珍珠-长款;M",  
        "category": "裙装",  
        "price": "¥360.44",  
        "colorRaw": "黑珍珠",  
        "color": "黑",  
        "fabric": "",  
        "fabricList": [],  
        "cropSuggestion": {  
            "x": "",  
            "y": "",  
            "width": "",  
            "height": ""  
        }  
    }, {  
        "skuLabel": "",  
        "name": "Basic House/百家... 浅花杏;S",  
        "category": "裙装",  
        "price": "¥360.45",  
        "colorRaw": "浅花杏",  
        "color": "白",  
        "fabric": "",  
        "fabricList": [],  
        "cropSuggestion": {  
            "x": "",  
            "y": "",  
            "width": "",  
            "height": ""  
        }  
    }],  
    "name": "",  
    "nameRaw": "",  
    "category": "",  
    "price": "",  
    "purchaseDate": "",  
    "season": "",  
    "scenes": [],  
    "fabric": "",  
    "fabricList": [],  
    "colorRaw": "",  
    "color": "",  
    "tags": [],  
    "confidence": "",  
    "cropSuggestion": {  
        "x": "",  
        "y": "",  
        "width": "",  
        "height": ""  
    }  
}
```

## Case `bra_002`

- image: `bra_002.jpg`
- label: `bra_002.json`
- visionOk=true parseOk=true

### gold
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

### prediction
```json
{
  "name": "猫人挂脖美背内衣女",
  "category": "上衣",
  "color": "",
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

### diff

- **name** `value_mismatch`: gold `"猫人挂脖美背内衣女粉底液小胸聚拢大露背吊带隐形细肩带无痕文胸"` → pred `"猫人挂脖美背内衣女"`
- **category** `value_mismatch`: gold `"内衣"` → pred `"上衣"`
- **color** `missing`: gold `"香槟色"` → pred `"(缺失或未解析)"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"72.27"` → pred `"¥72.27"`

### Vision raw
```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "",   
    "name": "猫人挂脖美背内衣女",   
    "category": "上衣",   
    "price": "¥72.27",   
    "colorRaw": "香槟色",   
    "color": "",   
    "fabric": "",   
    "fabricList": [],   
    "cropSuggestion": {  
      "x": "",  
      "y": "",  
      "width": "",  
      "height": ""  
    }  
  } ],  
  "name": "",  
  "nameRaw": "",  
  "category": "",  
  "price": "",  
  "purchaseDate": "",  
  "season": "",  
  "scenes": [],  
  "fabric": "",  
  "fabricList": [],  
  "colorRaw": "",  
  "color": "",  
  "tags": [],  
  "confidence": ""  
}
```

## Case `bra_red`

- image: `bra_red.jpg`
- label: `bra_red.json`
- visionOk=true parseOk=true

### gold
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

### prediction
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

### diff

- **category** `value_mismatch`: gold `"内衣"` → pred `"上衣"`
- **color** `value_mismatch`: gold `"暗红"` → pred `"酒红"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"24.99"` → pred `"¥24.99"`

### Vision raw
```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "",   
    "name": "带乳胶胸垫背心",   
    "category": "上衣",   
    "price": "¥24.99",   
    "colorRaw": "暗红",   
    "color": "酒红",   
    "fabric": "",   
    "fabricList": [],   
    "cropSuggestion": {  
      "x": "",   
      "y": "",   
      "width": "",   
      "height": ""  
    }  
  } ],  
  "name": "",  
  "nameRaw": "",  
  "category": "",  
  "price": "",  
  "purchaseDate": "",  
  "season": "",  
  "scenes": [],  
  "fabric": "",  
  "fabricList": [],  
  "colorRaw": "",  
  "color": "",  
  "tags": [],  
  "confidence": ""  
}
```

## Case `bra_yoga_001`

- image: `bra_yoga_001.jpg`
- label: `bra_yoga_001.json`
- visionOk=true parseOk=true

### gold
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

### prediction
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

### diff

- **name** `value_mismatch`: gold `"CrzYoga Butterluxe女士运动内衣瑜伽服美背bra"` → pred `"CrzYoga Butterluxe 黄油女士运动内衣瑜伽文胸瑜伽服美背bra"`
- **category** `value_mismatch`: gold `"内衣"` → pred `"上衣"`
- **color** `semantic_match`: gold `"黑色"` → pred `"黑"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `value_mismatch`: gold `"104.26"` → pred `"¥129"`

### Vision raw
```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "",   
    "name": "CrzYoga Butterluxe 黄油女士运动内衣瑜伽文胸瑜伽服美背bra",   
    "category": "上衣",  
    "price": "¥129",  
    "colorRaw": "黑色",  
    "color": "黑",  
    "fabric": "",  
    "fabricList": [],  
    "cropSuggestion": {  
      "x": "",  
      "y": "",  
      "width": "",  
      "height": ""  
    }  
  } ],  
  "name": "",  
  "nameRaw": "",  
  "category": "",  
  "price": "",  
  "purchaseDate": "",  
  "season": "",  
  "scenes": [],  
  "fabric": "",  
  "fabricList": [],  
  "colorRaw": "",  
  "color": "",  
  "tags": [],  
  "confidence": ""  
}
```

## Case `order_multi_refund_001`

- image: `order_multi_refund_001.jpg`
- label: `order_multi_refund_001.json`
- visionOk=true parseOk=true

### gold
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

### prediction
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

### diff

- **name** `value_mismatch`: gold `"Basic House/百家好祥意打底衫2024秋季上衣复古扎染印花长袖T恤"` → pred `"Basic House/百家好禅意打底衫2024秋季上衣复古扎染印花长袖T恤"`
- **color** `semantic_match`: gold `"灰色"` → pred `"灰"`
- **price** `format_mismatch`: gold `"109.12"` → pred `"¥109.12"`

### Vision raw
```
{  
  "imageType": "order",  
  "itemCount": 3,  
  "items": [ {  
    "skuLabel": "",   
    "name": "Basic House/百家好禅意打底衫2024秋季上衣复古扎染印花长袖T恤",   
    "category": "上衣",  
    "price": "¥109.12",  
    "colorRaw": "灰色",  
    "color": "灰",  
    "fabric": "",  
    "fabricList": [],  
    "season": "秋",  
    "scenes": ["通勤", "休闲"],  
    "tags": ["简约"],  
    "confidence": ""  
  }, {  
    "skuLabel": "",   
    "name": "Basic House/百家...",   
    "category": "裙装",  
    "price": "¥209.91",  
    "colorRaw": "咖色",  
    "color": "棕",  
    "fabric": "",  
    "fabricList": [],  
    "season": "秋",  
    "scenes": ["通勤", "休闲"],  
    "tags": ["简约"],  
    "confidence": ""  
  }, {  
    "skuLabel": "",   
    "name": "Basic House/百家...",   
    "category": "上衣",  
    "price": "¥109.12",  
    "colorRaw": "灰色",  
    "color": "灰",  
    "fabric": "",  
    "fabricList": [],  
    "season": "秋",  
    "scenes": ["通勤", "休闲"],  
    "tags": ["简约"],  
    "confidence": ""  
  }],  
  "name": "",  
  "nameRaw": "",  
  "category": "",  
  "price": "",  
  "purchaseDate": "",  
  "season": "",  
  "scenes": [],  
  "fabric": "",  
  "fabricList": [],  
  "colorRaw": "",  
  "color": "",  
  "tags": [],  
  "confidence": "",  
  "cropSuggestion": {  
    "x": "",  
    "y": "",  
    "width": "",  
    "height": ""  
  }  
}
```

## Case `pants_gray`

- image: `pants_gray.jpg`
- label: `pants_gray.json`
- visionOk=true parseOk=true

### gold
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

### prediction
```json
{
  "name": "asomesome美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子",
  "category": "裤装",
  "color": "灰",
  "price": "¥199",
  "purchaseDate": "2025-12-13",
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

### diff

- **name** `value_mismatch`: gold `"asomesone美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子"` → pred `"asomesome美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子"`
- **color** `value_mismatch`: gold `"浅灰色"` → pred `"灰"`
- **season** `value_mismatch`: gold `"冬"` → pred `"秋冬"`
- **price** `value_mismatch`: gold `"167.34"` → pred `"¥199"`

### Vision raw
```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "",   
    "name": "asomesome美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子",   
    "category": "裤装",   
    "price": "¥199",  
    "colorRaw": "浅灰色",  
    "color": "灰",  
    "fabric": "",  
    "fabricList": [],  
    "season": "秋冬",  
    "scenes": ["休闲"],  
    "cropSuggestion": {  
      "x": "",  
      "y": "",  
      "width": "",  
      "height": ""  
    }  
  } ],  
  "name": "",  
  "nameRaw": "",  
  "category": "",  
  "price": "",  
  "purchaseDate": "",  
  "season": "",  
  "scenes": [],  
  "fabric": "",  
  "fabricList": [],  
  "colorRaw": "",  
  "color": "",  
  "tags": [],  
  "confidence": ""  
}
```

## Case `shoes_gold_wedding`

- image: `shoes_gold_wedding.jpg`
- label: `shoes_gold_wedding.json`
- visionOk=true parseOk=true

### gold
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

### prediction
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

### diff

- **name** `value_mismatch`: gold `"pjjuu订婚鞋绝美平底婚鞋女秀婚纱两穿新娘结婚鞋大码低跟单鞋"` → pred `"pjjuu订婚鞋 绝美平底婚鞋女禾秀 婚纱两穿新娘结婚鞋大码低跟单鞋"`
- **color** `value_mismatch`: gold `"金色"` → pred `"金"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"599"` → pred `"¥599"`

### Vision raw
```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "",   
    "name": "pjjuu订婚鞋 绝美平底婚鞋女禾秀 婚纱两穿新娘结婚鞋大码低跟单鞋",   
    "category": "鞋",  
    "price": "¥599",  
    "colorRaw": "金色",  
    "color": "金",  
    "fabric": "",  
    "fabricList": [],  
    "cropSuggestion": {  
      "x": "",  
      "y": "",  
      "width": "",  
      "height": ""  
    }  
  } ],  
  "name": "",  
  "nameRaw": "",  
  "category": "",  
  "price": "",  
  "purchaseDate": "",  
  "season": "",  
  "scenes": [],  
  "fabric": "",  
  "fabricList": [],  
  "colorRaw": "",  
  "color": "",  
  "tags": [],  
  "confidence": ""  
}
```

## Case `shorts_001`

- image: `shorts_001.jpg`
- label: `shorts_001.json`
- visionOk=true parseOk=false

### gold
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

### prediction
```json
{
  "name": "",
  "category": "",
  "color": "",
  "price": "",
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

### diff

- **name** `parse_error`: gold `"Beemen瑜伽裤女高腰提臀外穿健身五分短裤夏季运动紧身裸感骑行裤"` → pred `"(缺失或未解析)"`
- **category** `parse_error`: gold `"裤装"` → pred `"(缺失或未解析)"`
- **color** `parse_error`: gold `"黑色"` → pred `"(缺失或未解析)"`
- **season** `parse_error`: gold `"夏"` → pred `"(缺失或未解析)"`
- **price** `parse_error`: gold `"63"` → pred `"(缺失或未解析)"`
- **purchaseDate** `parse_error`: gold `"2025-09-23"` → pred `"(缺失或未解析)"`

### Vision raw
```
{  
  "imageType":"order",  
  "itemCount":1,  
  "items [{"skuLabel":"【优惠价】Beemen瑜伽裤女高腰提臀外穿健身五分短裤夏季运动紧身裸感骑行裤","name":"云舒裤 轻塑形 - 黑色;M","price":"¥79","colorRaw":"黑色","fabricList":["轻塑形"],  
    "category":"裤装",  
    "price":"¥63",  
    "purchaseDate":"2025-09-23"  
}],  
  "name":"",
  "nameRaw":"",
  "category":"",
  "price":"",
  "purchaseDate":"",
  "season":"",
  "scenes":[],  
  "fabric":"",
  "fabricList":[],  
  "colorRaw":"",
  "color":"",
  "tags":[],  
  "confidence":"",
  "cropSuggestion":{"x":"","y":"","width":"","height":""}  
}
```
