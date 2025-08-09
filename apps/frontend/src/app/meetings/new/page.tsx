// apps/frontend/src/app/meetings/new/page.tsx
'use client';
import { useState } from 'react';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

export default function NewMeetingPage() {
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const create = async () => {
    const r = await fetch(`${API_BASE}/api/meetings`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title, purpose }),
    });
    if (!r.ok) {
      alert(`作成失敗: ${r.status}`);
      return;
    }
    const m = await r.json();
    window.location.href = `/meetings/${m.id}`;
  };

  return (
    <main style={{padding:24}}>
      <h1>会議作成</h1>
      <div style={{display:'grid',gap:8, maxWidth:480}}>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="タイトル" />
        <input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="目的" />
        <p><a href={`${API_BASE}/api/auth/mock`} target="_blank">モックログイン</a> 後に実行してください。</p>
        <button onClick={create}>作成</button>
      </div>
    </main>
  );
}

