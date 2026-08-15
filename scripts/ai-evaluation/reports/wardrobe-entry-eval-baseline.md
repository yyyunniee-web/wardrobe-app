# wardrobe-entry evaluation — v1 Vision-only

- **runId:** `20260814-233808-baseline`
- **version:** `baseline`
- **dataset:** `datasets/wardrobe-entry`
- **promptVersion:** `1a9a9f12d33b`
- **样本数:** 8

## Accuracy（相对 gold；usable = exact + format_mismatch + semantic_match）

| 字段 | labeled | exact | usable | usable% | missing | value_mismatch |
|------|---------|-------|--------|---------|---------|----------------|
| name | 8 | 0 | 0 | 0% | 0 | 8 |
| category | 8 | 4 | 4 | 50% | 0 | 4 |
| color | 8 | 0 | 3 | 37.5% | 0 | 5 |
| price | 8 | 0 | 5 | 62.5% | 0 | 3 |
| purchaseDate | 7 | 0 | 0 | 0% | 7 | 0 |
| season | 8 | 0 | 0 | 0% | 7 | 1 |

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
  "purchaseDate": "",
  "season": "秋冬",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "vision"
  }
}
```

### diff

- **name** `value_mismatch`: gold `"Basic House高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬"` → pred `"Basic House/百家好高腰鱼尾裙配大衣半高领针织打底连衣裙女秋冬 黑珍珠-长款;M"`
- **category** `value_mismatch`: gold `"连衣裙"` → pred `"裙装"`
- **color** `value_mismatch`: gold `"黑珍珠"` → pred `"黑"`
- **season** `value_mismatch`: gold `"冬"` → pred `"秋冬"`
- **price** `format_mismatch`: gold `"360.44"` → pred `"¥360.44"`
- **purchaseDate** `missing`: gold `"2024-12-15"` → pred `"(缺失或未解析)"`

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
    "fabricList": ["羊毛"],   
    "season": "秋冬",   
    "scenes": ["通勤", "休闲"],   
    "tags": ["简约"]  
  }, {  
    "skuLabel": "",   
    "name": "Basic House/百家... 浅花杏;S",   
    "category": "裙装",   
    "price": "¥360.45",   
    "colorRaw": "浅花杏",   
    "color": "其他",   
    "fabricList": [],   
    "season": "未知",   
    "scenes": [],   
    "tags": []  
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
  "color": "其他",
  "price": "¥72.27",
  "purchaseDate": "",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "vision"
  }
}
```

### diff

