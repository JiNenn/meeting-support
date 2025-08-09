'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

type Edit = { id:string; note?:string; createdAt:string; author?: { id:string; email:string }; oldText:string; newText:string };

export default function MinutesPage() {
  const { id } = useParams<{id:string}>();
  const [text, setText] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [edits, setEdits] = useState<Edit[]>([]);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const r1 = await fetch(`${API}/api/meetings/${id}/minutes`, { credentials:'include' });
      if (r1.ok) {
        const d = await r1.json();
        setText(d.content ?? '');
        setUpdatedAt(d.updatedAt ?? '');
      }
      const r2 = await fetch(`${API}/api/meetings/${id}/minutes/history`, { credentials:'include' });
      if (r2.ok) {
        const d = await r2.json();
        setEdits(d.edits ?? []);
      }
    } catch (e:any) { setErr(String(e.message ?? e)); }
  };

  useEffect(()=>{ load(); }, [id]);

  const upload = async () => {
    const r = await fetch(`${API}/api/meetings/${id}/minutes`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ content: text }),
    });
    if (r.ok) { await load(); alert('アップロードしました'); }
  };

  const polish = async () => {
    const r = await fetch(`${API}/api/meetings/${id}/minutes/polish`, {
      method:'POST', credentials:'include'
    });
    if (r.ok) { await load(); alert('ブラッシュアップしました'); }
  };

  const correct = async () => {
    const note = prompt('訂正内容を入力（発話テキストでもOK）');
    if (!note) return;
    const r = await fetch(`${API}/api/meetings/${id}/minutes/correct`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ note }),
    });
    if (r.ok) { await load(); }
  };

  if (err) {
    return <div style={{padding:24}}>
      <h2>取得失敗</h2>
      <p>{err}</p>
      <p><a href={`${API}/api/auth/mock`} target="_blank">モックログイン</a> 後に再読込</p>
    </div>;
  }

  return (
    <div style={{padding:24, display:'grid', gap:12}}>
      <h1>議事録</h1>
      <div style={{color:'#666'}}>最終更新: {updatedAt ? new Date(updatedAt).toLocaleString() : '—'}</div>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={18} style={{width:'100%'}} placeholder="ここに議事録テキストを貼り付け" />
      <div style={{display:'flex', gap:8}}>
        <button onClick={upload}>アップロード</button>
        <button onClick={polish}>AIでブラッシュアップ</button>
        <button onClick={correct}>訂正を追加</button>
      </div>

      <h2 style={{marginTop:16}}>訂正履歴</h2>
      <ul style={{listStyle:'none', padding:0}}>
        {edits.map(e => (
          <li key={e.id} style={{border:'1px solid #ddd', padding:8, marginBottom:8}}>
            <div>
              <b>{e.note ?? 'edit'}</b> / {new Date(e.createdAt).toLocaleString()} / {e.author?.email ?? 'unknown'}
            </div>
            <details style={{marginTop:6}}>
              <summary>変更内容を表示</summary>
              <div style={{display:'grid', gap:6, marginTop:6}}>
                <div><b>旧:</b><pre style={{whiteSpace:'pre-wrap'}}>{e.oldText}</pre></div>
                <div><b>新:</b><pre style={{whiteSpace:'pre-wrap'}}>{e.newText}</pre></div>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
