# AI Vision 稳定性 Baseline

- **suiteId:** `20260814-194320`
- **promptSource:** `src/wardrobe/app.ts#AI_PROMPT`
- **promptVersion:** `1a9a9f12d33b`
- **API:** Worker `/ai/vision`（生产同源）
- **方法:** 每张图上传 1 次 R2 URL，同一 Prompt 连续调用 Vision 5 次
- **原始数据:** `reports/raw/20260814-194320-stability/stability.json`
- **结论前提:** 波动来自 Vision LLM 概率性输出，非单纯 Prompt 文案问题

## 测试图片

| id | 本地文件 |
|----|----------|
| `bra_001` | `datasets/image-recognition/images/bra_001.jpg` |
| `tshirt_001` | `datasets/image-recognition/images/tshirt_001.jpg` |

## bra_001（5 次）

| runId | purchaseDate | category | color | price |
|-------|--------------|----------|-------|-------|
| `20260814-194320-bra_001-r1` | 空 | bra | 米色 | ¥73.15 |
| `20260814-194320-bra_001-r2` | 空 | 上衣 | 其他 | ¥73.15 |
| `20260814-194320-bra_001-r3` | 空 | bra | 米色 | ¥73.15 |
| `20260814-194320-bra_001-r4` | 空 | 内衣 | 其他 | ¥73.15 |
| `20260814-194320-bra_001-r5` | 空 | 上衣 | 其他 | ¥73.15 |

- 唯一字段组合数：**3 / 5**
- **存在随机波动**

## tshirt_001（5 次）

| runId | purchaseDate | category | color | price |
|-------|--------------|----------|-------|-------|
| `20260814-194320-tshirt_001-r1` | 空 | 上衣 | 白 | ¥79 |
| `20260814-194320-tshirt_001-r2` | 空 | 上衣 | 白 | ¥79 |
| `20260814-194320-tshirt_001-r3` | 空 | 上衣 | 空 | ¥79 |
| `20260814-194320-tshirt_001-r4` | 空 | 空 | 空 | 空 |
| `20260814-194320-tshirt_001-r5` | 空 | 上衣 | 白 | ¥79 |

- 唯一字段组合数：**3 / 5**
- **存在随机波动**

## 字段稳定性结论

| 字段 | 稳定性 | 说明 |
|------|--------|------|
| **price** | 相对稳定 | bra 5/5 均为 ¥73.15；tshirt 成功时均为 ¥79；偶发整段为空（tshirt r4） |
| **category** | 不稳定 | bra 在 `bra` / `上衣` / `内衣` 间跳变；tshirt 多数 `上衣`，偶发空 |
| **color** | 不稳定 | bra：`米色` / `其他`；tshirt：`白` / 空 |
| **purchaseDate** | 本轮未识别 | 两图合计 10 次均为空（另有多轮 Prompt 实验表明偶发可抽到，但不稳定） |
| **整段字段** | 偶发失败 | tshirt r4：category/color/price 同时为空 |

## 对后续评测的含义

1. 单次 `ai:test` 的 pass/fail **不能**单独代表 Prompt 优劣，需结合重复调用或报告中的波动标注。
2. 继续堆叠 purchaseDate Prompt（R2–R4）收益有限；应用稳定性视角重新评估字段策略。
3. 报告系统应区分：「未识别 / 格式差 / 随机波动」，避免只看字符串 diff。
