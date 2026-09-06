import { useEffect, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { EQ_PRESETS, getEngine } from "../store";
import { useTracked } from "../lib/tracked";
import { EQ_BANDS } from "../engine/AudioEngine";
import type { CurveType, DspState } from "../types";

const TABS = ["General", "Equalizer", "Volume", "Mixing", "Remove Silence", "DSP/VST2"];

function HSlider({ label, value, min, max, step = 0.01, onChange, format, reset }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; reset: number }) {
  return (
    <div className="mb-3" onContextMenu={(e) => { e.preventDefault(); onChange(reset); }}>
      <div className="flex justify-between text-[12px] text-[#ddd] mb-1"><span>{label}</span><span className="text-[#999]">{format ? format(value) : value.toFixed(2)}</span></div>
      <input type="range" className="fader" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}
function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <label className={`flex items-center text-[12px] text-[#ddd] mb-2 ${disabled ? "opacity-50" : ""}`}><input type="checkbox" className="aimp-check" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
function Spin({ value, onChange, step, min, max, unit = " dB", disabled }: { value: number; onChange: (v: number) => void; step: number; min: number; max: number; unit?: string; disabled?: boolean }) {
  return (
    <span className={`aimp-spin inline-flex items-center justify-between gap-2 ${disabled ? "opacity-40" : ""}`}>
      <button onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))} className="hover:text-white">‹</button>
      <span className="tabular-nums">{value.toFixed(2)}{unit}</span>
      <button onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))} className="hover:text-white">›</button>
    </span>
  );
}
function Group({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle?: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <fieldset className="border border-[#444] px-3 pt-2 pb-3 mb-4 relative">
      <legend className="px-1 text-[12px] flex items-center" style={{ color: enabled ? "var(--c-accent2)" : "#777" }}>
        {onToggle && <input type="checkbox" className="aimp-check" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />}{title}
      </legend>
      <div className={enabled ? "" : "opacity-50"}>{children}</div>
    </fieldset>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between text-[12px] text-[#bbb] mb-2"><span>{label}</span><span>{children}</span></div>;
}

export default function SoundEffects() {
  const s = useTracked();
  const d = s.dsp;
  const set = (p: Partial<DspState>) => s.setDsp(p);
  const [tab, setTab] = useState(s.fxTab || "General");
  const [presetOpen, setPresetOpen] = useState(false);
  const close = () => s.set({ fxOpen: false, fxTab: tab });
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && close(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); });
  const fmtDb = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
  const gainNow = getEngine().currentGainDb();

  return (
    <div className="fixed inset-0 z-[160] bg-black/50 flex items-center justify-center fade-in" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-[700px] rounded-sm overflow-hidden shadow-2xl border border-[#555] text-[#ddd]" style={{ background: "#2b2b2b" }}>
        <div className="flex items-center justify-between px-3 h-7 text-[12px]" style={{ background: "linear-gradient(90deg, var(--c-accent), color-mix(in srgb, var(--c-accent) 60%, #000))" }}>
          <span className="flex items-center gap-2 text-white"><span className="w-3.5 h-3.5 rounded-full bg-white/90 inline-block" /> Sound Effects</span>
          <button onClick={close} className="text-white hover:bg-white/20 w-6 h-6 inline-flex items-center justify-center"><X size={14} /></button>
        </div>
        <div className="flex items-center justify-between px-4 h-14" style={{ background: "#1f1f1f" }}>
          <span className="text-[26px] font-black tracking-tight text-white"><span style={{ color: "var(--c-accent2)" }}>▲</span>SaltBee</span>
          <span className="text-[19px] text-white">Sound Effects</span>
        </div>
        <div className="px-3 pt-3 flex gap-[2px]">
          {TABS.map((t) => <button key={t} className={`tab-aimp ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>
        <div className="mx-3 border border-[#555] p-4 h-[400px] overflow-auto" style={{ background: "#2f2f2f" }}>
          {tab === "General" && (
            <div>
              <div className="grid grid-cols-3 gap-x-8">
                <div>
                  <HSlider label="Echo" value={d.echo} min={0} max={1} onChange={(v) => set({ echo: v })} reset={0} format={(v) => `${Math.round(v * 100)}%`} />
                  <HSlider label="Reverb" value={d.reverb} min={0} max={1} onChange={(v) => set({ reverb: v })} reset={0} format={(v) => `${Math.round(v * 100)}%`} />
                  <HSlider label="Flanger" value={d.flanger} min={0} max={1} onChange={(v) => set({ flanger: v })} reset={0} format={(v) => `${Math.round(v * 100)}%`} />
                </div>
                <div>
                  <HSlider label="Chorus" value={d.chorus} min={0} max={1} onChange={(v) => set({ chorus: v })} reset={0} format={(v) => `${Math.round(v * 100)}%`} />
                  <HSlider label="Bass" value={d.bass} min={0} max={1} onChange={(v) => set({ bass: v })} reset={0.15} format={(v) => fmtDb(v * 14)} />
                  <HSlider label="Stereo enhancer" value={d.stereoWidth} min={0} max={1} onChange={(v) => set({ stereoWidth: v })} reset={0.5} format={(v) => `${Math.round(v * 200)}% width`} />
                </div>
                <div>
                  <HSlider label="Speed" value={d.speed} min={0.5} max={2} step={0.01} onChange={(v) => set({ speed: v })} reset={1} format={(v) => `${v.toFixed(2)}×`} />
                  <HSlider label="Tempo (Rubber Band)" value={d.tempo} min={0.5} max={2} step={0.01} onChange={(v) => set({ tempo: v })} reset={1} format={(v) => `${v.toFixed(2)}× · ${((v - 1) * 100).toFixed(0)}%`} />
                  <HSlider label="Pitch" value={d.pitch} min={-12} max={12} step={0.5} onChange={(v) => set({ pitch: v })} reset={0} format={(v) => `${v > 0 ? "+" : ""}${v} st`} />
                  <div className="flex gap-1 -mt-1">{[-8, -4, -2, 2, 4, 8].map((p) => <button key={p} onClick={() => set({ tempo: +(1 + p / 100).toFixed(2) })} className="aimp-btn !px-2 !py-0.5 text-[10px]">{p > 0 ? "+" : ""}{p}%</button>)}</div>
                  <div className="text-[10px] text-[#888] mt-2">* Pitch-locked tempo uses Rubber Band in the native build; the web preview links tempo to rate. Right-click resets a slider.</div>
                </div>
              </div>
              <div className="flex items-end justify-between mt-6">
                <div>
                  <Check label="Voice Remover (for Stereo Only)" checked={d.voiceRemover} onChange={(v) => set({ voiceRemover: v })} />
                  <Check label="Use sound fading (Pause / Resume)" checked={d.fadeOnPause} onChange={(v) => set({ fadeOnPause: v })} />
                  <Check label="Use sound fading on navigation within track" checked={d.fadeOnSeek} onChange={(v) => set({ fadeOnSeek: v })} />
                </div>
                <fieldset className="border border-[#444] px-3 pb-3 pt-1 w-[180px]">
                  <legend className="text-[11px] px-1" style={{ color: "var(--c-accent2)" }}>Balance</legend>
                  <input type="range" className="fader" min={-1} max={1} step={0.01} value={d.balance} onChange={(e) => set({ balance: +e.target.value })} onContextMenu={(e) => { e.preventDefault(); set({ balance: 0 }); }} />
                  <div className="flex justify-between text-[10px] text-[#888]"><span>L</span><span>{d.balance === 0 ? "center" : d.balance < 0 ? `${Math.round(-d.balance * 100)}% L` : `${Math.round(d.balance * 100)}% R`}</span><span>R</span></div>
                </fieldset>
              </div>
            </div>
          )}

          {tab === "Equalizer" && (
            <div>
              <Check label="Switch on the Equalizer" checked={d.eqOn} onChange={(v) => set({ eqOn: v })} />
              <div className={`relative h-[100px] border border-[#555] bg-[#262626] mb-3 ${d.eqOn ? "" : "opacity-50"}`}>
                <div className="absolute inset-x-0 top-0 border-t border-dashed border-[#555]" /><div className="absolute inset-x-0 top-1/2 border-t border-[#aaa]" /><div className="absolute inset-x-0 bottom-0 border-t border-dashed border-[#555]" />
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 18 30">
                  <polyline fill="none" stroke="var(--c-accent2)" strokeWidth="0.15" points={d.eq.map((v, i) => `${i + 0.5},${15 - v}`).join(" ")} />
                </svg>
                <span className="absolute -right-14 top-0 text-[10px] text-[#aaa]">+15.0 dB</span><span className="absolute -right-14 top-1/2 -mt-2 text-[10px] text-[#aaa]">0.0 dB</span><span className="absolute -right-14 bottom-0 text-[10px] text-[#aaa]">-15.0 dB</span>
              </div>
              <div className={`flex items-end gap-[6px] ${d.eqOn ? "" : "opacity-50"}`}>
                {EQ_BANDS.map((f, i) => (
                  <div key={f} className="flex flex-col items-center w-[28px]">
                    <span className="text-[9px] text-[#aaa] h-4">{i % 2 === 0 ? (f >= 1000 ? (f / 1000).toFixed(1).replace(".0", "") + "k" : f) : ""}</span>
                    <input type="range" className="fader vfader" min={-15} max={15} step={0.5} value={d.eq[i]} onChange={(e) => s.setEqBand(i, +e.target.value)} onContextMenu={(e) => { e.preventDefault(); s.setEqBand(i, 0); }} />
                    <span className="text-[9px] text-[#aaa] h-4">{i % 2 === 1 ? (f >= 1000 ? (f / 1000).toFixed(1).replace(".0", "") + "k" : f) : ""}</span>
                    <span className="text-[9px] tabular-nums" style={{ color: d.eq[i] ? "var(--c-accent2)" : "#666" }}>{d.eq[i] > 0 ? "+" : ""}{d.eq[i]}</span>
                  </div>
                ))}
                <div className="flex flex-col items-center w-[40px] ml-4">
                  <span className="text-[9px] text-[#aaa] h-4">Preamp</span>
                  <input type="range" className="fader vfader" min={-15} max={15} step={0.5} value={d.eqPreamp} onChange={(e) => set({ eqPreamp: +e.target.value })} onContextMenu={(e) => { e.preventDefault(); set({ eqPreamp: 0 }); }} />
                  <span className="text-[9px] text-[#aaa] h-4">&nbsp;</span><span className="text-[9px]" style={{ color: d.eqPreamp ? "var(--c-accent2)" : "#666" }}>{fmtDb(d.eqPreamp)}</span>
                </div>
              </div>
              <div className="text-[10px] text-[#888] text-right mt-2">* You can reset values by right mouse click · 18 peaking bands, Q 2.2, 32-bit float</div>
            </div>
          )}

          {tab === "Volume" && (
            <div>
              <div className="flex justify-between">
                <div>
                  <Check label="Smooth volume changing" checked={d.smoothVolume} onChange={(v) => set({ smoothVolume: v })} />
                  <Check label="Logarithmic volume control" checked={d.logVolume} onChange={(v) => set({ logVolume: v })} />
                  <Check label="Loudness compensated volume control" checked={d.loudnessComp} onChange={(v) => set({ loudnessComp: v })} />
                  <Check label="Soft limiter (brick-wall @ -1 dBFS)" checked={d.limiter} onChange={(v) => set({ limiter: v })} />
                </div>
                <div className="border border-[#555] p-3 w-[150px] flex items-center">
                  <div className="w-full h-2 rounded-sm relative" style={{ background: "linear-gradient(90deg,#2ecc40 0%,#9be15d 45%,#ffdc00 70%,#ff4136 100%)" }}>
                    <div className="absolute top-0 bottom-0 right-0 bg-[#2f2f2f]" style={{ width: `${(1 - s.volume) * 100}%` }} />
                    <div className="absolute -top-1 w-3 h-4 bg-[#ddd] border border-[#333] rounded-sm" style={{ left: `calc(${s.volume * 100}% - 6px)` }} />
                  </div>
                </div>
              </div>
              <Group title="Peak normalization" enabled={d.peakNorm} onToggle={(v) => set({ peakNorm: v })}>
                <Row label="Current value:">{gainNow !== null ? fmtDb(gainNow) : "-"}</Row>
                <Row label="Target volume level:"><Spin value={d.peakTarget} onChange={(v) => set({ peakTarget: v })} step={0.5} min={-12} max={0} /></Row>
              </Group>
              <Group title="Replay gain normalization" enabled={d.rgOn} onToggle={(v) => set({ rgOn: v })}>
                <Row label="Current value:">{gainNow !== null ? fmtDb(gainNow) : "-"}</Row>
                <Row label="Default value:"><Spin value={d.rgDefault} onChange={(v) => set({ rgDefault: v })} step={0.5} min={-24} max={24} /></Row>
                <Check label='Analyse file "on-the-fly" (loudness analysis fallback)' checked={d.rgOnTheFly} onChange={(v) => set({ rgOnTheFly: v })} />
                <Row label="    Preamp:"><Spin value={d.rgOnTheFlyPreamp} onChange={(v) => set({ rgOnTheFlyPreamp: v })} step={0.5} min={-24} max={24} disabled={!d.rgOnTheFly} /></Row>
                <Check label="Use value from tags" checked={d.rgFromTags} onChange={(v) => set({ rgFromTags: v })} />
                <Row label="    Preamp:"><Spin value={d.rgTagPreamp} onChange={(v) => set({ rgTagPreamp: v })} step={0.5} min={-24} max={24} disabled={!d.rgFromTags} /></Row>
                <Row label=""><select className="aimp-spin" value={d.rgSource} onChange={(e) => set({ rgSource: e.target.value as "file" | "album" })}><option value="file">Source: File</option><option value="album">Source: Album</option></select></Row>
              </Group>
            </div>
          )}

          {tab === "Mixing" && (
            <div>
              <Group title="Gapless playback (pre-roll next track, sample-accurate)" enabled={d.gapless} onToggle={(v) => set({ gapless: v })}>
                <div className="text-[11px] text-[#999]">The next track is decoded ahead of time and scheduled on the audio clock at the exact end of the current one. Survives shuffle, key-mix and auto-advance because it lives in the engine, not the UI.</div>
              </Group>
              <Group title="Crossfade" enabled={d.crossfade} onToggle={(v) => set({ crossfade: v })}>
                <Row label="Duration:"><Spin value={d.crossfadeSec} onChange={(v) => set({ crossfadeSec: v })} step={0.5} min={0.5} max={15} unit=" s" /></Row>
                <Row label="Curve (per transition):">
                  <select className="aimp-spin" value={d.crossfadeCurve} onChange={(e) => set({ crossfadeCurve: e.target.value as CurveType })}>
                    <option value="equalPower">Equal power</option><option value="linear">Linear</option><option value="sCurve">S-curve</option><option value="logarithmic">Logarithmic</option>
                  </select>
                </Row>
                <Check label="Also crossfade on manual track change" checked={d.crossfadeOnManual} onChange={(v) => set({ crossfadeOnManual: v })} />
                <div className="h-16 border border-[#555] bg-[#262626] mt-2 relative">
                  <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                    {(() => { const pts = (fin: boolean) => Array.from({ length: 41 }, (_, i) => { const x = i / 40; const t = fin ? x : 1 - x; const v = d.crossfadeCurve === "equalPower" ? Math.sin((t * Math.PI) / 2) : d.crossfadeCurve === "sCurve" ? t * t * (3 - 2 * t) : d.crossfadeCurve === "logarithmic" ? Math.log10(1 + 9 * t) : t; return `${x * 100},${40 - v * 38}`; }).join(" "); return <><polyline fill="none" stroke="var(--c-accent)" strokeWidth="1" points={pts(false)} /><polyline fill="none" stroke="var(--c-accent2)" strokeWidth="1" points={pts(true)} /></>; })()}
                  </svg>
                  <span className="absolute left-1 top-0 text-[9px] text-[#888]">out</span><span className="absolute right-1 top-0 text-[9px] text-[#888]">in</span>
                </div>
              </Group>
            </div>
          )}

          {tab === "Remove Silence" && (
            <Group title="Remove silence" enabled={d.removeSilence} onToggle={(v) => set({ removeSilence: v })}>
              <Row label="Silence duration to activate removal:"><Spin value={d.silenceMs} onChange={(v) => set({ silenceMs: v })} step={50} min={50} max={5000} unit=" msec" /></Row>
              <Row label="Silence detection threshold:"><Spin value={d.silenceDb} onChange={(v) => set({ silenceDb: v })} step={1} min={-90} max={-20} /></Row>
              <Check label="Remove silence at track edges regardless of the duration" checked={d.silenceEdges} onChange={(v) => set({ silenceEdges: v })} />
              <div className="text-[11px] text-[#999]">Edges are trimmed when the track is decoded, so gapless transitions stay tight on albums with padded ends.</div>
            </Group>
          )}

          {tab === "DSP/VST2" && (
            <div className="text-[12px]">
              <div className="text-[#ddd] mb-3">Signal chain (32-bit float, no forced resampling):</div>
              <div className="flex flex-wrap gap-1 mb-4">
                {["Decoder", "ReplayGain + Trim", d.voiceRemover ? "Voice remover" : null, "Bass", "18-band EQ", "Echo / Reverb / Flanger / Chorus", "Stereo width", "Preamp", d.limiter ? "Soft limiter" : null, "Balance", "Volume", "Analyser", `Output ${getEngine().outputInfo.sampleRate} Hz`].filter(Boolean).map((n, i) => (
                  <span key={i} className="px-2 py-1 border border-[#555] bg-[#262626]">{n}</span>
                ))}
              </div>
              <Check label="Enable DSP chain (off = Original Sound / bypass)" checked={d.enabled} onChange={(v) => set({ enabled: v })} />
              <Check label="Match output clock to source sample rate (bit-perfect, exclusive-style)" checked={s.settings.matchSourceRate} onChange={(v) => s.setSetting("matchSourceRate", v)} />
              <div className="mt-3 text-[#999]">Output device:
                <select className="aimp-spin ml-2" value={s.settings.outputDevice} onChange={(e) => s.setSetting("outputDevice", e.target.value)} onFocus={s.refreshOutputs}>
                  <option value="">Default</option>{s.outputs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div className="mt-4 text-[#888] text-[11px] leading-relaxed">WASAPI exclusive / ASIO host and VST2 loading are provided by the native shell (electron/). The web engine exposes the same DSP graph so presets carry over.</div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-3 mt-3" style={{ background: "var(--c-accent)" }}>
          <button className="aimp-btn" onClick={s.resetDsp}>Reset to Defaults</button>
          <div className="relative">
            <button className="aimp-btn inline-flex items-center gap-2" onClick={() => setPresetOpen(!presetOpen)}>Presets <ChevronDown size={12} /></button>
            {presetOpen && (
              <div className="absolute bottom-full mb-1 left-0 bg-[#2b2b2b] border border-[#666] py-1 min-w-[160px] shadow-xl">
                {Object.keys(EQ_PRESETS).map((n) => <div key={n} className="menu-item" onClick={() => { s.applyEqPreset(n); setPresetOpen(false); setTab("Equalizer"); }}>{n}</div>)}
              </div>
            )}
          </div>
          <button className="aimp-btn !px-8" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
