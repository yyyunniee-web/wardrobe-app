# Beta2 release readiness review

**状态:** Candidate review（评测结论汇总；**未改** `src/**`；**停止**继续调 prompt）  
**数据集:** `datasets/wardrobe-entry`（8 regression cases）  
**候选定义 (Beta2.2):**

- Vision = 生产 `AI_PROMPT` 原文  
  + category 商品主体优先 ×3（Beta2.1）  
  + 字段独立性 ×3（Beta2.2）  
- `purchaseDate` = 既有 OCR merge（与 Vision 解耦）

**对照 (Beta1):** 线上生产 `AI_PROMPT` Vision-only（无 OCR date merge、无 product-focus 增量）

证据来源（既有报告，不再重跑）：

| 报告 | 用途 |
|------|------|
| `wardrobe-entry-ocr-isolation-report.md` | OCR 不扰动商品字段 |
| `category-product-focus-ab.md` / `beta2.1-merge-isolation.md` | category 主体优先有效 |
| `beta22-color-isolation.md` | Beta2.2 相对 2.1；color 回升 |
| `beta2-final-regression.md` | 全文替换 prompt 会伤 color/price（已弃用该路径） |

---

## 1. Beta1 vs Beta2.2 总表

口径：usable = exact + format_mismatch + semantic_match。  
Beta1 取自 `beta2.1-merge-isolation` A 臂；Beta2.2 取自 `beta22-color-isolation` B 臂（同数据集、同 usable 定义）。

| 字段 | Beta1 | Beta2.2 | Δ | 备注 |
|------|-------|---------|---|------|
| **category** | 50% (4/8) | **87.5%** (7/8) | **+37.5** | 主收益 |
| **color** | 37.5% (3/8) | **37.5%** (3/8) | **0** | 与 Beta1 相当 |
| **price** | 62.5% (5/8) | **62.5%** (5/8) | **0** | 与 Beta1 相当 |
| **purchaseDate** | 14.3% (1/7) | **100%** (7/7) | **+85.7** | OCR merge |
| **parse** | 100% (8/8) | 100% (8/8) | 0 | 无回归 |
| **season** | ~12.5%（历史臂） | 未作上线门禁 | — | 见 P2 |

补充（同次 Beta2.2 跑内相对 Beta2.1）：

| 字段 | Beta2.1 | Beta2.2 | 说明 |
|------|---------|---------|------|
| category | 75% | 87.5% | 保持并略升 |
| color | 25% | 37.5% | 独立性约束后回升至 ≈Beta1 |
| price | 75% | 62.5% | 单次波动回到 ≈Beta1；见已知限制 |
| purchaseDate | 100% | 100% | OCR 保持 |

---

## 2. P0 / P1 / P2 字段分类

| 优先级 | 字段 | 上线态度 | 依据 |
|--------|------|----------|------|
| **P0** | `purchaseDate` | 必须带 OCR merge | Isolation：日期 0%→100%，且 A≡B 商品字段；Beta2.x 稳定 100% |
| **P0** | `category` | 必须带 product-focus 最小增量 | Beta1 50%→Beta2.2 87.5%；bra_* 主痛点基本解决 |
| **P1** | `color` | 可上线，需监控 | 相对 Beta1 持平；仍受 Vision 波动与 gold 细粒度（如「黑珍珠」）影响 |
| **P1** | `price` | 可上线，需监控 | 相对 Beta1 持平；单次 run 间可 ±12.5pp |
| **P1** | JSON parse | 守门 | 本轮系列均为 100%；全文换 prompt 时曾恶化——故坚持「生产原文 + 最小追加」 |
| **P2** | `season` | **不阻塞上线** | 准确率低；适用季 ≠ 购买月；后续独立方案 |
| **P2** | `name` | 不阻塞 | 语义接近但 exact 低；录入可改 |

---

## 3. 已解决问题

### 3.1 purchaseDate → OCR

