# image-recognition 测试数据

人工准备「图片 + 标准答案 label」，供 `npm run ai:test` 调用线上 Worker `/ai/vision` 做对照。  
**不要**自动抓取用户数据；本目录只放你主动放入的评测样例。

第一阶段只验证 **核心识别准确性**（品类 / 颜色 / 季节 / 价格 / 购买日期），不要求填写内部结构字段。

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
| `images/shirt-white.png` | `labels/shirt-white.json` |

运行时会优先把本地图上传到 Worker `/upload-image`，再调 `/ai/vision`。

## labels 如何命名

1. 复制 `labels/TEMPLATE.json` → `labels/<id>.json`
2. `<id>` 与 `images/<id>.*` 完全一致
3. **只填人工能确认的标准答案**；不确定的保持 `""`
4. **不要求每个字段都有值**——图上没有价格/日期就留空
5. 可参考 `labels/example.json`（格式示例，不是真实衣物）

正式跑测前建议暂时移走或改名 `TEMPLATE.json` / `example.json`，避免被当成用例执行。

## label 字段（第一阶段核心）

只保留人工验证用的 5 个字段。取值约定对齐生产 `AI_PROMPT`（`src/wardrobe/app.ts`）：

| 字段 | 含义 | 填写约定 |
|------|------|----------|
| `category` | 品类 | 只能：`上衣` `裤装` `裙装` `连衣裙` `外套` `鞋` `包` `配饰`；不确定留空 |
| `color` | 标准色 | `黑` `白` `灰` `米` `卡其` `棕` `藏蓝` `军绿` `酒红` `粉` `黄` `绿` `蓝` `紫` `花色` `其他`；不确定留空 |
| `season` | 季节 | 只能：`春` `夏` `秋` `冬` 或空 |
| `price` | 价格 | 订单实付等图上明确金额；没有就留空，禁止编造 |
| `purchaseDate` | 购买日期 | 图上可见日期（如 `M月D日` / `MM-DD`）；没有就留空，勿编造年份 |

模板：

```json
{
  "category": "",
  "color": "",
  "season": "",
  "price": "",
  "purchaseDate": ""
}
```

第一阶段 **不要求** 填写：`imageType`、`name`、`fabric`、`cropSuggestion`、`items` 等内部/结构字段。报告里仍会保存 AI 原始完整输出，便于事后查阅。

## 人工填写方法

1. 图片放入 `images/<id>.jpg`
2. 复制 `TEMPLATE.json` 为 `labels/<id>.json`
3. 只填你能确认的字段；其余留空
4. 根目录执行 `npm run ai:test`
5. 打开 `reports/latest-report.md`，对照 AI 输出与 label，人工勾选 pass/fail

## 快速开始

```bash
cp ~/Desktop/my-shirt.jpg scripts/ai-evaluation/datasets/image-recognition/images/shirt-001.jpg

cp scripts/ai-evaluation/datasets/image-recognition/labels/TEMPLATE.json \
   scripts/ai-evaluation/datasets/image-recognition/labels/shirt-001.json
# 编辑 shirt-001.json，只填能确认的标准答案

npm run ai:test
```
