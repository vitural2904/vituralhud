import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

const ease = [.22, 1, .36, 1] as const;
function subscribeMotion(listener: () => void) {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
export function useDraftReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);
}

function SwapLayer({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const present = useIsPresent();
  return <motion.span className="draft-swap-layer" data-present={present} aria-hidden={!present || undefined}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: reduced ? 0 : .18, ease }}>{children}</motion.span>;
}

/** Equal values stay mounted: timer ticks never restart content transitions. */
export function DraftSwap({ value, children, className = '', title }: { value: string; children: ReactNode; className?: string; title?: string }) {
  const reduced = useDraftReducedMotion();
  return <span className={`draft-swap ${className}`} title={title}>
    <AnimatePresence initial={false}><SwapLayer key={value} reduced={reduced}>{children}</SwapLayer></AnimatePresence>
  </span>;
}

type Artwork = { src: string; alt: string };
export function DraftArtwork({ src, alt, fallback, fallbackKey = 'empty', className = '' }: { src?: string; alt: string; fallback: ReactNode; fallbackKey?: string; className?: string }) {
  const [loaded, setLoaded] = useState<{ art: Artwork | null; src?: string }>({ art: null });
  const ready = loaded.art;
  useEffect(() => {
    let current = true;
    if (!src) { setLoaded({ art: null }); return; }
    const image = new Image();
    image.src = src;
    // Keep the old decoded art until the latest request is ready. A slow older
    // request must never replace a more recent hover, clear or undo.
    void image.decode().then(() => {
      if (current) setLoaded({ art: { src, alt }, src });
    }).catch(() => { if (current) setLoaded({ art: null, src }); });
    return () => { current = false; };
  }, [src, alt]);
  return <span className={`draft-artwork ${className}`} aria-busy={Boolean(src && loaded.src !== src)}>
    <DraftSwap value={ready?.src ?? fallbackKey}>
      {ready ? <img src={ready.src} alt={ready.alt} aria-hidden={ready.src !== src || undefined} /> : fallback}
    </DraftSwap>
  </span>;
}

export function DraftSelectionVeil({ active }: { active: boolean }) {
  const reduced = useDraftReducedMotion();
  return <motion.span className="draft-selection-veil" aria-hidden="true" initial={false}
    animate={{ opacity: active ? 1 : 0 }} transition={{ duration: reduced ? 0 : .16, ease }}>
    <span className="draft-selection-breathe" style={{ animationPlayState: active ? 'running' : 'paused' }} />
  </motion.span>;
}
