# purchaseDate OCR 实验（评测专用）

本目录用于实验 B：对照 Vision-only vs OCR+规则，**不接入生产**。

## 组件

| 文件 | 作用 |
|------|------|
| `vision-ocr.swift` | macOS Vision 框架本地 OCR |
| `extract-purchase-date.ts` | 日期规则（优先交易快照） |
| `../run-purchaseDate-ocr-eval.ts` | 跑对照实验 |

## 构建 OCR 二进制

```bash
swiftc -O scripts/ai-evaluation/ocr/vision-ocr.swift \
  -o scripts/ai-evaluation/ocr/vision-ocr
```

二进制已 gitignore（平台相关）。
