export type AIResult<T> = { output?: T; prompt?: string };

export interface AIProvider {
  suggestConcise(input: string): Promise<AIResult<string>>;
  generatePreQuestions(title: string, purpose: string): Promise<AIResult<string[]>>;
  polishText(input: string): Promise<AIResult<string>>;
}