- Vision-only 日期不可用（常空或格式不稳）。
- OCR isolation：同一 Vision 输出上 merge 日期 → **100%**，category/color/price **字节级不变**。
- 结论：**日期通道与 Vision 解耦**；Beta2 必须保留 OCR merge。

### 3.2 category → product-focus（最小增量）

- 生产枚举长期缺「内衣」语义出口；模特/场景易把 bra 判成上衣/裙装。
- 在生产原文上只追加三条主体优先规则（**不用**全文 `category-product-focus-exp.txt`）：category **+37.5pp**（50%→87.5%）。
- bra_*：Beta2.1/2.2 路径下可稳定落到「内衣」（相对 Beta1 的上衣/裙装误判）。
- 全文替换 hierarchy/product-focus prompt（早期 Beta2 final）会伤 color/price → **已否决**；采用最小 patch。

---

## 4. 已知限制

### 4.1 season

- 当前 Vision season 与 gold「适用季」不对齐；不能从购买月硬推。
- **明确不作为 Beta2 上线阻塞**；后续独立分类器/规则另开。

### 4.2 Vision 字段随机波动

- 同 prompt、同图多次调用：category/color/price 仍可抖（历史 5-repeat、以及 2.1↔2.2 单次 price 75%↔62.5%）。
- n=8 下 ±12.5pp = 1 case，解读需谨慎。
- color gold 偏细（黑珍珠/香槟色等）时，模型常出「黑/其他」→ usable 偏低但产品仍可用。

### 4.3 其它

- `连衣裙` vs `裙装` 仍可能偶发（如 basic-house）。
- 多商品/退款截图（`order_multi_refund_001`）日期 OCR 可能为空（gold 亦空）——属边界，非回归。
- OCR 依赖客户端/评测侧能力；上线需确认生产路径具备同等 merge，而非只改 prompt。

---

## 5. 发布建议

### 是否建议替代 Beta1？

**有条件建议：用 Beta2.2 能力集替代 Beta1，但不要「一次性全量切 prompt+OCR 无观测」。**

理由：

| 赞成 | 保留 |
|------|------|
| P0 category / purchaseDate 收益大且机制清晰 | color/price 仅「相当」非增强 |
| OCR isolation 证明日期 merge 安全 | Vision 波动 + n=8 |
| 最小增量路径已避开全文 prompt 的 color/price 崩盘 | season / name 仍弱；生产还需接线 OCR |

**不建议**回退到「全文 `category-product-focus-exp.txt`」方案（Beta2 final 已证 color/price 大退化）。

### 是否需要灰度？

**需要。**

建议灰度姿态：

1. **先灰 OCR `purchaseDate` merge**（风险最低，isolation 已证不伤商品字段）。  
2. **再灰 Vision 最小增量**（product-focus×3 + 字段独立性×3，贴在生产 `AI_PROMPT` 后，不换全文）。  
3. 灰度期盯：category（尤其 bra_*）、color 空值率、price 偏离、parse 失败率。  
4. 设回滚：仅关 prompt 追加 / 仅关 OCR merge 可独立回滚。  
5. season 维持现状，不绑灰度成功标准。

### 一句话结论

> **Beta2.2（生产原文 + 最小 category/独立性追加 + OCR 日期）在 P0 上明显优于 Beta1，P1 与 Beta1 相当；建议灰度替代，而非继续调 prompt，亦非无观测全量切换。**

---

## 6. 候选能力清单（冻结）

上线实现应对齐评测定义（实现属后续工程，**本文件不改代码**）：

1. `purchaseDate`：OCR 抽取后 merge（覆盖 Vision 日期）。  
2. Vision prompt：生产 `AI_PROMPT` + Beta2.1 三条 product-focus + Beta2.2 三条字段独立性。  
3. **不再**追加新 category 规则；**停止**本轮 prompt 调参。  
4. season：明确非阻塞，单列 backlog。
