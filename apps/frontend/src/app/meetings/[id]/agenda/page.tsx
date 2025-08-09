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
        <button onClick={honest}>本音ボタン</button>
        <button onClick={sendPreQ}>事前質問を送る</button>
      </div>
      <ul style={{marginTop:16}}>
        {items.map(i => <li key={i.id}>• {i.text} <small>[{i.status}]</small></li>)}
      </ul>
    </div>
  );
}
