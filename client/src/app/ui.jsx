import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { initials, shadeIndex } from '@/lib/format';

// Small building blocks for the app, all drawn in the landing page's language (see app.css).

export const cx = (...a) => a.filter(Boolean).join(' ');
export const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ brand */
/** The Knockd "K": a door frame (the stem) and two strokes knocking on it. */
export function LogoMark({ size = 15 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M9 7.5h3.4v7.2L19.3 7.5h4.5l-7.4 7.6 7.8 9.4h-4.5l-5.7-7-1.6 1.7v5.3H9z" fill="currentColor" />
    </svg>
  );
}

export function TelegramIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d="M21.9 4.6 18.6 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1L18 6.6c.4-.4-.1-.6-.6-.2L6 13.6l-4.9-1.5c-1.1-.3-1.1-1.1.2-1.6L20.6 3c.9-.3 1.7.2 1.3 1.6z" />
    </svg>
  );
}

/** Hand-drawn sky-blue underline under a word, drawn in on mount (same stroke as the landing hero). */
export function Hand({ children }) {
  return (
    <span className="hand">
      {children}
      <svg className="draw" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength="1" d="M3 7 C 25 2, 55 3, 97 5" />
      </svg>
    </span>
  );
}

/** Headline that rises in word by word. `mark` gets the hand-drawn underline. */
export function Words({ text, mark }) {
  const words = text.split(' ');
  return (
    <span className="words" aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true">
          <span className="w">
            <span style={{ '--i': i }}>{w === mark ? <Hand>{w}</Hand> : w}</span>
          </span>{' '}
        </span>
      ))}
    </span>
  );
}

const TINTS = ['var(--t-peach)', 'var(--t-blue)', 'var(--t-butter)', 'var(--t-mint)', 'var(--t-lilac)', 'var(--t-pink)'];
export function Avatar({ name, size }) {
  return (
    <span className={cx('avatar', size)} style={{ background: TINTS[shadeIndex(name, TINTS.length)] }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function CountUp({ value, duration = 900 }) {
  const [v, setV] = useState(() => (reduced() ? value : 0));
  useEffect(() => {
    if (reduced() || value == null) return setV(value);
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      setV(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="tab">{(v ?? 0).toLocaleString('en-IN')}</span>;
}

export function Skel({ w = '100%', h = 14, r, style }) {
  return <span className="shimmer" style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;
}

export function RowsSkeleton({ n = 4 }) {
  return (
    <div style={{ display: 'grid', gap: 14, padding: 14 }}>
      {[...Array(n)].map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Skel w={42} h={42} r={14} />
          <div style={{ flex: 1, display: 'grid', gap: 8 }}>
            <Skel w="62%" />
            <Skel w="38%" h={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, label }) {
  return (
    <span className="select">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" />
    </span>
  );
}

export function Switch({ checked, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="empty pop">
      {Icon && <span className="tile"><Icon /></span>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ reveal on scroll */
// Marks an element as shown with both the `in` class and a `data-in` attribute. React rewrites `className`
// whenever a component re-renders (and would drop `in`), but it never touches an attribute it didn't set,
// so `[data-in]` keeps the element visible (app.css / landing.css).
export const markShown = (n) => {
  n.classList.add('in');
  n.setAttribute('data-in', '');
};

export function useReveal(dep) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (reduced()) {
      root.querySelectorAll('.rv').forEach(markShown);
      return;
    }
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { markShown(e.target); io.unobserve(e.target); } }),
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' }
    );
    const scan = () => root.querySelectorAll('.rv:not([data-in])').forEach((n) => io.observe(n));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [dep]);
  return ref;
}

/* ------------------------------------------------------------------ layers (native <dialog>) */
/**
 * A modal layer. kind: 'modal' (centred), 'panel' (slides in from the right, a bottom sheet on phones) or 'palette'.
 * Uses <dialog>.showModal() for focus trapping, Escape and the top layer; animates out before closing.
 */
export function Layer({ open, onClose, kind = 'modal', label, children, className }) {
  const ref = useRef(null);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.classList.remove('closing');
      d.showModal();
      // Start focus on the layer itself (keyboard users tab from there) instead of ringing the close button.
      if (kind !== 'palette') d.querySelector('[data-layer]')?.focus({ preventScroll: true });
    } else if (!open && d.open) {
      d.classList.add('closing');
      const t = setTimeout(() => {
        d.close();
        d.classList.remove('closing');
        setMounted(false);
      }, 230);
      return () => clearTimeout(t);
    }
  }, [open, mounted, kind]);

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={ref}
      className="ih-layer"
      aria-label={label}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className={cx(kind, className)} role="document" data-layer tabIndex={-1} style={{ outline: 'none' }}>
        {kind !== 'palette' && (
          <button className="x" onClick={onClose} aria-label="Close"><X /></button>
        )}
        {children}
      </div>
    </dialog>,
    document.body
  );
}

/* ------------------------------------------------------------------ menu (popover) */
export function Menu({ trigger, children, align = 'end' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [host, setHost] = useState(null);
  const btn = useRef(null);
  const box = useRef(null);
  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = box.current?.offsetWidth || 240;
    const h = box.current?.offsetHeight || 200;
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, document.documentElement.clientWidth - w - 8));
    const below = r.bottom + 6 + h < window.innerHeight;
    setPos({ left, top: below ? r.bottom + 6 : Math.max(8, r.top - h - 6) });
    box.current?.querySelector('button')?.focus();
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!box.current?.contains(e.target) && !btn.current?.contains(e.target)) close(); };
    const onKey = (e) => {
      if (e.key === 'Escape') { close(); btn.current?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...box.current.querySelectorAll('button')];
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, close]);

  return (
    <>
      {trigger({
        ref: btn,
        onClick: (e) => {
          e.stopPropagation();
          // Inside an open <dialog> the rest of the page is inert, so the menu has to live in that dialog.
          setHost(btn.current?.closest('dialog') || document.body);
          setOpen((o) => !o);
        },
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })}
      {open && host &&
        createPortal(
          <div ref={box} className="ih-layer menu" role="menu" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }} onClick={(e) => { e.stopPropagation(); if (e.target.closest('button')) close(); }}>
            {children}
          </div>,
          host
        )}
    </>
  );
}

/* ------------------------------------------------------------------ toasts */
let toastId = 0;
const listeners = new Set();
let toasts = [];
const emit = () => listeners.forEach((l) => l(toasts));
export function toast(title, opts = {}) {
  const id = ++toastId;
  toasts = [...toasts, { id, title, ...opts }];
  emit();
  setTimeout(() => dismiss(id), opts.duration || 4200);
}
function dismiss(id) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, out: true } : t));
  emit();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, 260);
}
export function Toaster() {
  const [list, setList] = useState(toasts);
  const ref = useRef(null);
  useEffect(() => {
    listeners.add(setList);
    return () => listeners.delete(setList);
  }, []);
  // A manual popover sits in the top layer, so toasts stay visible above open dialogs.
  useEffect(() => {
    const el = ref.current;
    if (!el?.showPopover) return;
    try {
      if (el.matches(':popover-open')) el.hidePopover();
      if (list.length) el.showPopover();
    } catch {
      /* older browsers: falls back to a normal fixed element */
    }
  }, [list.length, list[list.length - 1]?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div ref={ref} popover="manual" className="ih-layer toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={cx('toast', t.out && 'out')}>
          <div className="tx">
            {t.title}
            {t.description && <small>{t.description}</small>}
          </div>
          {t.action && (
            <button className="act" onClick={() => { t.action.onClick(); dismiss(t.id); }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
}
