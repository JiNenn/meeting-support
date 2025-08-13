'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

type Task = {
  id:string; title:string; description?:string; due?:string; mandatory:boolean;
  status:'OPEN'|'DONE'; assignee?: { id:string; email:string };
  googleTaskId?:string;
};

export default function TasksPage() {
  const { id } = useParams<{id:string}>();
  const [rows, setRows] = useState<Task[]>([]);
  const [form, setForm] = useState({ title:'', description:'', due:'', mandatory:false, assigneeEmail:'' });

  const load = async () => {
    const r = await fetch(`${API}/api/meetings/${id}/tasks`, { credentials:'include' });
    if (r.ok) setRows(await r.json());
  };
  useEffect(()=>{ load(); }, [id]);

  const createTask = async () => {
    if (!form.title.trim()) return alert('タイトル必須');
    const r = await fetch(`${API}/api/meetings/${id}/tasks`, {
      method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(form),
    });
    if (r.ok) { setForm({ title:'', description:'', due:'', mandatory:false, assigneeEmail:'' }); load(); }
    else alert('作成失敗');
  };

  const push = async (taskId: string) => {
    const r = await fetch(`${API}/api/meetings/${id}/tasks/${taskId}/push`, {
      method: 'POST', credentials: 'include'
    });
    const text = await r.text();

    if (r.status === 202) return alert('担当者に Google トークンが無いためスキップしました');

    if (!r.ok) {
      try {
        const j = JSON.parse(text);
        if (j?.error === 'needs_relink') {
          const who = j.who ?? 'unknown';
          const msg =
            who === 'assignee' ? '担当者の Google 連携が切れています。担当者で「Google連携（再同意）」を実行してください。'
          : who === 'organizer' ? '主催者の Google 連携が切れています。主催者で「Google連携（再同意）」を実行してください。'
          : 'Google 連携が切れています。右上の「Google連携」から再同意してください。';
          return alert(msg);
        }
      } catch {}
      return alert(`Push 失敗: ${text}`);
    }

    alert('Google Tasks に追加しました');
  };


  const toggleDone = async (task:Task) => {
    const r = await fetch(`${API}/api/meetings/${id}/tasks/${task.id}`, {
      method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ status: task.status === 'OPEN' ? 'DONE' : 'OPEN' }),
    });
    if (r.ok) load();
  };

  return (
    <div style={{padding:24}}>
      <h1>タスク</h1>
      <div style={{display:'grid', gap:8, maxWidth:600, marginTop:12}}>
        <input placeholder="タイトル" value={form.title} onChange={e=>setForm({...form, title:e.target.value})}/>
        <input placeholder="説明" value={form.description} onChange={e=>setForm({...form, description:e.target.value})}/>
        <input type="datetime-local" value={form.due} onChange={e=>setForm({...form, due:e.target.value})}/>
        <input placeholder="担当メール（任意）" value={form.assigneeEmail} onChange={e=>setForm({...form, assigneeEmail:e.target.value})}/>
        <label>
          <input type="checkbox" checked={form.mandatory} onChange={e=>setForm({...form, mandatory:e.target.checked})}/> 必須（締切あり）
        </label>
        <div>
          <button onClick={createTask}>作成</button>
        </div>
      </div>

      <ul style={{marginTop:24}}>
        {rows.map(t => (
          <li key={t.id} style={{border:'1px solid #ddd', padding:8, marginBottom:8}}>
            <div>
              <b>{t.title}</b> {t.mandatory ? <span style={{color:'#a00'}}>[必須]</span> : <span>[任意]</span>}
              {' '}— {t.assignee?.email ?? '（担当未設定）'}
            </div>
            {t.description ? <div>{t.description}</div> : null}
            <div style={{fontSize:12, color:'#666'}}>
              期限: {t.due ? new Date(t.due).toLocaleString() : '—'} / 状態: {t.status}
              {t.googleTaskId ? ` / Google: ${t.googleTaskId}` : ''}
            </div>
            <div style={{marginTop:6, display:'flex', gap:8}}>
              <button onClick={()=>toggleDone(t)}>{t.status==='OPEN'?'完了にする':'未完に戻す'}</button>
              <button disabled={!t.assignee} title={!t.assignee ? '担当者を設定してください' : ''} onClick={()=>push(t.id)}>
                Google ToDoへ
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
