'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

type Item = { id:string; text:string; status:'OPEN'|'DECIDED'|'PARKING' };

export default function AgendaPage() {
  const { id } = useParams<{id:string}>();
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [openHonest, setOpenHonest] = useState(false);
  const [honestText, setHonestText] = useState('');
  const [honestPrompt, setHonestPrompt] = useState<string>('');
  const [honestThreadId, setHonestThreadId] = useState<string>('');

  const load = async () => {
    try {
      const r = await fetch(`${API}/api/meetings/${id}/agenda`, { credentials:'include' });
      const d = await r.json();
      setItems(d.items ?? []);
    } catch(e:any) { setErr(String(e.message ?? e)); }
  };
  useEffect(()=>{ load(); }, [id]);

  const add = async () => {
    if (!text.trim()) return;
    await fetch(`${API}/api/meetings/${id}/agenda/items`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ text }),
    });
    setText(''); load();
  };

  const honest = async () => {
    const msg = prompt('率直に相談（AIが短文化します）:');
    if (!msg) return;
    const r = await fetch(`${API}/api/meetings/${id}/honest`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: msg }),
    });
    if (!r.ok) { alert(`アップロード失敗: ${await r.text()}`); return; }
    const { threadId, suggestedText } = await r.json();
    if (confirm(`この内容でアジェンダに反映しますか？\n\n${suggestedText}`)) {
      await fetch(`${API}/api/meetings/${id}/honest/${threadId}/apply`, {
        method:'POST', credentials:'include'
      });
      load();
    }
  };

  const sendPreQ = async () => {
    if (!confirm('全参加者に事前質問を送ります。よろしいですか？')) return;
    await fetch(`${API}/api/meetings/${id}/pre-questions`, { method:'POST', credentials:'include' });
    alert('送信しました（ログまたはGmailへ）');
  };

  // apps/frontend/src/app/meetings/[id]/agenda/page.tsx のボタン群に追加
  const refreshNow = async () => {
    await fetch(`${API}/api/meetings/${id}/agenda/refresh`, { method:'POST', credentials:'include' });
    await load();
    alert('アジェンダを自動更新しました');
  };

  const sendHonest = async () => {
    const r = await fetch(`${API}/api/meetings/${id}/honest`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: honestText }),
    });
    const d = await r.json();
    if (d.mode === 'manual') {
      setHonestThreadId(d.threadId);
      setHonestPrompt(d.prompt);
    } else {
      // 従来：自動案をそのまま反映
      await fetch(`${API}/api/meetings/${id}/honest/${d.threadId}/apply`, { method:'POST', credentials:'include' });
      setOpenHonest(false); setHonestText(''); setHonestPrompt(''); setHonestThreadId('');
      await load();
    }
  };

  const applyHonestManual = async () => {
    const pasted = (document.getElementById('honestResult') as HTMLTextAreaElement)?.value ?? '';
    if (!pasted.trim()) return alert('結果を貼り付けてください');
    await fetch(`${API}/api/meetings/${id}/honest/${honestThreadId}/manual-apply`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ text: pasted }),
    });
    setOpenHonest(false); setHonestText(''); setHonestPrompt(''); setHonestThreadId('');
    await load();
  };

  if (err) {
    return <div style={{padding:24}}>
      <h2>取得失敗</h2>
      <p>{err}</p>
      <p><a href={`${API}/api/auth/mock`} target="_blank">モックログイン</a>後に再読込</p>
    </div>;
  }

  return (
    <div style={{padding:24}}>
      <h1>アジェンダ</h1>
      <div style={{display:'flex', gap:8, marginTop:12}}>
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="議題を追加" style={{flex:1}}/>
        <button onClick={add}>追加</button>
        <button onClick={() => setOpenHonest(true)}>本音ボタン</button>
        <button onClick={sendPreQ}>事前質問を送る</button>
        <button onClick={refreshNow}>今すぐ更新</button>
      </div>
      <ul style={{marginTop:16}}>
        {items.map(i => <li key={i.id}>• {i.text} <small>[{i.status}]</small></li>)}
      </ul>

      {openHonest && (
        <div /* 省略: 背景と枠 */>
          <div>
            <h3>本音相談</h3>
            {!honestPrompt ? (
              <>
                <textarea rows={6} value={honestText} onChange={e=>setHonestText(e.target.value)} style={{width:'100%'}} />
                <div className="mt-2 flex gap-2">
                  <button onClick={sendHonest}>プロンプト生成</button>
                  <button onClick={()=>setOpenHonest(false)}>閉じる</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">このプロンプトを ChatGPT 等に貼って実行し、結果を下に貼り付けてください。</p>
                <pre className="bg-gray-100 p-2 text-sm" style={{whiteSpace:'pre-wrap'}}>{honestPrompt}</pre>
                <button onClick={()=>navigator.clipboard?.writeText(honestPrompt)}>コピー</button>
                <textarea id="honestResult" rows={6} className="mt-2" style={{width:'100%'}} placeholder="ここに結果を貼り付け" />
                <div className="mt-2 flex gap-2">
                  <button onClick={applyHonestManual}>反映する</button>
                  <button onClick={()=>{ setHonestPrompt(''); setHonestThreadId(''); }}>戻る</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

}
