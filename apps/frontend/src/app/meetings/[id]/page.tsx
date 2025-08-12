// apps/frontend/src/app/meetings/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Role = 'REQUIRED' | 'OPTIONAL';
type Preference = 'ACCEPT' | 'MAYBE' | 'DECLINE';

type MemberRow = {
  memberId: string;
  email: string;
  role: Role;
  preference?: Preference;
  preferredStart?: string;
};

type MeetingDetail = {
  id: string;
  title: string;
  purpose: string;
  scheduledAt?: string;
  organizer: { id: string; email: string };
  members: MemberRow[];
};

type Candidate = { start: string; end: string; optionalOK: number };
// NEW: 役割ブートストラップ候補
type RoleSuggestion = { email: string; score: number };

// ← 環境変数が無ければ 4000 を既定
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

/** 204/空ボディ対応の JSON フェッチ */
async function getJson<T>(path: string, init?: RequestInit): Promise<T | undefined> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if ((body as any)?.message) msg += ` – ${(body as any).message}`;
      if ((body as any)?.error)   msg += ` – ${(body as any).error}`;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204 || res.status === 205) return undefined;
  const text = await res.text();
  if (!text.trim()) return undefined;
  try { return JSON.parse(text) as T; } catch { return undefined; }
}

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('REQUIRED');

  // NEW: よく一緒に会議する人（役割ブートストラップ）
  const [sugs, setSugs] = useState<RoleSuggestion[]>([]);
  // === ここから追加（共有リンク） ===
  const [shareUrl, setShareUrl] = useState<string>('');

  const issueShare = async () => {
    const r = await fetch(`${API_BASE}/api/meetings/${id}/share`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ttlHours: 72 }), // 例: 72時間で期限
    });
    if (!r.ok) {
      const t = await r.text().catch(()=> '');
      alert(`共有リンクの発行に失敗しました: ${r.status} ${r.statusText} ${t}`);
      return;
    }
    const d = await r.json();
    setShareUrl(d.url);
    try { await navigator.clipboard?.writeText(d.url); } catch {}
    alert('共有リンクを発行しました（クリップボードにもコピー）');
  };

  const revokeShare = async () => {
    if (!confirm('すべての共有リンクを無効化します。よろしいですか？')) return;
    const r = await fetch(`${API_BASE}/api/meetings/${id}/share`, {
      method:'DELETE', credentials:'include',
    });
    if (!r.ok && r.status !== 204) {
      const t = await r.text().catch(()=> '');
      alert(`共有リンクの無効化に失敗しました: ${r.status} ${r.statusText} ${t}`);
      return;
    }
    setShareUrl('');
    alert('共有リンクを無効化しました');
  };
  // === 共有リンク ここまで ===


  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const [status, d, c] = await Promise.all([
        getJson<{ user: { id: string; email: string } | null }>('/api/auth/status'),
        getJson<MeetingDetail>(`/api/meetings/${id}`),
        getJson<Candidate[]>(`/api/meetings/${id}/candidates`),
      ]);
      setMe(status?.user ?? null);
      setDetail(d ?? null);
      setCands(c ?? []);
    } catch (e: any) {
      console.error('load failed', e);
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) void load(); }, [id]);

  // NEW: 役割ブートストラップ候補の取得（ページ初期表示で一度）
  useEffect(() => {
    (async () => {
      try {
        const data = await getJson<RoleSuggestion[]>('/api/members/bootstrap/role-suggestions');
        setSugs((data ?? []).sort((a, b) => b.score - a.score));
      } catch {
        // 無視（UIは静かに失敗）
      }
    })();
  }, []);

  const invite = async () => {
    if (!email) return alert('メールアドレスを入力してください');
    try {
      await getJson<unknown>(`/api/meetings/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
      setEmail('');
      alert('招待を送信しました');
      void load();
    } catch (e: any) {
      alert(`招待に失敗しました: ${e.message ?? e}`);
    }
  };

  // NEW: スニペの inviteEmail ヘルパ（REQUIRED/OPTIONAL 両対応）
  const inviteEmail = async (em: string, r: Role) => {
    try {
      await getJson<unknown>(`/api/meetings/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: em, role: r }),
      });
      await load();
    } catch (e) {
      // 個別行での軽量操作のため通知は控えめに。必要ならトーストに変更可
      console.warn('inviteEmail failed', e);
    }
  };

  const prefer = async (start: string, preference: Preference) => {
    try {
      await getJson<unknown>(`/api/meetings/${id}/candidates`, {
        method: 'PATCH',
        body: JSON.stringify({ start, preference }),
      });
      void load();
    } catch (e: any) {
      alert(`更新に失敗しました: ${e.message ?? e}`);
    }
  };

  const finalize = async () => {
    if (!confirm('この条件で開催日時を確定します。よろしいですか？')) return;
    try {
      const r = await fetch(`${API_BASE}/api/meetings/finalize/${id}`, {
        method: 'POST',
        credentials: 'include'
      });
      const d = await r.json();

      await load();

      if (r.status === 202 && d?.calendarWrite?.reason === 'needs_relink') {
        alert('日時は確定しましたが、Googleカレンダー連携が切れています。画面右上の「Google連携」から再同意してください。');
        return;
      }
      alert('開催日時を確定しました');
    } catch (e: any) {
      alert(`確定に失敗しました: ${e.message ?? e}`);
    }
  };


  if (loading) return <p className="p-6">loading...</p>;

  if (err) {
    const mockUrl = `${API_BASE}/api/auth/mock`;
    const linkUrl = `${API_BASE}/api/auth/google/link`;
    return (
      <div className="p-6 space-y-2">
        <h2 className="text-lg font-semibold">会議情報を取得できませんでした</h2>
        <p className="text-red-700">原因: {err}</p>
        <p className="text-sm text-gray-700">
          まず <a className="text-blue-700 underline" href={mockUrl} target="_blank" rel="noreferrer">モックログイン</a> を開いて Cookie を取得してください。
          Gmail 通知を試す場合は <a className="text-blue-700 underline" href={linkUrl} target="_blank" rel="noreferrer">Google 連携</a> も実行してください。
        </p>
      </div>
    );
  }

  if (!detail) return <p className="p-6 text-red-600">会議情報が見つかりません。</p>;

  const isOrganizer = !!me && detail.organizer.id === me.id;

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <header>
        <h1 className="text-2xl font-bold">{detail.title}</h1>
        <p className="text-gray-700 mt-1">{detail.purpose}</p>
        <p className="mt-2">
          確定日時： <span className="font-medium">
            {detail.scheduledAt ? new Date(detail.scheduledAt).toLocaleString() : '未確定'}
          </span>
        </p>

        {/* 共有リンク（主催者のみ） */}
        {isOrganizer && (
          <section className="mt-3">
            <h3 className="font-semibold">共有リンク</h3>
            <div className="flex gap-2 mt-2">
              <button onClick={issueShare} className="px-3 py-1 rounded bg-slate-600 text-white">発行</button>
              <button onClick={revokeShare} className="px-3 py-1 rounded bg-slate-500 text-white">無効化</button>
              {shareUrl && (
                <a href={shareUrl} target="_blank" className="underline text-blue-700" rel="noreferrer">
                  リンクを開く
                </a>
              )}
            </div>
          </section>
        )}

        {/* NEW: よく一緒に会議している人（主催者のみ表示） */}
        {isOrganizer && sugs.length > 0 && (
          <div className="mt-4 rounded-lg border p-3 bg-gray-50">
            <div className="text-sm text-gray-600 mb-2">最近よく一緒に会議している人</div>
            <ul className="text-sm space-y-1">
              {sugs.slice(0, 5).map((s) => (
                <li key={s.email} className="flex items-center justify-between">
                  <span>{s.email}（{s.score}件）</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-blue-700 underline"
                      onClick={() => inviteEmail(s.email, 'REQUIRED')}
                    >
                      招待（必須）
                    </button>
                    <button
                      className="text-gray-700 underline"
                      onClick={() => inviteEmail(s.email, 'OPTIONAL')}
                    >
                      招待（任意）
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {/* メンバー一覧 + 招待（主催者のみ表示） */}
      <section>
        <h2 className="text-lg font-semibold">メンバー</h2>
        <ul className="mt-2 space-y-1">
          {detail.members.map((m) => (
            <li key={m.memberId} className="text-sm">
              {m.email} <span className="text-gray-500">[{m.role}]</span>
              {m.preference ? <span className="ml-2">— {m.preference}</span> : null}
            </li>
          ))}
        </ul>

        {isOrganizer ? (
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <input
              className="border rounded px-2 py-1 flex-1"
              placeholder="invite@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              className="border rounded px-2 py-1 w-full sm:w-40"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="REQUIRED">REQUIRED</option>
              <option value="OPTIONAL">OPTIONAL</option>
            </select>
            <button
              onClick={invite}
              className="px-4 py-1 rounded bg-blue-600 text-white hover:opacity-90"
            >
              招待
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-600 mt-2">
            あなた（{me?.email ?? '未ログイン'}）は主催者ではありません。招待は主催者のみ可能です。
          </p>
        )}
      </section>

      {/* 候補一覧 + 投票 */}
      <section>
        <h2 className="text-lg font-semibold">候補日時</h2>
        {cands.length === 0 ? (
          <p className="text-sm text-gray-600 mt-2">候補がまだありません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {cands.map((c) => (
              <li key={c.start} className="border rounded p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{new Date(c.start).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">任意参加OK人数: {c.optionalOK}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => prefer(c.start, 'ACCEPT')} className="px-3 py-1 rounded bg-green-600 text-white hover:opacity-90">参加</button>
                  <button onClick={() => prefer(c.start, 'MAYBE')}  className="px-3 py-1 rounded bg-amber-500 text-white hover:opacity-90">調整可</button>
                  <button onClick={() => prefer(c.start, 'DECLINE')} className="px-3 py-1 rounded bg-red-600 text-white hover:opacity-90">不可</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 最終確定（主催者のみ） */}
      {isOrganizer && (
        <div>
          <button onClick={finalize} className="px-4 py-2 rounded bg-purple-700 text-white hover:opacity-90">
            この条件で確定
          </button>
        </div>
      )}
    </div>
  );
}
