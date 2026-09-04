import { useState, useEffect } from "react";
import { Tag, Sparkles, Settings2, ShieldAlert, Timer, Music, Disc3, Plus, Trash2 } from "lucide-react";
import { useStore, getEngine } from "../store";
import { useTracked } from "../lib/tracked";
import { coverStats } from "../lib/covers";
import { Modal, Toggle, Slider, QualityBadge } from "./ui";
import { native } from "../lib/native";
import type { Advisory, SmartRule, Track } from "../types";
import { fmtSize } from "../lib/util";

function Field({ label, value, onChange, icon, type = "text", className = "" }: { label: string; value: string | number | null; onChange: (v: string) => void; icon?: React.ReactNode; type?: string; className?: string }) {
  return (
    <div className={className}>
      <div className="label mb-1.5">{label}</div>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">{icon}</span>}
        <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`field ${icon ? "pl-9" : ""}`} />
      </div>
    </div>
  );
}

export function TagEditor() {
  const s = useTracked();
  const t = s.tracks.find((x) => x.id === s.tagEditorId);
  const [draft, setDraft] = useState<Partial<Track>>(() => (t ? { ...t } : {}));
  if (!t) return null;
  const d = draft as Track;
  const up = (p: Partial<Track>) => setDraft({ ...draft, ...p });
  const num = (v: string) => (v === "" ? null : parseInt(v, 10) || null);
  const save = () => { s.updateTrack(t.id, { ...draft, file: t.file, handle: t.handle }); s.recomputeDupes(); s.set({ tagEditorId: null, status: `Tags updated for ${d.title} (write-back to file happens via CLI: Re-tag → Fix metadata)` }); };
  return (
    <Modal title={<><Tag size={18} className="accent-text" /> Track Metadata Tags</>} onClose={() => s.set({ tagEditorId: null })} width={780}
      footer={<><button onClick={() => s.cliAction("retag", t)} className="px-4 h-9 rounded-lg bg-white/10 hover:bg-white/15 text-[13px]">Write to file via CLI</button><button onClick={() => s.set({ tagEditorId: null })} className="px-4 h-9 rounded-lg hover:bg-white/10 text-[13px]">Cancel</button><button onClick={save} className="px-5 h-9 rounded-lg text-black font-semibold text-[13px]" style={{ background: "var(--c-accent2)" }}>Save</button></>}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <Field label="Title" value={d.title} onChange={(v) => up({ title: v })} icon={<Music size={14} />} />
        <Field label="Artist" value={d.artist} onChange={(v) => up({ artist: v })} icon={<Disc3 size={14} />} />
        <Field label="Album Artist" value={d.albumArtist} onChange={(v) => up({ albumArtist: v })} icon={<Disc3 size={14} />} />
        <Field label="Album" value={d.album} onChange={(v) => up({ album: v })} icon={<Disc3 size={14} />} />
        <Field label="Year" value={d.year} onChange={(v) => up({ year: num(v) })} type="number" />
        <div className="grid grid-cols-2 gap-6">
          <Field label="Track Number" value={d.trackNo} onChange={(v) => up({ trackNo: num(v) })} type="number" />
          <Field label="Disc Number" value={d.discNo} onChange={(v) => up({ discNo: num(v) })} type="number" />
        </div>
        <Field label="Genre" value={d.genre} onChange={(v) => up({ genre: v })} />
        <Field label="Composer" value={d.composer} onChange={(v) => up({ composer: v })} />
        <Field label="Lyricist" value={d.lyricist} onChange={(v) => up({ lyricist: v })} />
        <Field label="MusicBrainz Recording ID" value={d.mbid} onChange={(v) => up({ mbid: v })} />
        <Field label="ISRC" value={d.isrc} onChange={(v) => up({ isrc: v.toUpperCase() })} />
        <div className="grid grid-cols-2 gap-6">
          <Field label="BPM" value={d.bpm} onChange={(v) => up({ bpm: num(v) })} type="number" />
          <Field label="Key" value={d.key} onChange={(v) => up({ key: v })} />
        </div>
        <div>
          <div className="label mb-1.5">Content Advisory</div>
          <div className="inline-flex rounded-xl p-1 bg-[#0a0913] border border-[#262238]">
            {(["explicit", "clean", "none"] as Advisory[]).map((a) => <button key={a} onClick={() => up({ advisory: a })} className={`px-6 h-8 rounded-lg text-[13px] capitalize ${d.advisory === a ? "bg-white/15 font-semibold" : "text-muted hover:text-white"}`}>{a}</button>)}
          </div>
        </div>
        <div>
          <div className="label mb-1.5">Technical (read-only)</div>
          <div className="text-[12px] text-muted leading-relaxed">
            <QualityBadge t={t} /> · {t.channels} ch · {t.sampleRate} Hz{t.bitDepth ? ` · ${t.bitDepth}-bit` : ""} · {fmtSize(t.fileSize)}<br />
            RG tag {t.rgTrackGain !== null ? t.rgTrackGain + " dB" : "—"} · analyzed {t.analyzedGain !== null ? t.analyzedGain + " dB" : "—"} · peak {t.analyzedPeak ?? t.rgTrackPeak ?? "—"}<br />
            <span className="font-mono text-[11px]">{t.path}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const FIELDS: { v: SmartRule["field"]; l: string }[] = [
  { v: "title", l: "Title" }, { v: "artist", l: "Artist" }, { v: "albumArtist", l: "Album artist" }, { v: "album", l: "Album" }, { v: "year", l: "Year" }, { v: "genre", l: "Genre" },
  { v: "composer", l: "Composer" }, { v: "lyricist", l: "Lyricist" }, { v: "bpm", l: "BPM" }, { v: "key", l: "Key" }, { v: "camelot", l: "Camelot" }, { v: "isrc", l: "ISRC" }, { v: "mbid", l: "MBID" },
  { v: "codec", l: "Codec" }, { v: "bitrate", l: "Bitrate" }, { v: "sampleRate", l: "Sample rate" }, { v: "rating", l: "Rating" }, { v: "playCount", l: "Play count" }, { v: "advisory", l: "Advisory" }, { v: "discNo", l: "Disc" }, { v: "trackNo", l: "Track #" },
];
const OPS: { v: SmartRule["op"]; l: string }[] = [{ v: "contains", l: "contains" }, { v: "is", l: "is" }, { v: "isnot", l: "is not" }, { v: "startsWith", l: "starts with" }, { v: "gt", l: ">" }, { v: "lt", l: "<" }, { v: "camelot±1", l: "within ±1 Camelot of" }];

export function SmartEditor() {
  const s = useTracked();
  const p = s.playlists.find((x) => x.id === s.smartEditorId);
  const [rules, setRules] = useState<SmartRule[]>(p?.smart || []);
  const [match, setMatch] = useState<"all" | "any">(p?.smartMatch || "all");
  if (!p) return null;
  const preview = s.tracks.filter((t) => !t.quarantined).length;
  return (
    <Modal title={<><Sparkles size={18} className="accent-text" /> Smart playlist — {p.name}</>} onClose={() => s.set({ smartEditorId: null })} width={640}
      footer={<><button onClick={() => s.set({ smartEditorId: null })} className="px-4 h-9 rounded-lg hover:bg-white/10 text-[13px]">Cancel</button><button onClick={() => { s.updateSmart(p.id, rules, match); s.set({ smartEditorId: null }); }} className="px-5 h-9 rounded-lg text-black font-semibold text-[13px]" style={{ background: "var(--c-accent2)" }}>Save</button></>}>
      <div className="flex items-center gap-2 mb-4 text-[13px]">Match <select className="field !w-auto !py-1" value={match} onChange={(e) => setMatch(e.target.value as "all" | "any")}><option value="all">all</option><option value="any">any</option></select> of the following rules ({preview} tracks in library):</div>
      {rules.map((r, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <select className="field !w-[150px] !py-1.5" value={r.field} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, field: e.target.value as SmartRule["field"] } : x)))}>{FIELDS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}</select>
          <select className="field !w-[170px] !py-1.5" value={r.op} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, op: e.target.value as SmartRule["op"] } : x)))}>{OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
          <input className="field !py-1.5 flex-1" value={r.value} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="value (e.g. 120, 8A, Ab minor, FLAC)" />
          <button onClick={() => setRules(rules.filter((_, j) => j !== i))} className="w-8 h-8 rounded hover:bg-white/10 inline-flex items-center justify-center"><Trash2 size={14} /></button>
        </div>
      ))}
      <button onClick={() => setRules([...rules, { field: "genre", op: "contains", value: "" }])} className="mt-1 inline-flex items-center gap-1 text-[12px] accent-text hover:underline"><Plus size={13} /> Add rule</button>
      <div className="text-[11px] text-muted mt-4">Examples: <code>bpm &gt; 120</code>, <code>camelot within ±1 of 8A</code>, <code>composer contains Omoi</code>, <code>codec is FLAC</code>, <code>rating &gt; 3</code>.</div>
    </Modal>
  );
}

