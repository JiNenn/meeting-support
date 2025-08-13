'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

type Props = {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  sourceText?: string; // 参考表示用（任意）
  onApplied?: () => void; // 反映後に親が再読込する
};

export default function ManualAIMinutes({ open, onClose, meetingId, sourceText, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    setResult('');
    setPrompt('');
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/api/meetings/${meetingId}/minutes/polish/prompt`, {
          method: 'POST',
          credentials: 'include',
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || r.statusText);
        setPrompt(d.prompt ?? '');
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, meetingId]);

  if (!open) return null;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      alert('プロンプトをコピーしました。外部のLLMで実行し、結果を下に貼り付けてください。');
    } catch {
      /* 手動コピーでもOK */
    }
  };

  const apply = async () => {
    if (!result.trim()) {
      alert('LLMの出力を貼り付けてください'); 
      return;
    }
    try {
      const r2 = await fetch(`${API}/api/meetings/${meetingId}/minutes/polish/manual-apply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: result.trim() }),
      });
      if (!r2.ok) {
        const t = await r2.text();
        throw new Error(t || r2.statusText);
      }
      onApplied?.();
      alert('反映しました');
      onClose();
    } catch (e: any) {
      alert(`反映に失敗しました: ${e?.message ?? e}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded shadow-lg">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-semibold">議事録 整形（手動AI）</h3>
          <button className="text-sm text-gray-500" onClick={onClose}>閉じる</button>
        </div>

        <div className="p-3 grid gap-3">
          {err && <p className="text-red-600 text-sm">プロンプト取得に失敗: {err}</p>}

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">1) プロンプト（コピー）</span>
              <button onClick={copyPrompt} className="text-sm px-2 py-1 border rounded" disabled={!prompt || loading}>
                コピー
              </button>
            </div>
            <textarea className="w-full border rounded p-2 h-40 text-sm" readOnly value={loading ? '読み込み中…' : prompt} />
          </div>

          {sourceText ? (
            <details>
              <summary className="cursor-pointer text-sm text-gray-700">元の議事録（参考）</summary>
              <textarea className="w-full border rounded p-2 h-40 text-sm mt-2" readOnly value={sourceText} />
            </details>
          ) : null}

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
