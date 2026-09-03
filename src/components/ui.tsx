import { useEffect, useRef, useState, type ReactNode } from "react";
import { Star } from "lucide-react";
import type { Track } from "../types";
import { qualityLabel, toCamelot } from "../lib/util";

export function QualityBadge({ t, compact = false }: { t: Track; compact?: boolean }) {
  const q = qualityLabel(t);
  const color = { hi: "#f0b429", cd: "#3fd1a5", "lossy-hi": "#7fb2ff", lossy: "#8a8a99" }[q.tier];
  return (
    <span className="badge" style={{ background: color + "22", color, border: `1px solid ${color}55` }} title={`${t.codec} · ${t.sampleRate} Hz${t.bitDepth ? " · " + t.bitDepth + "-bit" : ""} · ${t.bitrate} kbps`}>
      {compact ? t.codec : q.label}
    </span>
  );
}

export function CamelotChip({ t }: { t: Track }) {
  const key = t.key || t.analyzedKey || "";
  const c = toCamelot(key);
  if (!c) return <span className="text-muted">—</span>;
  const n = parseInt(c);
  const hue = ((n - 1) / 12) * 360;
  return (
    <span className="badge" style={{ background: `hsl(${hue} 70% 55% / 0.2)`, color: `hsl(${hue} 80% 75%)`, border: `1px solid hsl(${hue} 70% 55% / 0.45)` }} title={key + (t.key ? "" : " (analyzed)")}>
      {c}
    </span>
  );
}

export function Stars({ value, onChange, size = 11 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <span className="inline-flex gap-[1px]" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} onMouseEnter={() => onChange && setHover(i)} onClick={(e) => { e.stopPropagation(); onChange?.(value === i ? 0 : i); }}
          className={onChange ? "cursor-pointer" : ""}
          fill={(hover ?? value) >= i ? "var(--c-accent2)" : "transparent"} stroke={(hover ?? value) >= i ? "var(--c-accent2)" : "currentColor"} strokeWidth={1.5} style={{ opacity: (hover ?? value) >= i ? 1 : 0.35 }} />
      ))}
    </span>
  );
}

/** Per-row trim knob: drag vertically, double-click to reset, ±12 dB */
export function TrimKnob({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const startY = useRef(0), startV = useRef(0);
  const onDown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    startY.current = e.clientY; startV.current = value;
    const move = (ev: MouseEvent) => onChange(Math.max(-12, Math.min(12, +(startV.current + (startY.current - ev.clientY) / 6).toFixed(1))));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  return (
    <span className="inline-flex items-center gap-1" title={`Trim ${value > 0 ? "+" : ""}${value.toFixed(1)} dB (drag, double-click resets)`}>
      <span className="knob" style={{ ["--rot" as string]: `${(value / 12) * 135}deg` }} onMouseDown={onDown} onDoubleClick={(e) => { e.stopPropagation(); onChange(0); }} />
      <span className="text-[10px] tabular-nums w-9" style={{ color: value ? "var(--c-accent2)" : "var(--c-muted)" }}>{value > 0 ? "+" : ""}{value.toFixed(1)}</span>
    </span>
  );
}

export function IconBtn({ children, onClick, title, active, className = "", size = 32 }: { children: ReactNode; onClick?: (e: React.MouseEvent) => void; title?: string; active?: boolean; className?: string; size?: number }) {
  return (
    <button onClick={onClick} title={title} style={{ width: size, height: size, color: active ? "var(--c-accent2)" : undefined }}
      className={`no-drag inline-flex items-center justify-center rounded-md hover:bg-white/10 transition-colors ${active ? "bg-white/10" : ""} ${className}`}>
      {children}
    </button>
  );
}

export interface MenuItem { label?: string; icon?: ReactNode; onClick?: () => void; sep?: boolean; disabled?: boolean; danger?: boolean; sub?: MenuItem[] }

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
  }, [x, y]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", h); window.addEventListener("keydown", k); window.addEventListener("blur", onClose);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); window.removeEventListener("blur", onClose); };
  }, [onClose]);
  return (
    <div ref={ref} className="fixed z-[200] glass border border-subtle rounded-lg py-1 shadow-2xl fade-in min-w-[220px]" style={{ left: pos.x, top: pos.y }}>
      {items.map((it, i) => it.sep ? <div key={i} className="my-1 border-t border-subtle" /> : (
        <div key={i} className={`menu-item flex items-center gap-2 ${it.disabled ? "opacity-40 pointer-events-none" : ""} ${it.danger ? "text-red-300" : ""} relative group`}
          onClick={() => { if (!it.sub) { it.onClick?.(); onClose(); } }}>
          <span className="w-4 inline-flex justify-center opacity-80">{it.icon}</span>
          <span className="flex-1">{it.label}</span>
          {it.sub && <span className="opacity-60">▸</span>}
          {it.sub && (
            <div className="absolute left-full top-0 hidden group-hover:block glass border border-subtle rounded-lg py-1 min-w-[200px] shadow-2xl">
              {it.sub.map((s, j) => s.sep ? <div key={j} className="my-1 border-t border-subtle" /> : (
                <div key={j} className={`menu-item flex items-center gap-2 ${s.disabled ? "opacity-40 pointer-events-none" : ""}`} onClick={(e) => { e.stopPropagation(); s.onClick?.(); onClose(); }}>
                  <span className="w-4 inline-flex justify-center opacity-80">{s.icon}</span>{s.label}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Cover({ url, size, className = "", rounded = "rounded-md" }: { url: string | null; size: number | string; className?: string; rounded?: string }) {
  return (
    <div className={`${rounded} overflow-hidden shrink-0 ${className}`} style={{ width: size, height: size, background: "linear-gradient(135deg, var(--c-dominant), var(--c-surface))" }}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" draggable={false} /> : (
        <div className="w-full h-full flex items-center justify-center text-muted"><svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></svg></div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, width = 720, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rounded-xl border border-subtle shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ width, background: "linear-gradient(160deg, color-mix(in srgb, var(--c-surface) 85%, var(--c-accent) 15%), var(--c-bg))" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-subtle">
          <div className="font-semibold text-[15px] flex items-center gap-2">{title}</div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-white/10">✕</button>
        </div>
        <div className="p-5 overflow-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-subtle flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span onClick={() => onChange(!checked)} className="w-9 h-5 rounded-full relative transition-colors" style={{ background: checked ? "var(--c-accent)" : "#3a3646" }}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: checked ? 18 : 2 }} />
      </span>
      {label && <span className="text-[12px]">{label}</span>}
    </label>
  );
}

/** Labelled horizontal slider used across Settings / DSP panels. */
export function Slider({ label, min, max, step, value, onChange, fmt }: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="flex items-center gap-3 text-[12px]">
      <span className="w-[130px] shrink-0 text-muted">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)}
        className="fader accent flex-1" style={{ ["--pct" as string]: `${pct}%` }} />
      <span className="w-12 text-right tabular-nums accent-text">{fmt ? fmt(value) : value}</span>
    </label>
  );
}
