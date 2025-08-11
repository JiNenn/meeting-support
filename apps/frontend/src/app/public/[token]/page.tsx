'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

export default function PublicView() {
  const { token } = useParams<{token:string}>();
  const [data,setData] = useState<any>(null);
  const [err,setErr] = useState('');
  useEffect(()=>{ (async()=>{
    try {
      const r = await fetch(`${API}/api/public/${token}`);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      setData(await r.json());
    } catch(e:any){ setErr(String(e.message ?? e)); }
  })(); },[token]);

  if (err) return <div style={{padding:24}}>取得失敗: {err}</div>;
  if (!data) return <div style={{padding:24}}>loading…</div>;

  return (
    <div style={{padding:24}}>
      <h1>{data.title}</h1>
      <p>目的: {data.purpose}</p>
      <p>確定日時: {data.scheduledAt ? new Date(data.scheduledAt).toLocaleString() : '未確定'}</p>
      <h2 style={{marginTop:16}}>アジェンダ</h2>
      <ul>{(data.agenda||[]).map((it:any,i:number)=><li key={i}>• {it.text} [{it.status}]</li>)}</ul>
      <h2 style={{marginTop:16}}>議事録（閲覧専用）</h2>
      <pre style={{whiteSpace:'pre-wrap'}}>{data.minutes}</pre>
    </div>
  );
}
