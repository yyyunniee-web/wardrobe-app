# 端到端衣橱条目评测方案

**状态：** 方案 + 数据结构（不跑测试、不改生产、不接线上）  
**数据目录：** `datasets/wardrobe-entry/`

---

## 1. 背景与范围调整

基于 `image-recognition`、OCR 日期、双通道与 `season-classifier` 前期结论：

| 结论 | 对端到端评测的含义 |
|------|-------------------|
| Vision 商品字段可用但不稳 | 端到端仍测 name/category/color/price |
| purchaseDate 应走 OCR | 日期通道与 Vision 解耦；评测假设 OCR |
| 买时推 season 不可作主规则 | season 只作综合观察字段，gold=适用季 |
| 单测 season 暂缓 | 本阶段不单独优化 season 模型 |

**本方案目标：** 模拟用户上传订单截图 → 得到完整衣橱条目 → 与人工 gold 对比。

---

## 2. 用户流程（评测模拟）

```text
用户上传订单截图
（主图 + 标题 + 价格 + 订单信息）
        ↓
   ┌────┴────┐
Vision     OCR（假设）
商品字段    purchaseDate
   └────┬────┘
        ↓
  合并为衣橱条目
        ↓
  对照 labels gold
```

评测字段：

```json
{
  "name": "",
  "category": "",
  "color": "",
  "price": "",
  "purchaseDate": "",
  "season": ""
}
```

---

## 3. 字段口径

| 字段 | 来源假设（未来实现时） | Gold 口径 |
|------|----------------------|-----------|
| name / category / color / price | Vision（可叠加枚举约束实验） | 人工可入库值 |
| purchaseDate | **OCR + 交易快照规则**，不依赖 Vision 单独认日期 | 截图事实；无则空 |
| season | **综合观察**（Vision 或属性规则等）；**不**用购买月直接标注 | 穿着/适用季；全年类填「全年」 |

diff 分类沿用实验 C：`missing` / `format_mismatch` / `semantic_match` / `value_mismatch` / `parse_error`。

---

## 4. 数据集（第一阶段）

- 规模：**20～30** 张真实订单截图（本地人工放入 `images/`，本步不生成图）。
- 覆盖品类：上衣、裤装、内衣/内裤、鞋、外套；包/配饰（若产品支持）。
- 覆盖维度：强季节 / 全年；多色；价格格式多样；有/无订单日期。

模板：`datasets/wardrobe-entry/labels/TEMPLATE.json`  
说明：`datasets/wardrobe-entry/README.md`

---

## 5. 未来实现顺序（非本轮）

1. 人工填满 20～30 组图 + label  
2. 新增 runner：Vision 商品字段 + OCR 日期 → 合并 → 报告  
3. season 仅统计观察指标，不单独作为上线门禁，直至属性臂方案成熟  

---

## 6. 明确不做（本阶段）

- 不改 `src/**` / Worker / 生产 Prompt  
- 不跑测试、不生成图片、不改现有 runner/Prompt  
