'use client';

import { useState } from 'react';

type Mode = 'honne' | 'minutes';

type MeetingCtx = {
  id: string;
  title: string;
  purpose: string;
  organizerEmail: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  meeting: MeetingCtx;
  sourceText?: string;         // minutes の元文や本音入力（任意）
  onApply: (resultText: string) => Promise<void>; // 反映ハンドラ（親が実装）
};

function buildPrompt(mode: Mode, mtg: MeetingCtx, sourceText?: string) {
  if (mode === 'honne') {
    return [
      'あなたは会議の事前アジェンダ調整を支援する編集者です。',
      '次のコンテキストを踏まえて、率直な意見を「相手に伝えるべき最小限」に要約し、',
      '箇条書き（最大3点）で、主張→根拠→提案の順に簡潔化してください。',
      '',
      `【会議】${mtg.title}`,
      `【目的】${mtg.purpose}`,
      `【提出者】${mtg.organizerEmail}`,
      '',
      '【本音メモ】',
      sourceText || '（ここに本音メモを貼り付け）',
      '',
      '【出力フォーマット】',
      '- 箇条書き（最大3点）',
      '- 先に伝えるべき結論を短く',
      '- 具体的な提案があれば1文で',
      '- 人や部署を責める表現は避け、事実＋影響＋提案に限定',
    ].join('\n');
  }

  // minutes
  return [
    'あなたは議事録の校正者です。事実を変えずに、文法と構成を整え、箇条書きと見出しで読みやすくしてください。',
    '不要な言い換えは避け、固有名詞と数値・決定事項は厳密に保持します。',
    '',
    `【会議】${mtg.title}`,
    `【目的】${mtg.purpose}`,
    '',
    '【元の議事録（Markdown想定）】',
    sourceText || '（ここに元の議事録を貼り付け）',
    '',
    '【出力フォーマット】',
    '# タイトル（据置）',
    '## 決定事項',
    '## ToDo（担当・期日）',
    '## 議論の要点',
    '## 補足',
  ].join('\n');
}

export default function ManualAI({ open, onClose, mode, meeting, sourceText, onApply }: Props) {
  const [result, setResult] = useState('');
  const prompt = buildPrompt(mode, meeting, sourceText);

  if (!open) return null;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      alert('プロンプトをコピーしました。外部のLLMで実行し、結果を下に貼り付けてください。');
    } catch {
      // no-op
    }
  };

  const apply = async () => {
    if (!result.trim()) {
      alert('LLMの出力を貼り付けてください');
      return;
    }
    await onApply(result.trim());
    setResult('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded shadow-lg">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-semibold">
            {mode === 'honne' ? '本音モード（手動AI）' : '議事録 整形（手動AI）'}
          </h3>
          <button className="text-sm text-gray-500" onClick={onClose}>閉じる</button>
        </div>

        <div className="p-3 grid gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">1) プロンプト（コピー）</span>
              <button onClick={copyPrompt} className="text-sm px-2 py-1 border rounded">コピー</button>
            </div>
            <textarea className="w-full border rounded p-2 h-40 text-sm" readOnly value={prompt} />
          </div>

          <div>
            <div className="text-sm font-medium mb-1">2) LLMの出力を貼り付け</div>
            <textarea
              className="w-full border rounded p-2 h-40 text-sm"
              placeholder="ここにLLMの出力を貼り付けてください"
              value={result}
              onChange={(e) => setResult(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button className="px-3 py-1 border rounded" onClick={onClose}>キャンセル</button>
            <button className="px-4 py-1 rounded bg-blue-600 text-white hover:opacity-90" onClick={apply}>
              3) 反映する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
