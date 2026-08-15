# 订单截图双通道评估（Vision + OCR）

```text
        image
          |
     +----+----+
     |         |
   Vision     OCR
     |         |
 商品字段     日期字段
     |         |
     +----合并报告----+
```

- **suiteId:** `20260814-222901`
- **Vision:** 生产 `AI_PROMPT` / `1a9a9f12d33b` → category / color / price / season
- **OCR:** macOS Vision OCR + 交易快照规则 → purchaseDate（补年=2026）
- **diff 分类:** 沿用实验 C（missing / format_mismatch / semantic_match / value_mismatch / parse_error）
- **范围:** 仅评测，不接入生产

## 汇总

| 字段 | 可用命中*（exact+format+semantic） |
|------|-------------------------------------|
| category | 3/4 |
| color | 2/4 |
| price | 3/4 |
| season | 1/4 |
| purchaseDate | 4/4 |

\* 相对 label；`format_mismatch` / `semantic_match` 计为可用命中，`missing` / `value_mismatch` / `parse_error` 不计。

- diffKind 计数: missing=4, format_mismatch=3, semantic_match=2, value_mismatch=3, parse_error=0

## Case `bra_001`

### Vision raw

```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "[漫画胸基础款];M[(适合75AB)]",   
    "name": "好奇蜜斯粉底液内衣女外扩聚拢小胸显大漫画胸无痕文胸罩无钢圈圈夏",   
    "category": "内衣",  
    "price": "¥73.15",  
    "colorRaw": "",  
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

- visionOk=true parseOk=true fields: category=`内衣` color=`(空)` price=`¥73.15` season=`(空)` (vision purchaseDate=`(空)`)

### OCR raw

```
•外扩显大 穿出漫画胸•
【优惠价】好奇蜜斯粉底液内衣
女外扩聚拢小胸显大漫画胸无痕
文胸罩无钢圈夏
隐形肤【漫画胸基础款】；M［（适合7
5AB）］
退货宝 大促价保 假一赔四＞
实付价¥73.15 价格明细＞
◎ 回头客优惠满196减8
¥99.8
×1
领券购买＞
闲鱼转卖
申请售后
实付款 共减¥79.97
加入购物车
¥219.43~
订单信息 共8项
订单保障
共7项
4934638369928007415复制
凭据：2025年12月9日下单交易快照＞
```

- OCR purchaseDate=`2025-12-09` strategy=`snapshot_full_year` snippet=`2025年12月9日下单交易快照`

### merged result

```json
{
  "category": "内衣",
  "color": "",
  "price": "¥73.15",
  "season": "",
  "purchaseDate": "2025-12-09",
  "sources": {
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

### label

```json
{
  "category": "内衣",
  "color": "肤色",
  "price": 73.15,
  "season": "夏",
  "purchaseDate": "2025-12-09"
}
```

### diff 分类

- compareSource: `items[0]`
- purchaseDateCompareSource: `top-level fallback`
- **color** `missing`: 标准 `"肤色"` → merged `"(缺失或未解析)"`
- **season** `missing`: 标准 `"夏"` → merged `"(缺失或未解析)"`
- **price** `format_mismatch`: 标准 `73.15` → merged `"¥73.15"`

---

## Case `shoes-001`

### Vision raw

```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "",   
    "name": "云朵洞洞鞋女夏季厚底防滑外穿两穿包头拖护士增高沙滩海边凉拖鞋",   
    "category": "鞋",   
    "price": "¥48.90",   
    "colorRaw": "卡其色(失落土星)",   
    "color": "卡其",   
    "fabric": "",   
    "fabricList": [],   
    "season": "夏",   
    "scenes": ["沙滩"],   
    "tags": [],   
    "confidence": ""  
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

- visionOk=true parseOk=true fields: category=`鞋` color=`卡其` price=`¥48.90` season=`夏` (vision purchaseDate=`(空)`)

### OCR raw

```
云朵洞洞鞋女夏季厚底防滑外穿
两穿包头拖护士增高沙滩海边凉
拖鞋
卡其色（失落土星）；34/35［适合34
-35运动鞋码］
7天价保 假一赔四 极速退款〉
实付价¥48.9价格明细＞
使用小贴士
申请售后
实付款 共减¥18.1
单品直降抵¥10超级立减抵¥8.1
¥67
×1
加入购物车
¥48.9
订单信息共8项
订单保障
共6项
4502315880012007415
复制
凭据：4月20日下单交易快照＞
```

- OCR purchaseDate=`2026-04-20` strategy=`snapshot_md_current_year` snippet=`4月20日下单交易快照`

### merged result

```json
{
  "category": "鞋",
  "color": "卡其",
  "price": "¥48.90",
  "season": "夏",
  "purchaseDate": "2026-04-20",
  "sources": {
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

### label

```json
{
  "category": "鞋",
  "color": "卡其色",
  "price": 48.9,
  "season": "夏",
  "purchaseDate": "2026-04-20"
}
```

### diff 分类

- compareSource: `items[0]`
- purchaseDateCompareSource: `top-level fallback`
- **color** `semantic_match`: 标准 `"卡其色"` → merged `"卡其"`
- **price** `format_mismatch`: 标准 `48.9` → merged `"¥48.90"`

---

## Case `shorts001`

### Vision raw

```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "",   
    "name": "都市丽人内裤女纯棉抗菌裆2025新款中腰大码碎花少女四角短裤头",   
    "category": "裤装",   
    "price": "¥49.90",   
    "colorRaw": "咖牡丹+粉樱花+咖碎花",   
    "color": "花色",   
    "fabric": "",   
    "fabricList": ["纯棉"],   
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

- visionOk=true parseOk=true fields: category=`裤装` color=`花色` price=`¥49.90` season=`(空)` (vision purchaseDate=`(空)`)

### OCR raw

```
都市丽人内裤女纯棉抗菌裆2025
新款中腰大码碎花少女生四角短
裤头
【3条装】咖牡丹+粉樱花+咖碎花［
【平角包臀 10A抑菌】1;L【推荐10
0-120斤】］
7天价保 不支持7天无理由 假一赔四〉＞
实付价¥36.65 价格明细＞
申请售后
¥49.9
×1
合计 共减¥13.25
加入购物车
¥36.65~
订单信息共8项
订单保障
共5项
4808542572686007415复制
凭据：2025年10月14日下单交易快照＞
```

- OCR purchaseDate=`2025-10-14` strategy=`snapshot_full_year` snippet=`2025年10月14日下单交易快照`

### merged result

```json
{
  "category": "裤装",
  "color": "花色",
  "price": "¥49.90",
  "season": "",
  "purchaseDate": "2025-10-14",
  "sources": {
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

### label

```json
{
  "category": "内裤",
  "color": "咖啡丹",
  "price": 36.65,
  "season": "全年",
  "purchaseDate": "2025-10-14"
}
```

### diff 分类

- compareSource: `items[0]`
- purchaseDateCompareSource: `top-level fallback`
- **category** `value_mismatch`: 标准 `"内裤"` → merged `"裤装"`
- **color** `value_mismatch`: 标准 `"咖啡丹"` → merged `"花色"`
- **season** `missing`: 标准 `"全年"` → merged `"(缺失或未解析)"`
- **price** `value_mismatch`: 标准 `36.65` → merged `"¥49.90"`

---

## Case `tshirt_001`

### Vision raw

```
{  
  "imageType": "order",  
  "itemCount": 1,  
  "items": [ {  
    "skuLabel": "",   
    "name": "在宇间工作室蚊子印花T恤",  
    "category": "上衣",  
    "price": "¥71.10",  
    "colorRaw": "白色",  
    "color": "白",  
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

- visionOk=true parseOk=true fields: category=`上衣` color=`白` price=`¥71.10` season=`(空)` (vision purchaseDate=`(空)`)

### OCR raw

```
17:52
43分
<
交易关闭
超时关闭
•••
董 86-199****4767 桃浦五村杜鹃苑绿杨路..v
在宇间工作室
88VIP好评率99%，平均4小时退款
这是一只假蚊子，不信你打我试
试|在宇间工作室蚊子印花T恤
白色； （130-160斤）
退货宝 极速退款 7天无理由退货＞
实付价¥71.1 价格明细＞
进店逛逛＞
^
¥79
×1
应付款 共减¥7.9
加入购物车
¥71.1
订单信息共4项、
订单保障 共5项
4334094540136007415
复制
凭据：2025年5月11日下单交易快照＞
comfortable
小贵！
但特柔软！！
新升级款chao软舒适感
客服
删除订单
加入购物车
再买一单
```

- OCR purchaseDate=`2025-05-11` strategy=`snapshot_full_year` snippet=`2025年5月11日下单交易快照`

### merged result

```json
{
  "category": "上衣",
  "color": "白",
  "price": "¥71.10",
  "season": "",
  "purchaseDate": "2025-05-11",
  "sources": {
    "category": "vision",
    "color": "vision",
    "price": "vision",
    "season": "vision",
    "purchaseDate": "ocr"
  }
}
```

### label

```json
{
  "category": "上衣",
  "color": "白色",
  "price": 71.1,
  "season": "夏",
  "purchaseDate": "2025-05-11"
}
```

### diff 分类

- compareSource: `items[0]`
- purchaseDateCompareSource: `top-level fallback`
- **color** `semantic_match`: 标准 `"白色"` → merged `"白"`
- **season** `missing`: 标准 `"夏"` → merged `"(缺失或未解析)"`
- **price** `format_mismatch`: 标准 `71.1` → merged `"¥71.10"`

---

## 对 Beta2 的建议（评估结论，非实现）

1. **purchaseDate** 应由 OCR+规则负责；本合并报告中日期通道独立于 Vision。
2. **category / color / price / season** 继续由 Vision 负责，可叠加枚举约束实验（A）降低越界。
3. 若合并后字段完整度明显优于单通道 Vision，则 Beta2 适合采用 **Vision + OCR 双链路**（另开产品 PR 接入，本实验不改生产）。
