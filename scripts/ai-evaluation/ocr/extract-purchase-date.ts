/**
 * purchaseDate 规则抽取（评测用，不进生产）
 * 优先：「下单交易快照 / 交易快照 / 成交快照」前的日期
 */
export type DateExtractResult = {
  purchaseDate: string | null;
  matchedSnippet: string | null;
  strategy: 'snapshot_full_year' | 'snapshot_md_current_year' | 'none';
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function currentYear(): number {
  return new Date().getFullYear();
}

/** 归一化 OCR 噪音：全角数字、异体括号等 */
export function normalizeOcrText(text: string): string {
  return String(text || '')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[：:]/g, '：')
    .replace(/[＞>]/g, '>')
    .replace(/\s+/g, '');
}

/**
 * 从 OCR 全文提取 purchaseDate
 */
export function extractPurchaseDateFromOcr(
  rawText: string,
  opts?: { nowYear?: number },
): DateExtractResult {
  const year = opts?.nowYear ?? currentYear();
  const text = normalizeOcrText(rawText);
  if (!text) return { purchaseDate: null, matchedSnippet: null, strategy: 'none' };

  // 优先：…日期…(下单)?交易快照 / 成交快照
  const snapRe =
    /(\d{4})年(\d{1,2})月(\d{1,2})日(?:下单)?(?:交易|成交)?快照|(\d{1,2})月(\d{1,2})日(?:下单)?(?:交易|成交)?快照/g;

  let m: RegExpExecArray | null;
  const hits: DateExtractResult[] = [];
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

  // 次优：凭据：…日期…快照（允许中间夹字）
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