/** Live memory readout so "is it leaking?" is answerable without DevTools. */
function MemoryReadout() {
  const [m, setM] = useState<{ used: number; limit: number } | null>(null);
  const [covers, setCovers] = useState(0);
  const [disk, setDisk] = useState<{ path: string; bytes: number } | null>(null);
  const [reclaimed, setReclaimed] = useState(0);
  useEffect(() => {
    if (!native) return;
    native.diskUsage().then(setDisk).catch(() => {});
    native.reclaimedBytes().then(setReclaimed).catch(() => {});
  }, []);
  useEffect(() => {
    const read = () => {
      const perf = performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
      if (perf.memory) setM({ used: perf.memory.usedJSHeapSize, limit: perf.memory.jsHeapSizeLimit });
      setCovers(coverStats().distinct);
    };
    read();
    const i = setInterval(read, 2000);
    return () => clearInterval(i);
  }, []);
  const mb = (b: number) => (b / 1048576).toFixed(0) + " MB";
  return (
    <div className="text-[11px] text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
      {m && <span>JS heap: <b className="text-fg">{mb(m.used)}</b> / {mb(m.limit)}</span>}
      <span>distinct covers: <b className="text-fg">{covers}</b></span>
      <span>PCM cache: <b className="text-fg">{mb(getEngine().cacheSize)}</b></span>
      {disk && (
        <span title={disk.path}>
          app data on disk: <b className="text-fg">{mb(disk.bytes)}</b>
          {reclaimed > 0 && <span className="text-emerald-300"> (reclaimed {mb(reclaimed)} at startup)</span>}
        </span>
      )}
      <button className="underline hover:text-white" onClick={() => { getEngine().releaseCache(); (window as Window & { gc?: () => void }).gc?.(); }}>
        free now
      </button>
    </div>
  );
}

