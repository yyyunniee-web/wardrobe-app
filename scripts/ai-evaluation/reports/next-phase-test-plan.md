# AI Eval 下一阶段测试计划（方案，未实现）

基于：`AI-stability-baseline.md`（suiteId `20260814-194320`）及 purchaseDate 多轮实验（R2–R4、生产对照）。

**约束：** 实验仅允许改 `scripts/ai-evaluation/**`（评测 Prompt / 报告逻辑）；**不改** `src/**`、Worker、生产 `AI_PROMPT`、线上 AI 流程。

---

## A. 字段约束优化实验

### 目标

验证：在 **evaluation Prompt** 中收紧枚举，是否降低 category / color 的随机跳变（提高同图 N 次调用的一致率）。

### 假设

当前波动部分来自开放/半开放取值（如 `bra` vs `内衣`、`米色` vs `其他`）。强制封闭枚举可减少合法输出空间，提高稳定性。

### 实验设计（只改评测 Prompt）

1. 新增评测文件，例如：  
   `prompts/image-recognition.enum-constraint-exp.txt`  
   基于生产 Prompt 副本，**仅**强化：
   - `category` **只能**输出：  
     `上衣` | `裤装` | `裙装` | `鞋` | `内衣` | `配饰` | `其他`  
     （可按衣橱实际再对齐；禁止英文如 `bra`、禁止自造）
   - `color` **只能**输出生产标准色表（黑/白/灰/米/卡其/…/其他）；`colorRaw` 可保留自然语言
2. **对照：** 生产 Prompt baseline（`promptVersion=1a9a9f12d33b`）
3. **样本：** 至少 `bra_001`、`tshirt_001`（波动已证实）；可选加 `shoes-001`、`shorts001`
4. **协议：** 同图上传 1 次 URL → Vision **连续 5 次**（与稳定性 baseline 同协议）
5. **指标（人工/脚本均可，阶段可不实现自动）：**
   - 每字段「唯一取值数 / 5」
   - 越界率（非枚举值占比）
   - 相对 baseline 的一致率是否提升
6. **成功标准（建议）：** category 唯一取值数 ≤2/5，且越界率显著下降；不要求一次完美对齐 label

### 明确不做

- 不把枚举直接合入生产 `app.ts`
- 不为了稳定性同时大改 price / purchaseDate 规则

---

## B. purchaseDate 单独能力评估（停无限优化 Prompt）

### 背景

- 稳定性测试：10/10 空
- Prompt 强化（区域扫描、固定「交易快照」文案）：命中率在 1/4～2/4 间抖动，且同图不稳定
- 图上日期往往在底部「凭据 / 下单交易快照」小字

### 目标

验证：**订单日期是否应拆成 OCR（或专用文本抽取）能力**，而非继续依赖多模态 Vision 自由生成 JSON。

### 实验设计（方案级）

**B1. 能力拆分对照（推荐）**

| 臂 | 输入 | 期望输出 |
|----|------|----------|
| Vision-only（现状） | 整图 + 生产/现有评测 Prompt | `purchaseDate` |
| OCR → 规则 | 先 OCR 全文（或裁剪底部「订单保障」带）→ 正则匹配 `(年月日\|\d+月\d+日).{0,8}(下单)?交易快照` 等 | `purchaseDate` |
| Vision 只读图 + OCR 只填日期 | Vision 填品类/色/价；日期字段 **仅** 由 OCR 规则写入 | 合成入库字段 |

**B2. 数据集**

- 现有 4 张订单图（日期位置已知）
- 建议补 5～10 张：仅月日 / 含年 / 无快照文案 / 模糊底部（人工 label `purchaseDate`）

**B3. 指标**

- 命中率（对 label）
- 假阳性（把「2025新款」当日期）
- 同图 5 次 OCR 规则是否 **确定性**（期望 5/5 一致）

**B4. 决策规则**

- 若 OCR+规则 同图稳定 ≥4/5 且命中显著高于 Vision-only → **建议生产侧日期走 OCR/规则，Vision 不再主责 purchaseDate**
- 若 OCR 也读不到底部小字 → 先做 **区域裁剪 / 更高分辨率** 再判，而不是再改 Prompt

### 明确不做

- 不再开 R5/R6 纯 Prompt 堆叠实验（除非 OCR 对照证明「文案规则有效但 Vision 读不到字」）

---

## C. 报告系统增强

### 问题

当前 `latest-report.md` 以字符串 diff 为主，无法区分：

1. **AI 没识别**（字段空 / 缺失）
2. **AI 识别但格式不同**（如 `73.15` vs `¥73.15`，`白色` vs `白`）
3. **AI 随机波动**（同图多次结果不一致；单次报告看不到）

### 方案（只写设计）

**C1. Diff 分类标签（单次 run）**

对每个对比字段输出 `diffKind`：

| kind | 条件示例 |
|------|----------|
| `missing` | AI 空，label 有值 |
| `format_mismatch` | 规范化后相等（去 `¥`、去空格、同义色映射）但原文不等 |
| `value_mismatch` | 规范化后仍不等 |
| `match` | 一致 |
| `parse_error` | JSON 无法解析 |

报告示例：

```text
- price: format_mismatch | label 73.15 → AI ¥73.15
- purchaseDate: missing | label 2025-12-09 → AI (空)
- category: value_mismatch | label 内衣 → AI bra
```

**C2. 稳定性附注（可选第二产物）**

- `npm run ai:stability`（未来）：同图 N 次 → 写入 `reports/stability-<suiteId>.md`
- 单次 `ai:test` 报告头部引用最近稳定性 baseline：  
  `category: unstable (see AI-stability-baseline.md)`

**C3. purchaseDate 单独区块**

- 标明 `purchaseDateCompareSource`
- 若 raw 中无任何日期字符且 label 有值 → 归类 `missing`（能力缺口），避免与 format 混淆

### 实现边界

- 仅 `scripts/ai-evaluation/generate-report.ts` / `lib/dataset.ts` 等评测侧
- 规范化表（色同义、价格去符号）放评测 lib，**不**改生产解析

---

## 建议执行顺序

1. **C 报告分类（小步）** — 让后续 A/B 实验可读  
2. **A 枚举约束稳定性实验** — 低成本，验证 Prompt 侧能否压波动  
3. **B OCR 对照** — 为 purchaseDate 产品决策提供证据，停止无效 Prompt 轮次  

## 成功后的产品含义（仍不实现）

- A 有效 → 再考虑把枚举约束合入生产 Prompt（另开业务 PR）  
- B 有效 → 衣橱入库日期链路改为 OCR/规则，Vision 专注品类/色/价  
- 无论 A/B：评测默认带「波动」意识，避免单次 run 误判上线
