import { useEffect, useState } from 'react';

export type IngameSettings = { visible: boolean; roster: boolean; events: boolean; sponsor: boolean };
export const defaultIngameSettings: IngameSettings = { visible: true, roster: true, events: true, sponsor: true };

export function useIngameSettings() {
  const [settings, setSettings] = useState<IngameSettings>(defaultIngameSettings);
  useEffect(() => {
    let alive = true;
    const read = () => fetch('/api/ingame-settings', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<IngameSettings> : Promise.reject()).then(value => {
      if (alive && ['visible', 'roster', 'events', 'sponsor'].every(key => typeof value[key as keyof IngameSettings] === 'boolean')) setSettings(value);
    }).catch(() => undefined);
    void read(); const timer = window.setInterval(read, 1000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return settings;
}
