# wardrobe-entry 端到端衣橱条目评测数据

模拟真实流程：**订单截图 → AI 完整衣橱条目 → 对照人工 gold**。  
方案细节见 `reports/wardrobe-entry-eval-plan.md`。

**约束：** 人工准备数据；不抓取线上用户图；本阶段只建目录与模板，不跑 eval、不改生产。

## 目录

```text
wardrobe-entry/
  images/     # 真实订单截图（与 label 同名 id）
  labels/     # 人工 gold
  README.md
```

第一阶段目标规模：**20～30** 张（本步不生成图片，仅预留结构）。

## 图片要求

- 应为**真实订单截图**（可脱敏后放入本地，勿提交隐私）。
- 尽量保留：**商品主图、标题、价格、订单信息**（含可辨认的下单/交易快照区更佳）。
- 文件名：`images/<id>.jpg|png|webp`，与 `labels/<id>.json` 同 id。

## Label（人工 gold，不是 AI 结果）

复制 `TEMPLATE.json` → `labels/<id>.json`：

```json
{
  "name": "",
  "category": "",
  "color": "",
  "price": "",
  "purchaseDate": "",
  "season": "",
  "notes": ""
}
```

| 字段 | 口径 |
|------|------|
| `name` | 期望入库的衣物名（可简化，非必须与电商全文一致） |
| `category` | 品类 gold |
| `color` | 颜色 gold（建议对齐产品标准色，不确定留空） |
| `price` | 实付价事实（数字或与截图一致的金额） |
| `purchaseDate` | **事实字段** `YYYY-MM-DD`；图上无日期则留空（未来评测假设 OCR 提取，不依赖 Vision 单独认日期） |
| `season` | **穿着/适用季** gold（`春`/`夏`/`秋`/`冬`/`全年`）；**不要**按购买月份直接标注 |
| `notes` | 备注：强季节/全年、提前购、价格格式、有无订单日期等 |

### 填写原则

- label 一律人工确认；不确定留空，禁止猜测。
- 全年品类（内衣、内裤、袜、打底等）`season` 填 **「全年」**。
- 强季节商品按适用季填（如羽绒服→冬，凉鞋→夏），即使购买月不一致。

## 覆盖建议（20～30 张）

**品类：** 上衣、裤装、内衣/内裤、鞋、外套；包/配饰（若产品枚举支持）。  
**其它维度：** 强季节 / 全年；多种颜色；不同价格格式（`¥`/小数）；有订单日期 / 无订单日期。

## 示例

`labels/example.json` 为虚拟案例。正式跑测前请移走或改名 `TEMPLATE.json` / `example.json`。

## 本阶段不做

- 不创建真实测试图  
- 不跑 runner、不改 Prompt / 业务代码  
