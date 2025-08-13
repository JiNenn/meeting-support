export type KeywordRule = { pattern: RegExp; tag: string; weight: number };

export const KEYWORDS: KeywordRule[] = [
  { pattern: /(バックエンド|API|Prisma|DB|データベース|認証|OAuth|JWT)/i, tag: 'backend',  weight: 3 },
  { pattern: /(フロント|UI|React|Next|TypeScript|Tailwind)/i,             tag: 'frontend', weight: 3 },
  { pattern: /(データ|分析|SQL|ETL|BI|レポート)/i,                        tag: 'data',     weight: 2 },
  { pattern: /(インフラ|CI|CD|Docker|Kubernetes|AWS|GCP)/i,                tag: 'infra',    weight: 2 },
  { pattern: /(PM|プロマネ|要件|進行|スケジュール|調整)/i,                 tag: 'pm',       weight: 2 },
  { pattern: /(UX|デザイン|プロトタイプ|ワイヤー)/i,                      tag: 'design',   weight: 1 },
  { pattern: /(Gmail|カレンダー|Calendar|Google\s?Tasks|Google)/i,        tag: 'google',   weight: 1 },
];

export function extractPurposeTags(text: string): { tags: Set<string>, hits: {tag:string; weight:number}[] } {
  const tags = new Set<string>();
  const hits: {tag:string; weight:number}[] = [];
  for (const r of KEYWORDS) {
    if (r.pattern.test(text)) {
      tags.add(r.tag);
      hits.push({ tag: r.tag, weight: r.weight });
    }
  }
  return { tags, hits };
}