- **name** `value_mismatch`: gold `"猫人挂脖美背内衣女粉底液小胸聚拢大露背吊带隐形细肩带无痕文胸"` → pred `"猫人挂脖美背内衣女"`
- **category** `value_mismatch`: gold `"内衣"` → pred `"上衣"`
- **color** `value_mismatch`: gold `"香槟色"` → pred `"其他"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"72.27"` → pred `"¥72.27"`
- **purchaseDate** `missing`: gold `"2025-05-25"` → pred `"(缺失或未解析)"`

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
        "color": "其他",  
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
  "name": "@新增暗红色！卖了一万多件的带乳胶胸垫背心 旅游拍照超出片！",
  "category": "裙装",
  "color": "其他",
  "price": "¥24.99",
  "purchaseDate": "",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "vision"
  }
}
```

### diff

- **name** `value_mismatch`: gold `"带乳胶胸垫背心"` → pred `"@新增暗红色！卖了一万多件的带乳胶胸垫背心 旅游拍照超出片！"`
- **category** `value_mismatch`: gold `"内衣"` → pred `"裙装"`
- **color** `value_mismatch`: gold `"暗红"` → pred `"其他"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"24.99"` → pred `"¥24.99"`
- **purchaseDate** `missing`: gold `"2025-06-22"` → pred `"(缺失或未解析)"`

### Vision raw
```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "",   
    "name": "@新增暗红色！卖了一万多件的带乳胶胸垫背心 旅游拍照超出片！",   
    "category": "裙装",   
    "price": "¥24.99",   
    "colorRaw": "暗红",   
    "color": "其他",   
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
  "purchaseDate": "",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "vision"
  }
}
```

### diff

- **name** `value_mismatch`: gold `"CrzYoga Butterluxe女士运动内衣瑜伽服美背bra"` → pred `"CrzYoga Butterluxe 黄油女士运动内衣瑜伽文胸瑜伽服美背bra"`
- **category** `value_mismatch`: gold `"内衣"` → pred `"上衣"`
- **color** `semantic_match`: gold `"黑色"` → pred `"黑"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `value_mismatch`: gold `"104.26"` → pred `"¥129"`
- **purchaseDate** `missing`: gold `"2025-09-23"` → pred `"(缺失或未解析)"`

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
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "vision"
  }
}
```

### diff

- **name** `value_mismatch`: gold `"Basic House/百家好祥意打底衫2024秋季上衣复古扎染印花长袖T恤"` → pred `"Basic House/百家好禅意打底衫2024秋季上衣复古扎染印花长袖T恤"`
- **color** `semantic_match`: gold `"灰色"` → pred `"灰"`
- **season** `missing`: gold `"秋"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"109.12"` → pred `"¥109.12"`

### Vision raw
```
{  
  "imageType": "order",  
  "itemCount": 3,  
  "items": [  
    {  
      "skuLabel": "",  
      "name": "Basic House/百家好禅意打底衫2024秋季上衣复古扎染印花长袖T恤",  
      "category": "上衣",  
      "price": "¥109.12",  
      "colorRaw": "灰色",  
      "color": "灰",  
      "fabric": "",  
      "fabricList": [],  
      "cropSuggestion": {  
        "x": "",  
        "y": "",  
        "width": "",  
        "height": ""  
      }  
    },  
    {  
      "skuLabel": "",  
      "name": "Basic House/百家...",  
      "category": "裤装",  
      "price": "¥209.91",  
      "colorRaw": "咖色",  
      "color": "棕",  
      "fabric": "",  
      "fabricList": [],  
      "cropSuggestion": {  
        "x": "",  
        "y": "",  
        "width": "",  
        "height": ""  
      }  
    },  
    {  
      "skuLabel": "",  
      "name": "Basic House/百家...",  
      "category": "上衣",  
      "price": "¥109.12",  
      "colorRaw": "灰色",  
      "color": "灰",  
      "fabric": "",  
      "fabricList": [],  
      "cropSuggestion": {  
        "x": "",  
        "y": "",  
        "width": "",  
        "height": ""  
      }  
    }  
  ],  
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
  "purchaseDate": "",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "vision"
  }
}
```

### diff

- **name** `value_mismatch`: gold `"asomesone美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子"` → pred `"asomesome美式磨毛修身弹力微喇裤女秋冬紧身灰色喇叭裤休闲裤子"`
- **color** `value_mismatch`: gold `"浅灰色"` → pred `"灰"`
- **season** `missing`: gold `"冬"` → pred `"(缺失或未解析)"`
- **price** `value_mismatch`: gold `"167.34"` → pred `"¥199"`
- **purchaseDate** `missing`: gold `"2025-12-13"` → pred `"(缺失或未解析)"`

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
  "purchaseDate": "",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "vision"
  }
}
```

### diff

- **name** `value_mismatch`: gold `"pjjuu订婚鞋绝美平底婚鞋女秀婚纱两穿新娘结婚鞋大码低跟单鞋"` → pred `"pjjuu订婚鞋 绝美平底婚鞋女禾秀 婚纱两穿新娘结婚鞋大码低跟单鞋"`
- **color** `value_mismatch`: gold `"金色"` → pred `"金"`
- **season** `missing`: gold `"全年"` → pred `"(缺失或未解析)"`
- **price** `format_mismatch`: gold `"599"` → pred `"¥599"`
- **purchaseDate** `missing`: gold `"2025-05-14"` → pred `"(缺失或未解析)"`

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
- visionOk=true parseOk=true

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
  "name": "[优惠价] Beemen瑜伽裤女高腰提臀外穿健身五分短裤夏季运动紧身裸感骑行裤",
  "category": "裤装",
  "color": "黑",
  "price": "¥79",
  "purchaseDate": "",
  "season": "",
  "_sources": {
    "name": "vision",
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "vision"
  }
}
```

### diff

- **name** `value_mismatch`: gold `"Beemen瑜伽裤女高腰提臀外穿健身五分短裤夏季运动紧身裸感骑行裤"` → pred `"[优惠价] Beemen瑜伽裤女高腰提臀外穿健身五分短裤夏季运动紧身裸感骑行裤"`
- **color** `semantic_match`: gold `"黑色"` → pred `"黑"`
- **season** `missing`: gold `"夏"` → pred `"(缺失或未解析)"`
- **price** `value_mismatch`: gold `"63"` → pred `"¥79"`
- **purchaseDate** `missing`: gold `"2025-09-23"` → pred `"(缺失或未解析)"`

### Vision raw
```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "",   
    "name": "[优惠价] Beemen瑜伽裤女高腰提臀外穿健身五分短裤夏季运动紧身裸感骑行裤",   
    "category": "裤装",  
    "price": "¥79",  
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
