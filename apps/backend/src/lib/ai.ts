export async function suggestConcise(text: string): Promise<string> {
  // 本番は OpenAI で要約・言い換え。Key 未設定時はスタブ。
  const k = process.env.OPENAI_API_KEY;
  if (!k) return `（要約案）${text.slice(0, 120)}`;
  // ここに OpenAI 呼び出しを後で実装
  return `（AI案）${text.slice(0, 120)}`;
}

export async function generatePreQuestions(title: string, purpose: string): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) {
    return [
      `この会議の成功条件は何ですか？`,
      `決めるべき論点と、情報不足の点はどこですか？`,
    ];
  }
  return [
    `（AI）目的達成に向けた主要KPIは？`,
    `（AI）阻害要因と回避案は？`,
  ];
}

export async function polishText(input: string): Promise<string> {
  // 本番はOpenAI。ここは簡易整形（連続空行の圧縮など）にしておく
  return input.replace(/\n{3,}/g, '\n\n').trim();
}

