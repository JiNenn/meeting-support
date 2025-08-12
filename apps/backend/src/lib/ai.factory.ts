import { ManualProvider, NoopProvider } from './ai.providers';
import type { AIProvider } from './ai.types';

export function getAI(): AIProvider {
  const mode = process.env.LLM_MODE ?? 'off';
  if (mode === 'manual') return new ManualProvider();
  if (mode === 'api') {
    // 後日 OpenAIProvider に差し替え
    return new NoopProvider();
  }
  return new NoopProvider();
}
