import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Timer, AudioWaveform, ListMusic, MoreHorizontal, Radio, Sun, Palmtree, BarChart3, Music2, Languages, Disc3, ExternalLink, CheckCircle2, Shuffle, Sparkles } from "lucide-react";
import { useStore, getEngine } from "../store";
import { usePosition, useSpectrum, useNow } from "../hooks";
import { currentLineIndex, lrclibSearchUrl } from "../lib/lyrics";
import { fmtTime, toCamelot } from "../lib/util";
import { Cover, ContextMenu, type MenuItem } from "./ui";
import { useTrackMenu } from "./TrackTable";
import { openUrl } from "../lib/native";

function Tile({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-4 h-[68px] px-6 rounded-2xl text-left text-[17px] transition-colors ${active ? "bg-white/25" : "bg-white/10 hover:bg-white/15"}`}>
      <span className="opacity-95">{icon}</span><span className="truncate">{label}</span>
    </button>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white/10 px-6 py-5"><div className="text-[22px] font-medium mb-3">{title}</div>{children}</div>;
}

function Lyrics({ pos }: { pos: number }) {
  const s = useStore();
  const t = s.tracks.find((x) => x.id === s.currentId);
  const lines = t?.lyrics || null;
  const idx = lines ? currentLineIndex(lines, pos) : -1;
  const ref = useRef<HTMLDivElement>(null);
  const userScroll = useRef(0);
  useEffect(() => {
    const el = ref.current; if (!el || idx < 0) return;
    if (Date.now() - userScroll.current < 3000) return;
    const line = el.children[idx + 1] as HTMLElement | undefined; // children[0] is the top spacer
    if (line) el.scrollTo({ top: line.offsetTop - el.clientHeight / 2 + line.clientHeight / 2, behavior: s.settings.animations ? "smooth" : "auto" });
  }, [idx, s.settings.animations]);

  if (!t) return null;
  if (!lines) return (
    <div className="flex-1 flex flex-col items-center justify-center text-white/70 gap-3">
      <div className="text-2xl">No lyrics</div>
      <button onClick={() => s.fetchLyrics(t.id)} className="pill">Search LRCLIB</button>
      <button className="text-sm underline opacity-70" onClick={() => openUrl(lrclibSearchUrl(t.artist, t.title))}>Open LRCLIB</button>
    </div>
  );

  // Salt Player karaoke sweep: fill the active line left-to-right across its own duration.
  const activeLine = idx >= 0 ? lines[idx] : null;
  const lineEnd = idx >= 0 && idx + 1 < lines.length ? lines[idx + 1].time : (t.duration || 0);
  const sweep = activeLine && lineEnd > activeLine.time
    ? Math.max(0, Math.min(100, ((pos - activeLine.time) / (lineEnd - activeLine.time)) * 100))
    : 0;

  return (
    <div ref={ref} onWheel={() => (userScroll.current = Date.now())} className="flex-1 min-h-0 overflow-y-auto px-8 text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ maskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)" }}>
      <div style={{ height: "40%" }} />
      {lines.map((l, i) => {
        const d = Math.abs(i - idx);
        const active = i === idx;
        return (
          <div key={i} onClick={() => s.seek(l.time)} className="lyric-line cursor-pointer py-4"
            style={{
              opacity: idx < 0 ? 0.5 : active ? 1 : Math.max(0.16, 0.55 - d * 0.1),
              filter: active || idx < 0 ? "none" : `blur(${Math.min(2.5, d * 0.7)}px)`,
              transform: active ? "scale(1)" : "scale(0.94)",
            }}>
            <div
              className={`font-bold leading-tight ${active ? "text-[40px]" : "text-[34px]"} ${active && s.settings.karaoke ? "lyric-karaoke" : ""}`}
              style={{
                ["--sweep" as string]: `${sweep}%`,
                textShadow: active && !s.settings.karaoke ? "0 2px 20px rgba(0,0,0,0.35)" : undefined,
                color: active && !s.settings.karaoke ? "var(--c-accent2)" : undefined,
              }}>
              {l.text || "\u266a"}
            </div>
            {s.settings.showTranslation && l.translation && (
              <div className={`font-semibold mt-2 leading-snug ${active ? "text-[28px]" : "text-[24px]"} opacity-90`}>（{l.translation}）</div>
            )}
          </div>
        );
      })}
      <div style={{ height: "45%" }} />
    </div>
  );
}

function Spectrum() {
  const data = useSpectrum(40);
  return (
    <div className="flex items-end gap-[3px] h-10 opacity-80">
      {data.map((v, i) => <div key={i} className="w-1.5 rounded-sm bg-white/80" style={{ height: `${Math.max(6, v * 100)}%` }} />)}
    </div>
  );
}

export default function NowPlaying() {
  const s = useStore();
  const t = s.tracks.find((x) => x.id === s.currentId) || null;
  const { pos, dur } = usePosition(15);
  const now = useNow();
  const menu = useTrackMenu();
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const tab = s.nowPlayingTab;
  const artists = useMemo(() => (t ? t.artist.split(/;|,|feat\./i).map((a) => a.trim()).filter(Boolean) : []), [t]);
  const countFor = (a: string) => s.tracks.filter((x) => !x.quarantined && x.artist.toLowerCase().includes(a.toLowerCase())).length;
  const albumTracks = t ? s.tracks.filter((x) => !x.quarantined && x.album === t.album && x.albumArtist === t.albumArtist) : [];
  const lastScrobble = t ? s.scrobbles.find((e) => e.title === t.title && e.artist === t.artist) : null;
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && s.closeNowPlaying(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [s]);
  if (!t) return null;
  const RepeatIcon = s.repeat === "one" ? Repeat1 : Repeat;
  const sleepLeft = s.sleepEndsAt ? Math.max(0, Math.round((s.sleepEndsAt - now) / 60000)) : null;
  const immersion = s.settings.immersion;
  const rgDb = t.rgTrackGain ?? t.analyzedGain;

  return (
    <div className="fixed inset-0 z-[100] text-white fade-in overflow-hidden select-none" style={{ background: "var(--c-bg)" }}>
      {/* blurred cover backdrop */}
      {t.coverUrl && <img src={t.coverFull || t.coverUrl} alt="" decoding="async" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "blur(70px) saturate(1.2) brightness(0.55)", transform: "scale(1.4)" }} />}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.1) 40%, rgba(10,8,20,0.85))" }} />

      <div className="relative h-full flex flex-col max-w-[1100px] mx-auto px-8 pt-6 pb-6">
        {/* header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-5 min-w-0">
            <button onClick={s.closeNowPlaying} className="mt-2 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center shrink-0"><ChevronDown size={20} /></button>
            {!immersion && <Cover url={t.coverFull || t.coverUrl} size={92} rounded="rounded-xl" className={`shadow-2xl ${tab === "lyrics" ? "hidden" : ""}`} />}
            <div className="min-w-0">
              <div className="text-[40px] font-bold leading-tight truncate">{t.title}</div>
              <div className="text-[20px] text-white/70 truncate">{t.artist}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <div className="flex rounded-full bg-white/10 p-1 text-[13px]">
              <button onClick={() => s.set({ nowPlayingTab: "info" })} className={`px-4 h-8 rounded-full ${tab === "info" ? "bg-white/20" : "opacity-70"}`}>Info</button>
              <button onClick={() => s.set({ nowPlayingTab: "lyrics" })} className={`px-4 h-8 rounded-full ${tab === "lyrics" ? "bg-white/20" : "opacity-70"}`}>Lyrics</button>
            </div>
            <Radio size={26} className={`ml-3 ${s.settings.listenBrainzToken ? "text-emerald-300" : "opacity-60"}`} />
          </div>
        </div>

        {/* body */}
        {tab === "lyrics" ? (
          <>
            <Lyrics pos={pos} />
            <div className="flex items-center justify-between text-[13px] tracking-wider text-white/70 mb-2">
              <span className="flex items-center gap-2"><span className="border border-white/50 rounded px-1 text-[12px]">词</span>{t.lyricsSource === "none" ? "NO LYRICS" : t.lyricsSource.toUpperCase()}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => s.fetchLyrics(t.id)} className="hover:text-white">LRCLIB ↻</button>
                <button onClick={() => s.setSetting("showTranslation", !s.settings.showTranslation)} title="Toggle translation" className={`inline-flex items-center gap-1 border rounded px-1.5 h-6 ${s.settings.showTranslation ? "border-white text-white" : "border-white/40"}`}><Languages size={14} />A</button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto mt-6 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="grid grid-cols-2 gap-4 mb-5">
              <Tile icon={<Sun size={26} />} label={s.settings.matchSourceRate ? `Bit-perfect · ${t.sampleRate / 1000} kHz` : "Bit-perfect (match source rate)"} active={s.settings.matchSourceRate} onClick={() => s.setSetting("matchSourceRate", !s.settings.matchSourceRate)} />
              <Tile icon={<Palmtree size={26} />} label="Immersion Mode" active={immersion} onClick={() => s.setSetting("immersion", !immersion)} />
              <Tile icon={<BarChart3 size={26} />} label={s.dsp.enabled ? "DSP chain active" : "Original Sound"} active={!s.dsp.enabled} onClick={() => s.setDsp({ enabled: !s.dsp.enabled })} />
              <Tile icon={<Music2 size={26} />} label={`Key-Mix ${toCamelot(t.key || t.analyzedKey || "") || ""}`} active={s.keyMix} onClick={s.toggleKeyMix} />
            </div>
            <div className="space-y-5">
              <Card title="Audio Information">
                <div className="text-[17px] text-white/70">{t.codec} format stream{t.lossless ? " · lossless" : ""}</div>
                <div className="flex flex-wrap gap-x-6 text-[17px] text-white/70 mt-1">
                  <span>{t.channels} Channels</span><span>{t.sampleRate} Hz</span>{t.bitDepth && <span>{t.bitDepth}-bit</span>}<span>{t.bitrate} kbps</span>
                </div>
                <div className="flex flex-wrap gap-x-6 text-[14px] text-white/50 mt-2">
                  <span>Engine: 32-bit float · output {getEngine().outputInfo.sampleRate} Hz · {getEngine().outputInfo.latency.toFixed(1)} ms</span>
                  <span>ReplayGain: {rgDb !== null ? `${rgDb > 0 ? "+" : ""}${rgDb.toFixed(1)} dB (${t.rgTrackGain !== null ? "tags" : "analysis"})` : "—"}</span>
                  <span>Trim: {t.trim > 0 ? "+" : ""}{t.trim.toFixed(1)} dB</span>
                  <span>BPM {t.bpm ?? t.analyzedBpm ?? "—"} · Key {t.key || t.analyzedKey || "—"} · Energy {(t.energy ?? 0).toFixed(2)}</span>
                </div>
                <div className="mt-3"><Spectrum /></div>
              </Card>
              <Card title="From Album">
                <button className="flex items-center gap-5 w-full text-left hover:bg-white/5 rounded-xl p-1 -m-1" onClick={() => { s.setFilter({ kind: "album", artist: t.albumArtist || t.artist, album: t.album }); s.closeNowPlaying(); }}>
                  <Cover url={t.coverUrl} size={72} rounded="rounded-lg" />
                  <div className="min-w-0"><div className="text-[22px] truncate">{t.album}</div><div className="text-[17px] text-white/60">{t.albumArtist} · {t.year} · {albumTracks.length} tracks{t.trackNo ? ` · #${t.trackNo}` : ""}{t.discNo ? ` disc ${t.discNo}` : ""}</div></div>
                </button>
              </Card>
              <Card title="Participating Artists">
                <div className="space-y-3">
                  {artists.map((a) => (
                    <button key={a} className="flex items-center gap-5 w-full text-left hover:bg-white/5 rounded-xl p-1 -m-1" onClick={() => { s.setFilter({ kind: "artist", artist: a }); s.closeNowPlaying(); }}>
                      <div className="w-[72px] h-[72px] rounded-full bg-white/10 flex items-center justify-center"><Disc3 size={30} className="opacity-60" /></div>
                      <div><div className="text-[22px]">{a}</div><div className="text-[17px] text-white/60">{countFor(a)} Songs</div></div>
                    </button>
                  ))}
                  {t.composer && <div className="text-[15px] text-white/50">Composer: {t.composer}{t.lyricist ? ` · Lyricist: ${t.lyricist}` : ""}</div>}
                </div>
              </Card>
              <Card title="Identity">
                <div className="grid grid-cols-2 gap-3 text-[14px]">
                  <div><div className="text-white/50 text-[12px] tracking-wider">ISRC</div><div className="font-mono">{t.isrc || "—"}</div></div>
                  <div><div className="text-white/50 text-[12px] tracking-wider">MUSICBRAINZ RECORDING</div><div className="font-mono truncate">{t.mbid || "—"}</div></div>
                  <div><div className="text-white/50 text-[12px] tracking-wider">GENRE / ADVISORY</div><div>{t.genre || "—"} · {t.advisory}</div></div>
                  <div><div className="text-white/50 text-[12px] tracking-wider">FILE</div><div className="truncate font-mono text-[12px]" title={t.path}>{t.path}</div></div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <a target="_blank" rel="noreferrer" href={t.mbid ? `https://musicbrainz.org/recording/${t.mbid}` : t.isrc ? `https://musicbrainz.org/isrc/${t.isrc}` : `https://musicbrainz.org/search?query=${encodeURIComponent(t.artist + " " + t.title)}&type=recording`} className="px-3 h-8 rounded-full bg-white/15 hover:bg-white/25 inline-flex items-center gap-1 text-[13px]"><ExternalLink size={13} /> MusicBrainz</a>
                  <a target="_blank" rel="noreferrer" href={lrclibSearchUrl(t.artist, t.title)} className="px-3 h-8 rounded-full bg-white/15 hover:bg-white/25 inline-flex items-center gap-1 text-[13px]"><ExternalLink size={13} /> LRCLIB</a>
                  <button onClick={() => s.scrobble(t)} className="px-3 h-8 rounded-full bg-white/15 hover:bg-white/25 inline-flex items-center gap-1 text-[13px]"><Radio size={13} /> Scrobble to ListenBrainz{t.mbid ? " (exact MBID)" : ""}</button>
                  {lastScrobble && <span className={`inline-flex items-center gap-1 text-[12px] ${lastScrobble.status === "sent" ? "text-emerald-300" : lastScrobble.status === "failed" ? "text-red-300" : "text-white/50"}`}><CheckCircle2 size={13} /> {lastScrobble.status} {new Date(lastScrobble.time).toLocaleTimeString()}</span>}
                </div>
              </Card>
              {s.keyMix && (
                <Card title="Key-mix suggestions (±1 Camelot)">
                  {s.suggestKeyMix().slice(0, 5).map((x) => (
                    <button key={x.id} onClick={() => s.playTrack(x.id)} className="flex items-center gap-3 w-full text-left hover:bg-white/5 rounded-lg p-2 -mx-2">
                      <Sparkles size={14} className="opacity-70" /><span className="flex-1 truncate text-[16px]">{x.title} <span className="text-white/50">— {x.artist}</span></span>
                      <span className="font-mono text-[13px]">{toCamelot(x.key || x.analyzedKey || "")} · {x.bpm ?? x.analyzedBpm ?? "—"} bpm</span>
                    </button>
                  ))}
                  {!s.suggestKeyMix().length && <div className="text-white/50">No compatible tracks in the current queue.</div>}
                </Card>
              )}
            </div>
          </div>
        )}

        {/* progress */}
        <div className="mt-3">
          <div className="h-[3px] rounded-full bg-white/25 relative cursor-pointer" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); s.seek(((e.clientX - r.left) / r.width) * dur); }}>
            <div className="absolute left-0 top-0 h-full bg-white rounded-full" style={{ width: `${dur ? (pos / dur) * 100 : 0}%` }} />
          </div>
          <div className="flex justify-between text-[15px] text-white/70 mt-2 tabular-nums"><span>{fmtTime(pos)}</span><span>{fmtTime(dur)}</span></div>
        </div>
        {/* transport */}
        <div className="flex items-center justify-center gap-14 mt-2">
          <button onClick={s.prev} className="hover:scale-110 transition-transform"><SkipBack size={38} fill="currentColor" /></button>
          <button onClick={s.togglePlay} className="hover:scale-110 transition-transform">{s.playing ? <Pause size={60} fill="currentColor" /> : <Play size={60} fill="currentColor" />}</button>
          <button onClick={() => s.next(true)} className="hover:scale-110 transition-transform"><SkipForward size={38} fill="currentColor" /></button>
        </div>
        <div className="flex items-center justify-between px-10 mt-7 text-white/85">
          <button onClick={s.cycleRepeat} className={`relative ${s.repeat !== "off" ? "text-white" : "opacity-70"}`} title={`Repeat ${s.repeat}`}><RepeatIcon size={28} />{s.repeat === "album" && <span className="absolute -bottom-1 -right-2 text-[8px] font-bold">ALB</span>}</button>
          <button onClick={s.toggleShuffle} className={s.shuffle ? "text-white" : "opacity-70"} title="Shuffle"><Shuffle size={26} /></button>
          <button onClick={() => s.set({ sleepOpen: true })} className={`relative ${sleepLeft !== null ? "text-white" : "opacity-70"}`} title="Sleep timer"><Timer size={28} />{sleepLeft !== null && <span className="absolute -top-1 -right-3 text-[10px] bg-white text-black rounded px-1">{sleepLeft}</span>}</button>
          <button onClick={() => s.set({ fxOpen: true })} className="opacity-70 hover:opacity-100" title="Sound effects"><AudioWaveform size={28} /></button>
          <button onClick={() => { s.closeNowPlaying(); s.set({ rightPanel: "queue" }); }} className="opacity-70 hover:opacity-100" title="Queue"><ListMusic size={28} /></button>
          <button onClick={(e) => setCtx({ x: e.clientX - 220, y: e.clientY - 420, items: menu(t, [t.id]) })} className="opacity-70 hover:opacity-100"><MoreHorizontal size={28} /></button>
        </div>
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
