import { useEffect, useRef, useState } from 'react';
import { SponsorControls } from '../sponsor/Sponsor';
import { controlRequest } from '../control-request';
import './ingame-control.css';

type Settings = { visible: boolean; roster: boolean; events: boolean; sponsor: boolean };
type Status = { connected: boolean; observedAt: string | null; gameTime: number | null; players: unknown[] };
const options: { key: keyof Settings; label: string; description: string }[] = [
  { key: 'visible', label: 'Hiện HUD', description: 'Ẩn hoặc hiện toàn bộ HUD ingame.' },
  { key: 'roster', label: 'Bảng người chơi', description: 'Hiện trang bị và chỉ số ở phía dưới.' },
  { key: 'events', label: 'Thông báo sự kiện', description: 'Hiện các sự kiện game gửi đến.' },
  { key: 'sponsor', label: 'Logo tài trợ', description: 'Hiện logo trong HUD.' },
];

export function IngameControl() {
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [preview, setPreview] = useState<'sample' | 'live'>('sample');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const generation = useRef(0);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const obsUrl = `${location.origin}/overlay/ingame`;
  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setPreviewScale(entries[0].contentRect.width / 1920));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    const pollSettings = () => {
      const current = generation.current;
      if (saving.current) return;
      void fetch('/api/ingame-settings', { cache: 'no-store', signal: AbortSignal.timeout(3000) }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(value => {
        if (!value || !options.every(option => typeof value[option.key] === 'boolean')) throw new Error();
        if (active && !saving.current && current === generation.current) setSettings(value);
      }).catch(() => { if (active && !saving.current && current === generation.current) setMessage('Không tải được cài đặt HUD.'); });
    };
    const poll = () => {
      pollSettings();
      void fetch('/api/ingame', { cache: 'no-store', signal: AbortSignal.timeout(3000) }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(value => {
        if (!value || typeof value.connected !== 'boolean' || !Array.isArray(value.players)) throw new Error();
        if (active) setStatus(value);
      }).catch(() => { if (active) setStatus(null); });
    };
    poll(); const timer = window.setInterval(poll, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const toggle = async (key: keyof Settings, checked: boolean) => {
    if (!settings || busy) return;
    const next = { ...settings, [key]: checked };
    saving.current = true; generation.current++; setBusy(true); setMessage(''); setSettings(next);
    try {
      const response = await controlRequest('/api/ingame-settings', { headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error();
      setSettings(await response.json());
    } catch { setSettings(settings); setMessage('Không lưu được cài đặt. Thử lại.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(obsUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setMessage('Không sao chép được. Hãy chọn địa chỉ bên dưới.'); }
  };
  return <main className="ingame-control">
    <header className="ic-header"><div><a href="/control">← Ban / Pick &amp; Post-match</a><h1>Điều khiển HUD ingame</h1></div><span className={status?.connected ? 'ic-status is-online' : 'ic-status'}>{status?.connected ? 'Đã kết nối game' : 'Chưa kết nối game'}</span></header>
    <div className="ic-layout">
      <div className="ic-main">
        <section className="ic-section">
          <div className="ic-section-head"><div><h2>Xem trước</h2><p>{preview === 'sample' ? 'Dữ liệu mẫu. Dùng để kiểm tra bố cục.' : 'Dữ liệu trực tiếp từ game. HUD ẩn khi mất kết nối.'}</p></div><div className="ic-segment" aria-label="Nguồn xem trước"><button type="button" aria-pressed={preview === 'sample'} onClick={() => setPreview('sample')}>Mẫu</button><button type="button" aria-pressed={preview === 'live'} onClick={() => setPreview('live')}>Trực tiếp</button></div></div>
          <div className="ic-preview" ref={previewRef}><iframe key={preview} title="Xem trước HUD ingame" style={{ transform: `scale(${previewScale})` }} src={preview === 'sample' ? '/preview/ingame' : '/overlay/ingame'} /></div>
          <p className="ic-note">Vàng, trụ và mục tiêu có thể thiếu. Event spectator chưa được kiểm chứng đầy đủ. Thứ tự hai đội chưa chắc cùng đường.</p>
        </section>
        <section className="ic-section"><h2>Nguồn OBS</h2><p>Thêm Browser Source, kích thước 1920 × 1080.</p><div className="ic-url"><input aria-label="Địa chỉ OBS" readOnly value={obsUrl} onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void copy()}>{copied ? 'Đã sao chép' : 'Sao chép'}</button><a href="/overlay/ingame" target="_blank" rel="noreferrer">Mở ↗</a></div></section>
      </div>
      <aside className="ic-side">
        <section className="ic-section"><h2>Trạng thái</h2><dl className="ic-details"><div><dt>Game</dt><dd>{status?.connected ? 'Đang nhận dữ liệu' : 'Chưa có dữ liệu'}</dd></div><div><dt>Người chơi</dt><dd>{status?.connected ? status.players.length : '—'}</dd></div><div><dt>Thời gian trận</dt><dd>{status?.gameTime == null ? '—' : `${Math.floor(status.gameTime / 60)}:${String(Math.floor(status.gameTime % 60)).padStart(2, '0')}`}</dd></div></dl></section>
        <section className="ic-section"><h2>Hiển thị</h2>{options.map(option => <label className="ic-toggle" key={option.key}><span><strong>{option.label}</strong><small>{option.description}</small></span><input type="checkbox" checked={settings?.[option.key] ?? false} disabled={!settings || busy} onChange={event => void toggle(option.key, event.target.checked)} /></label>)}{message && <p role="alert" className="ic-error">{message}</p>}</section>
        <section className="ic-section"><SponsorControls /></section>
        <section className="ic-section"><h2>Đội tuyển</h2><p>Tên và logo đội dùng chung với Ban / Pick.</p><a href="/control/draft">Chỉnh thông tin đội →</a></section>
      </aside>
    </div>
  </main>;
}