export function SettingsDialog() {
  const s = useTracked();
  const st = s.settings;
  return (
    <Modal title={<><Settings2 size={18} className="accent-text" /> Settings</>} onClose={() => s.set({ settingsOpen: false })} width={640}>
      <div className="space-y-6 text-[13px]">
        <section>
          <div className="label mb-2">Playback engine</div>
          <div className="space-y-2">
            <Toggle checked={st.matchSourceRate} onChange={(v) => s.setSetting("matchSourceRate", v)} label="Bit-perfect: re-clock output to the source sample rate (no resampling in the engine)" />
            <Toggle checked={st.precisionEngine} onChange={(v) => s.setSetting("precisionEngine", v)} label="Precision engine: decode each track fully instead of streaming" />
            <div className="text-[11px] text-muted -mt-1 pl-1 leading-relaxed">
              Streaming (default) hands playback to the media pipeline and uses a few MB per track. Precision decodes the whole
              file to PCM — roughly 85 MB for a 4-minute track — and is only needed for independent pitch shift and silent-edge trimming.
            </div>
            <Toggle checked={st.resumeOnStart} onChange={(v) => s.setSetting("resumeOnStart", v)} label="Resume last track & position on start" />
            <Toggle checked={st.autoAnalyze} onChange={(v) => s.setSetting("autoAnalyze", v)} label="Analyze loudness / key / BPM in the background after import" />
            <div className="flex items-center gap-2">Output device
              <select className="field !w-auto !py-1" value={st.outputDevice} onChange={(e) => s.setSetting("outputDevice", e.target.value)} onFocus={s.refreshOutputs}><option value="">Default</option>{s.outputs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
            </div>
            <div className="text-muted text-[11px]">WASAPI exclusive / ASIO device modes are exposed by the native shell (see electron/main.cjs); the web preview uses the browser's shared float32 mixer.</div>
          </div>
        </section>
        <section>
          <div className="label mb-2">Appearance — Salt Player theming</div>
          <div className="space-y-2">
            <Toggle checked={st.adaptiveTheme} onChange={(v) => s.setSetting("adaptiveTheme", v)} label="Adaptive colour: re-tint the entire app from the current cover art" />
            <div className="flex items-center gap-2">Theme
              <select className="field !w-auto !py-1" value={st.themeMode} onChange={(e) => s.setSetting("themeMode", e.target.value as typeof st.themeMode)}>
                <option value="adaptive">Adaptive dark</option>
                <option value="adaptiveLight">Adaptive light</option>
                <option value="midnight">Midnight (deep black OLED)</option>
                <option value="monochrome">Monochrome</option>
              </select>
            </div>
            <Toggle checked={st.coverBackdrop} onChange={(v) => s.setSetting("coverBackdrop", v)} label="Blurred cover backdrop behind the library" />
            <Slider label="Backdrop strength" min={0} max={1} step={0.05} value={st.backdropStrength} onChange={(v) => s.setSetting("backdropStrength", v)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Corner radius" min={0} max={26} step={1} value={st.cornerRadius} onChange={(v) => s.setSetting("cornerRadius", v)} fmt={(v) => `${v}px`} />
            <Slider label="Text size" min={0.85} max={1.35} step={0.05} value={st.fontScale} onChange={(v) => s.setSetting("fontScale", v)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Toggle checked={st.animations} onChange={(v) => s.setSetting("animations", v)} label="Motion & transitions (turn off for a snappier, static UI)" />
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-muted">Live palette:</span>
              {(["bg", "surface", "accent", "accent2", "text", "muted"] as const).map((k) => (
                <span key={k} title={`${k}: ${s.palette[k]}`} className="w-5 h-5 rounded-md border border-white/15" style={{ background: s.palette[k] }} />
              ))}
            </div>
          </div>
        </section>
        <section>
          <div className="label mb-2">Dock to top (AIMP style)</div>
          <div className="space-y-2">
            <Toggle checked={st.dockAutoHide} onChange={(v) => s.setDockAutoHide(v)} label="Auto-hide: park the docked bar off-screen and slide it down when the pointer touches the top edge" />
            <Toggle checked={st.alwaysOnTop} onChange={(v) => { s.setSetting("alwaysOnTop", v); native?.pin(v); }} label="Always on top (also when undocked)" />
            <Slider label="Dock opacity" min={0.3} max={1} step={0.05} value={st.dockOpacity} onChange={(v) => { s.setSetting("dockOpacity", v); native?.setOpacity(v); }} fmt={(v) => `${Math.round(v * 100)}%`} />
            <div className="text-muted text-[11px]">Global hotkeys in the packaged app: <b className="text-fg">Ctrl+Alt+D</b> dock/undock, <b className="text-fg">Ctrl+Alt+L</b> lyrics, plus the hardware media keys.</div>
          </div>
        </section>
        <section>
          <div className="label mb-2">Lyrics (Salt style)</div>
          <div className="space-y-2">
            <Toggle checked={st.autoLrclib} onChange={(v) => s.setSetting("autoLrclib", v)} label="Fetch from LRCLIB when the file has no embedded lyrics" />
            <Toggle checked={st.showTranslation} onChange={(v) => s.setSetting("showTranslation", v)} label="Show translation line under each lyric (bilingual LRC)" />
            <Toggle checked={st.desktopLyrics} onChange={(v) => s.setSetting("desktopLyrics", v)} label={native ? "Floating desktop lyrics — always-on-top overlay above every window (Ctrl+Alt+K)" : "Floating desktop lyrics (available in the packaged desktop app)"} />
            <Toggle checked={st.karaoke} onChange={(v) => s.setSetting("karaoke", v)} label="Karaoke sweep: fill the active line word-by-word as it plays" />
            <Toggle checked={st.immersion} onChange={(v) => s.setSetting("immersion", v)} label="Immersion mode (hide artwork in Now Playing)" />
          </div>
        </section>
        <section>
          <div className="label mb-2">Performance</div>
          <div className="space-y-2">
            <Toggle checked={st.autoAnalyze} onChange={(v) => s.setSetting("autoAnalyze", v)}
              label="Background analysis (loudness / key / BPM) — off by default; it decodes every file, so it costs CPU on big libraries" />
            {s.analyzing && (
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span className="w-2 h-2 rounded-full accent-bg pulse-dot" />
                Analysing… {s.analysisQueue.length} left
                <button className="underline hover:text-white" onClick={s.cancelAnalysis}>cancel</button>
              </div>
            )}
            <MemoryReadout />
          </div>
        </section>
        <section>
          <div className="label mb-2">Library</div>
          <Toggle checked={st.autoQuarantine} onChange={(v) => s.setSetting("autoQuarantine", v)} label="Auto-quarantine lower-quality duplicates (same ISRC / MBID / title+artist)" />
          {native && s.libraryRoots.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-[11px] text-muted">Watched folders</div>
              {s.libraryRoots.map((r) => (
                <div key={r} className="flex items-center gap-2 text-[11px]">
                  <code className="flex-1 truncate">{r}</code>
                  <button className="underline hover:text-white" onClick={() => s.syncLibrary([r])}>rescan</button>
                  <button className="underline hover:text-white" onClick={() => native?.reveal(r)}>open</button>
                </div>
              ))}
            </div>
          )}
          {native && s.libraryRoots.length > 0 && (
            <div className="mt-2 text-[11px] text-muted">
              Folders are indexed once; relaunching reads the index instead of re-reading every file.
              Changed or new files are picked up automatically in the background.{" "}
              <button className="underline hover:text-white" onClick={() => s.syncLibrary(s.libraryRoots, { force: true })}>
                force full re-read
              </button>
            </div>
          )}
          <div className="mt-2 text-muted text-[11px]">Library: <b className="text-fg">{s.libraryName}</b> · {s.tracks.length} tracks · <button className="underline" onClick={s.reconnectLibrary}>reconnect folder</button></div>
        </section>
        <section>
          <div className="label mb-2">ListenBrainz scrobbling</div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-[11px] text-muted mb-1">User token</div><input className="field" type="password" value={st.listenBrainzToken} onChange={(e) => s.setSetting("listenBrainzToken", e.target.value)} placeholder="from listenbrainz.org/settings" /></div>
            <div><div className="text-[11px] text-muted mb-1">Username</div><input className="field" value={st.listenBrainzUser} onChange={(e) => s.setSetting("listenBrainzUser", e.target.value)} /></div>
          </div>
          <div className="text-muted text-[11px] mt-1">Listens include recording_mbid + ISRC from your tags → exact matches, no fuzzy mapping.</div>
        </section>
        <section>
          <div className="label mb-2">CLI bridge (one-click re-tag)</div>
          <input className="field" value={st.cliBridgeUrl} onChange={(e) => s.setSetting("cliBridgeUrl", e.target.value)} />
          <div className="text-muted text-[11px] mt-1">POST <code>/action</code> with <code>{"{action, path, isrc, mbid}"}</code>. Actions: fix-metadata · retranslate · demucs-acapella · retag. The native shell spawns your CLI directly.</div>
        </section>
      </div>
    </Modal>
  );
}

export function QuarantineDialog() {
  const s = useTracked();
  const groups = new Map<string, Track[]>();
  for (const t of s.tracks) if (t.dupGroup) (groups.get(t.dupGroup) || groups.set(t.dupGroup, []).get(t.dupGroup)!).push(t);
  return (
    <Modal title={<><ShieldAlert size={18} className="text-amber-300" /> Quarantine — duplicate recordings</>} onClose={() => s.set({ quarantineOpen: false })} width={760}>
      {!groups.size && <div className="text-muted">No duplicates detected. Import more sources and they'll be grouped by ISRC → MBID → title/artist/duration.</div>}
      <div className="space-y-4">
        {[...groups.entries()].map(([k, g]) => {
          const best = g.reduce((a, b) => (b.qualityScore > a.qualityScore ? b : a));
          return (
            <div key={k} className="rounded-xl border border-subtle p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px]"><b>{best.title}</b> <span className="text-muted">— {best.artist} · same recording, {g.length} sources ({k.split(":")[0].toUpperCase()} match)</span></div>
                <button onClick={() => s.mergeGroup(k)} className="px-3 h-7 rounded-lg text-[12px] text-black font-semibold" style={{ background: "var(--c-accent2)" }}>Merge → keep best</button>
              </div>
              {g.sort((a, b) => b.qualityScore - a.qualityScore).map((t) => (
                <div key={t.id} className={`flex items-center gap-3 py-1.5 text-[12px] ${t.quarantined ? "opacity-70" : ""}`}>
                  <QualityBadge t={t} /><span className="font-mono text-[11px] text-muted truncate flex-1">{t.path}</span>
                  <span className="text-muted">{fmtSize(t.fileSize)} · score {t.qualityScore}</span>
                  {t.id === best.id ? <span className="badge bg-emerald-500/20 text-emerald-300">best</span> : t.quarantined ? <button onClick={() => s.restore(t.id)} className="underline hover:text-white">restore</button> : <span className="badge bg-white/10">kept</span>}
                  <button onClick={() => s.playTrack(t.id)} className="hover:text-white">▶</button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function SleepDialog() {
  const s = useTracked();
  const [custom, setCustom] = useState(45);
  return (
    <Modal title={<><Timer size={18} className="accent-text" /> Sleep timer</>} onClose={() => s.set({ sleepOpen: false })} width={420}>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[5, 10, 15, 30, 45, 60, 90, 120].map((m) => <button key={m} onClick={() => { s.setSleep(m); s.set({ sleepOpen: false }); }} className="h-10 rounded-lg bg-white/10 hover:bg-white/20 text-[13px]">{m} min</button>)}
        <button onClick={() => { s.setSleep(null); s.set({ sleepOpen: false }); }} className="h-10 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-[13px]">Cancel timer</button>
      </div>
      <div className="flex items-center gap-2 text-[13px]"><input type="number" className="field !w-24" value={custom} onChange={(e) => setCustom(+e.target.value)} /> minutes <button onClick={() => { s.setSleep(custom); s.set({ sleepOpen: false }); }} className="px-4 h-9 rounded-lg text-black font-semibold" style={{ background: "var(--c-accent2)" }}>Start</button></div>
      <div className="text-[11px] text-muted mt-3">Volume fades out over 5 s, then playback pauses. {s.sleepEndsAt ? `Active — ends ${new Date(s.sleepEndsAt).toLocaleTimeString()}` : ""}</div>
    </Modal>
  );
}

export function PromptDialog() {
  const req = useStore((s) => s.promptReq);
  const [v, setV] = useState(req?.value || "");
  if (!req) return null;
  return (
    <Modal title={req.title} onClose={() => req.resolve(null)} width={420}
      footer={<><button onClick={() => req.resolve(null)} className="px-4 h-9 rounded-lg hover:bg-white/10 text-[13px]">Cancel</button><button onClick={() => req.resolve(v)} className="px-5 h-9 rounded-lg text-black font-semibold text-[13px]" style={{ background: "var(--c-accent2)" }}>OK</button></>}>
      <input autoFocus className="field" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") req.resolve(v); }} />
    </Modal>
  );
}
