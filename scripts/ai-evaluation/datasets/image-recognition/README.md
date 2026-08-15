# image-recognition 测试数据

人工准备「图片 + 标准答案 label」，供 `npm run ai:test` 调用线上 Worker `/ai/vision` 做对照。  
**不要**自动抓取用户数据；本目录只放你主动放入的评测样例。

评测目标不是单纯图片分类，而是验证 AI 能否生成 **可进入衣橱的数据**。  
label 字段贴近衣橱录入页核心字段。

## 目录结构

```text
image-recognition/
  images/          # 测试图片（gitignore，需本地自备）
  labels/          # 与图片一一对应的标准答案 JSON
  README.md        # 本说明
```

## images 放什么

- 放你要评测的图片：订单截图、商品图、单品照、穿搭照均可。
- 支持扩展名：`.jpg` / `.jpeg` / `.png` / `.webp` / `.gif`
- **文件名（不含扩展名）= 用例 id**，必须与 label 文件名一致。

示例：

| 图片 | label |
|------|--------|
| `images/order-001.jpg` | `labels/order-001.json` |
| `images/shoe-beige.png` | `labels/shoe-beige.json` |

运行时会优先把本地图上传到 Worker `/upload-image`，再调 `/ai/vision`。

## labels 如何命名

1. 复制 `labels/TEMPLATE.json` → `labels/<id>.json`
2. `<id>` 与 `images/<id>.*` 完全一致
3. 可参考 `labels/example.json`（虚拟案例，不是真实用户数据）

正式跑测前建议暂时移走或改名 `TEMPLATE.json` / `example.json`，避免被当成用例执行。

## label 字段

```json
{
  "name": "",
  "category": "",
  "color": "",
  "season": "",
  "scenes": [],
  "fabric": "",
  "price": "",
  "purchaseDate": ""
}
```

| 字段 | 含义 | 填写约定 |
|------|------|----------|
| `name` | 商品名称 / 衣物名称 | 如「云朵洞洞鞋」「好奇蜜斯内衣」；看不清留空 |
| `category` | 品类 | 如鞋、内衣、上衣、裤子、裙子；建议对齐生产枚举：`上衣` `裤装` `裙装` `连衣裙` `外套` `鞋` `包` `配饰`；不确定留空 |
| `color` | 颜色 | 建议对齐标准色：`黑` `白` `灰` `米` `卡其` `棕` `藏蓝` `军绿` `酒红` `粉` `黄` `绿` `蓝` `紫` `花色` `其他`；不确定留空 |
| `season` | 季节 | `春` `夏` `秋` `冬`；没有确定信息留空 |
| `scenes` | 使用场景 | 数组，如 `["通勤","休闲"]`；可选：`通勤` `休闲` `约会` `旅行` `运动`；没有确定信息保持 `[]` |
| `fabric` | 面料 | 没有确定信息留空 |
| `price` | 购买价格 | 图上明确金额；没有留空，禁止编造 |
| `purchaseDate` | 购买日期 | **格式 `YYYY-MM-DD`**；没有完整信息不要猜（见下方日期规则） |

## 人工填写规则（重要）

- **只填写自己可以确认的信息**
- **不确定字段留空**（字符串用 `""`，`scenes` 用 `[]`）
- **不允许为了完整而猜测**
- 不要求每个字段都有值

### 购买日期规则

淘宝订单截图经常 **缺少年份**，例如：「4月20日下单」。

- 若截图 **只有月日、没有年份**，且当前测试年份为 2026，人工标准可以填写：

  `"purchaseDate": "2026-04-20"`

- 若截图 **明确显示年份**，例如「2025年4月20日」，必须填写：

  `"purchaseDate": "2025-04-20"`

  **不能**默认覆盖成当前年。

- 月日也看不清、或无法确认完整日期时，保持 `""`，不要猜。

## 人工填写方法

1. 图片放入 `images/<id>.jpg`
2. 复制 `TEMPLATE.json` 为 `labels/<id>.json`
3. 只填能确认的字段；其余留空
4. 根目录执行 `npm run ai:test`
5. 打开 `reports/latest-report.md`，对照 AI 输出与 label，人工勾选 pass/fail

## 快速开始

```bash
cp ~/Desktop/my-item.jpg scripts/ai-evaluation/datasets/image-recognition/images/item-001.jpg

cp scripts/ai-evaluation/datasets/image-recognition/labels/TEMPLATE.json \
   scripts/ai-evaluation/datasets/image-recognition/labels/item-001.json
# 编辑 item-001.json，只填能确认的标准答案

npm run ai:test
```
