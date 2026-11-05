import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { controlRequest } from '../control-request';
import './sponsor.css';

type Settings = { logos: string[]; intervalSeconds: number };
const initial: Settings = { logos: [], intervalSeconds: 10 };

function useSponsors() {
  const [settings, setSettings] = useState<Settings>(initial);
  useEffect(() => {
    let alive = true;
    const read = () => fetch('/api/sponsors', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<Settings> : Promise.reject()).then(data => { if (alive) setSettings(old => JSON.stringify(old) === JSON.stringify(data) ? old : data); }).catch(() => undefined);
    void read(); const timer = window.setInterval(read, 2000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return [settings, setSettings] as const;
}

export function SponsorDisplay() {
  const [settings] = useSponsors();
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => { setIndex(0); }, [settings.logos.join('|')]);
  useEffect(() => {
    if (settings.logos.length < 2) return;
    const timer = window.setInterval(() => setIndex(i => (i + 1) % settings.logos.length), settings.intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [settings.logos.length, settings.intervalSeconds]);
  const logo = settings.logos[index % settings.logos.length];
  return <AnimatePresence>{logo && <motion.div className="sponsor-display" aria-label="Nhà tài trợ" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.3 }}><AnimatePresence initial={false}>{logo && <motion.img key={logo} src={logo} alt="Logo nhà tài trợ" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.65 }} />}</AnimatePresence></motion.div>}</AnimatePresence>;
}

export function SponsorControls() {
  const [settings, setSettings] = useSponsors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [interval, setIntervalValue] = useState('10');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setIntervalValue(String(settings.intervalSeconds)); }, [settings.intervalSeconds]);
  const save = async (next: Settings) => {
    const response = await controlRequest('/api/sponsors', { headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
    if (!response.ok) throw new Error('Không thể lưu cài đặt nhà tài trợ.');
    setSettings(next);
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      if (settings.logos.length + files.length > 20) throw new Error('Tối đa 20 logo.');
      const logos = [...settings.logos];
      for (const file of Array.from(files)) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Chỉ nhận PNG, JPG hoặc WebP.');
        const response = await controlRequest('/api/sponsor-logos', { headers: { 'content-type': file.type, 'x-file-name': encodeURIComponent(file.name) }, body: file });
        const payload = await response.json() as { asset?: { url: string }; message?: string };
        if (!response.ok || !payload.asset) throw new Error(payload.message ?? 'Không thể tải logo.');
        logos.push(payload.asset.url);
      }
      await save({ ...settings, logos });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Có lỗi xảy ra.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const commitInterval = () => {
    const n = Number(interval);
    if (!Number.isInteger(n) || n < 2 || n > 300) { setIntervalValue(String(settings.intervalSeconds)); setError('Thời gian phải từ 2 đến 300 giây.'); return; }
    setError(''); void save({ ...settings, intervalSeconds: n }).catch(() => setError('Không thể lưu thời gian.'));
  };
  return <section className="sponsor-controls"><h2>Nhà tài trợ</h2><div className="sponsor-controls__row"><button type="button" disabled={busy} onClick={() => input.current?.click()}>Tải logo</button><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={event => void upload(event.target.files)} /><label>Đổi logo mỗi <input type="number" min="2" max="300" value={interval} disabled={busy} onChange={event => setIntervalValue(event.target.value)} onBlur={commitInterval} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /> giây</label></div><p>PNG, JPG hoặc WebP tĩnh · không giới hạn dung lượng.</p><div className="sponsor-controls__list">{settings.logos.map((logo, index) => <div key={logo}><img src={logo} alt={`Logo ${index + 1}`} /><button type="button" disabled={busy} aria-label={`Bỏ logo ${index + 1}`} onClick={() => void save({ ...settings, logos: settings.logos.filter(item => item !== logo) }).catch(() => setError('Không thể bỏ logo.'))}>×</button></div>)}</div>{error && <p role="alert">{error}</p>}</section>;
}
