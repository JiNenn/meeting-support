'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

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
  myAck?: { readAt: string | null; agreedAt: string | null };
};

type Candidate = { start: string; end: string; optionalOK: number; requiredOK?: number; score?: number };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (res.status === 204) {
    // @ts-expect-error caller handles undefined
    return undefined;
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) msg += ` – ${body.message}`;
      if (body?.error)   msg += ` – ${body.error}`;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function isValidISO(s?: string) {
  if (!s) return false;
  const t = Date.parse(s);
  return !Number.isNaN(t);
}

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');

  // 招待フォーム
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('REQUIRED');

  // 候補条件（URLクエリと同期）
  const initialParams = useMemo(() => {
    const days      = Math.min(30, Math.max(1, Number(search.get('days') ?? 7)));
    const startHour = Math.min(23, Math.max(0, Number(search.get('startHour') ?? 9)));
    const endHour   = Math.min(24, Math.max(startHour + 1, Number(search.get('endHour') ?? 18)));
    const step = Number(search.get('stepMin') ?? 30);
    const stepMin   = [15, 30, 60].includes(step) ? step : 30;
    return { days, startHour, endHour, stepMin };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.toString()]);

  const [params, setParams] = useState(initialParams);

  const applyParamsToUrl = () => {
    const q = new URLSearchParams();
    q.set('days', String(params.days));
    q.set('startHour', String(params.startHour));
    q.set('endHour', String(params.endHour));
    q.set('stepMin', String(params.stepMin));
    router.replace(`/meetings/${id}?${q.toString()}`);
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setErr('');
    try {
      const d = await getJson<MeetingDetail>(`/api/meetings/${id}`);
      setDetail(d);

      if (d?.scheduledAt) {
        setCands([]);
      } else {
        const q = new URLSearchParams({
          days: String(params.days),
          startHour: String(params.startHour),
          endHour: String(params.endHour),
          stepMin: String(params.stepMin),
        });
        const candRes = await fetch(`${API_BASE}/api/meetings/${id}/candidates?${q}`, {
          credentials: 'include',
        });
        if (candRes.status === 204) {
          setCands([]);
        } else if (candRes.ok) {
          const raw = (await candRes.json()) as Candidate[];
          const filtered = raw.filter(c => isValidISO(c.start) && isValidISO(c.end));
          setCands(filtered);
        } else {
          let msg = `${candRes.status} ${candRes.statusText}`;
          try {
            const body = await candRes.json();
            if (body?.message) msg += ` – ${body.message}`;
            if (body?.error)   msg += ` – ${body.error}`;
          } catch {}
          throw new Error(msg);
        }
      }
    } catch (e: any) {
      console.error('load failed', e);
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setParams(initialParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParams.days, initialParams.startHour, initialParams.endHour, initialParams.stepMin]);

  useEffect(() => {
    if (id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, params.days, params.startHour, params.endHour, params.stepMin]);

  const invite = async () => {
    if (!email) return alert('メールアドレスを入力してください');
    try {
      await getJson(`/api/meetings/${id}/members`, {
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

  const prefer = async (start: string, preference: Preference) => {
    try {
      await getJson(`/api/meetings/${id}/candidates`, {
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
      await getJson(`/api/meetings/finalize/${id}`, { method: 'POST' });
      await load();
      alert('開催日時を確定しました');
    } catch (e: any) {
      alert(`確定に失敗しました: ${e.message ?? e}`);
    }
  };

  if (loading) return <p className="p-6">loading...</p>;

  if (err) {
    const mockUrl = `${API_BASE}/api/auth/mock`;
    return (
      <div className="p-6 space-y-2">
        <h2 className="text-lg font-semibold">会議情報を取得できませんでした</h2>
        <p className="text-red-700">原因: {err}</p>
        <p className="text-sm text-gray-700">
          認証が必要な可能性があります。まず{' '}
          <a className="text-blue-700 underline" href={mockUrl} target="_blank" rel="noreferrer">
            モックログイン
          </a>
          {' '}を開いてから、このページをリロードしてください。
        </p>
      </div>
    );
  }

  if (!detail) return <p className="p-6 text-red-600">会議情報が見つかりません。</p>;

  const isOrganizer = true; // TODO: organizer.id と現在ユーザーIDの突合せ

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <header>
        <h1 className="text-2xl font-bold">{detail.title}</h1>
        <p className="text-gray-700 mt-1">{detail.purpose}</p>
        <p className="mt-2">
          確定日時：{' '}
          <span className="font-medium">
            {detail.scheduledAt ? new Date(detail.scheduledAt).toLocaleString() : '未確定'}
          </span>
        </p>
      </header>

      {/* 候補条件パネル（URLと同期） */}
      {!detail.scheduledAt && (
        <section className="border rounded p-3">
          <h2 className="text-lg font-semibold mb-2">候補条件</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <label className="text-sm">
              <div className="mb-1">日数</div>
              <input
                type="number"
                min={1} max={30}
                className="border rounded px-2 py-1 w-full"
                value={params.days}
                onChange={e => setParams(p => ({ ...p, days: Math.max(1, Math.min(30, Number(e.target.value)||7)) }))}
              />
            </label>
            <label className="text-sm">
              <div className="mb-1">開始時刻</div>
              <input
                type="number"
                min={0} max={23}
                className="border rounded px-2 py-1 w-full"
                value={params.startHour}
                onChange={e => {
                  const v = Math.max(0, Math.min(23, Number(e.target.value) || 9));
                  setParams(p => ({ ...p, startHour: v, endHour: Math.max(p.endHour, v + 1) }));
                }}
              />
            </label>
            <label className="text-sm">
              <div className="mb-1">終了時刻</div>
              <input
                type="number"
                min={params.startHour + 1} max={24}
                className="border rounded px-2 py-1 w-full"
                value={params.endHour}
                onChange={e => {
                  const v = Math.max(params.startHour + 1, Math.min(24, Number(e.target.value) || 18));
                  setParams(p => ({ ...p, endHour: v }));
                }}
              />
            </label>
            <label className="text-sm">
              <div className="mb-1">刻み（分）</div>
              <select
                className="border rounded px-2 py-1 w-full"
                value={params.stepMin}
                onChange={e => setParams(p => ({ ...p, stepMin: Number(e.target.value) as 15|30|60 }))}
              >
                <option value={15}>15</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
            </label>

            <div className="col-span-2 sm:col-span-4 flex gap-2">
              <button
                onClick={applyParamsToUrl}
                className="px-3 py-1 rounded border hover:bg-gray-50"
                title="URLに反映（共有/ブクマ向け）"
              >
                URLに反映
              </button>
              <button
                onClick={() => void load()}
                className="px-4 py-1 rounded bg-blue-600 text-white hover:opacity-90"
              >
                候補を再取得
              </button>
            </div>
          </div>
        </section>
      )}

      {/* メンバー一覧 + 招待 */}
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
      </section>

      {/* 候補一覧 + 投票（確定済みは非表示） */}
      {!detail.scheduledAt && (
        <section>
          <h2 className="text-lg font-semibold">候補日時</h2>
          {cands.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">候補はまだありません。条件を広げて再取得してください。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {cands.map((c) => {
                const t = Date.parse(c.start);
                if (Number.isNaN(t)) return null;
                return (
                  <li key={c.start} className="border rounded p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{new Date(c.start).toLocaleString()}</div>
                      <div className="text-xs text-gray-500">
                        任意OK: {c.optionalOK}{' '}
                        {typeof c.requiredOK === 'number' ? `／ 必須OK: ${c.requiredOK}` : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => prefer(c.start, 'ACCEPT')}
                        className="px-3 py-1 rounded bg-green-600 text-white hover:opacity-90"
                      >
                        参加
                      </button>
                      <button
                        onClick={() => prefer(c.start, 'MAYBE')}
                        className="px-3 py-1 rounded bg-amber-500 text-white hover:opacity-90"
                      >
                        調整可
                      </button>
                      <button
                        onClick={() => prefer(c.start, 'DECLINE')}
                        className="px-3 py-1 rounded bg-red-600 text-white hover:opacity-90"
                      >
                        不可
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* 最終確定（主催者のみ） */}
      {isOrganizer && !detail.scheduledAt && (
        <div>
          <button
            onClick={finalize}
            className="px-4 py-2 rounded bg-purple-700 text-white hover:opacity-90"
          >
            この条件で確定
          </button>
        </div>
      )}
    </div>
  );
}
