import type { AIProvider, AIResult } from './ai.types';

export class ManualProvider implements AIProvider {
  async suggestConcise(t: string): Promise<AIResult<string>> {
    return { prompt: `以下を1文で穏当な表現に要約：\n---\n${t}\n---` };
  }
  async generatePreQuestions(title: string, purpose: string): Promise<AIResult<string[]>> {
    return { prompt: `会議\nタイトル: ${title}\n目的: ${purpose}\n想定Qを日本語で3-5個の箇条書きで。` };
  }
  async polishText(t: string): Promise<AIResult<string>> {
    return { prompt: `次の議事録を日本語で読みやすく整形し、誤字を修正して返して：\n---\n${t}\n---` };
  }
}

export class NoopProvider implements AIProvider {
  async suggestConcise(t: string) { return { output: `（要約案）${t.slice(0,120)}` }; }
  async generatePreQuestions() { return { output: ['成功条件は？','阻害要因は？'] }; }
  async polishText(t: string) { return { output: t.trim().replace(/\n{3,}/g,'\n\n') }; }
}
