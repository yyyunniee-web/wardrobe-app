/**
 * Beta2.2 最小增量（评测冻结定义）
 * - 不替换生产 AI_PROMPT 全文
 * - 仅追加 product-focus ×3 + 字段独立性 ×3
 * - purchaseDate OCR 抽取规则与评测 scripts/ai-evaluation/ocr/extract-purchase-date.ts 对齐
 */
export type VisionPipeline = 'beta1' | 'beta2';

export const AI_BETA_PRODUCT_FOCUS_PATCH = [
  '',
  '【category 商品主体优先·最小增量】',
  '1. category 判断以商品本体为准，不以模特穿搭、场景、搭配物为准。',
  '2. 文胸 / bra / 内衣 / 胸衣 / 运动内衣必须归类为「内衣」。',
  '3. 即使模特穿着环境出现裙子、裤子，也不能改变商品主体 category。',
].join('\n');

export const AI_BETA_FIELD_INDEPENDENCE_PATCH = [
  '',
  '【字段独立性·最小增量】',
  '1. category 判断规则只影响 category 字段，不得改变或清空 color / price 等其它字段。',
  '2. color 必须独立识别商品实际颜色（商品本体主色），与 category 判定解耦。',
  '3. 如果图片中有明确颜色信息（色名文案或可见主色），不允许因为 category 判断而跳过 color；应填写 color。',
].join('\n');

/** Beta2.2 = 生产原文 + 上述两段补丁（非全文替换） */
export function getVisionPrompt(basePrompt: string, pipeline: VisionPipeline): string {
  const base = String(basePrompt || '').trim();
  if (pipeline !== 'beta2') return base;
  return base + AI_BETA_PRODUCT_FOCUS_PATCH + AI_BETA_FIELD_INDEPENDENCE_PATCH;
}

export type OcrDateExtractResult = {
  purchaseDate: string | null;
  matchedSnippet: string | null;
  strategy: 'snapshot_full_year' | 'snapshot_md_current_year' | 'none';
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function normalizeOcrText(text: string): string {
  return String(text || '')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[：:]/g, '：')
    .replace(/[＞>]/g, '>')
    .replace(/\s+/g, '');
}

/** 从 OCR 全文提取 purchaseDate（与评测规则一致） */
export function extractPurchaseDateFromOcr(
  rawText: string,
  opts?: { nowYear?: number },
): OcrDateExtractResult {
  const year = opts?.nowYear ?? new Date().getFullYear();
  const text = normalizeOcrText(rawText);
  if (!text) return { purchaseDate: null, matchedSnippet: null, strategy: 'none' };

  const snapRe =
    /(\d{4})年(\d{1,2})月(\d{1,2})日(?:下单)?(?:交易|成交)?快照|(\d{1,2})月(\d{1,2})日(?:下单)?(?:交易|成交)?快照/g;

  let m: RegExpExecArray | null;
  const hits: OcrDateExtractResult[] = [];
  while ((m = snapRe.exec(text)) !== null) {
    const snippet = m[0];
    if (m[1] && m[2] && m[3]) {
      hits.push({
        purchaseDate: `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`,
        matchedSnippet: snippet,
        strategy: 'snapshot_full_year',
      });
    } else if (m[4] && m[5]) {
      hits.push({
        purchaseDate: `${year}-${pad2(Number(m[4]))}-${pad2(Number(m[5]))}`,
        matchedSnippet: snippet,
        strategy: 'snapshot_md_current_year',
      });
    }
  }
  if (hits.length) return hits[0];

  const credRe =
    /凭据：[^。\n]{0,40}?((\d{4})年(\d{1,2})月(\d{1,2})日|(\d{1,2})月(\d{1,2})日)[^。\n]{0,20}?快照/;
  const c = text.match(credRe);
  if (c) {
    if (c[2] && c[3] && c[4]) {
      return {
        purchaseDate: `${c[2]}-${pad2(Number(c[3]))}-${pad2(Number(c[4]))}`,
        matchedSnippet: c[0],
        strategy: 'snapshot_full_year',
      };
    }
    if (c[5] && c[6]) {
      return {
        purchaseDate: `${year}-${pad2(Number(c[5]))}-${pad2(Number(c[6]))}`,
        matchedSnippet: c[0],
        strategy: 'snapshot_md_current_year',
      };
    }
  }

  return { purchaseDate: null, matchedSnippet: null, strategy: 'none' };
}

/** OCR 完整 YYYY-MM-DD 直接采用（不强制改当前年） */
export function isIsoPurchaseDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}
