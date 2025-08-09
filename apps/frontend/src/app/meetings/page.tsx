'use client';
import { useEffect, useState } from 'react';
const API_BASE = '';

type Row = { id:string; title:string; purpose:string; scheduledAt?:string };

export default function Meetings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/meetings`, { credentials:'include' });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        setRows(await r.json());
      } catch (e:any) {
        setErr(String(e.message ?? e));
      }
    })();
  }, []);

  if (err) {
    return (
      <div style={{padding:24}}>
        <h2>一覧取得に失敗</h2>
        <p>{err}</p>
        <p><a href={`${API_BASE}/api/auth/mock`} target="_blank">モックログイン</a> 後にリロードしてください。</p>
      </div>
    );
  }

  return (
    <main style={{padding:24}}>
      <h1>会議一覧</h1>
      <p><a href="/meetings/new">新規作成</a></p>
      <ul style={{marginTop:12}}>
        {rows.map(r => (
          <li key={r.id} style={{marginBottom:8}}>
            <a href={`/meetings/${r.id}`}><b>{r.title}</b></a>
            {' — '}{r.purpose}
            {r.scheduledAt ? ` / 確定: ${new Date(r.scheduledAt).toLocaleString()}` : ' / 未確定'}
          </li>
        ))}
      </ul>
    </main>
  );
}
