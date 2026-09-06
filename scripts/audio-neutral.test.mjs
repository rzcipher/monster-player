/**
 * Audio neutrality regression test.
 *
 * SaltBee must be bit-transparent out of the box: nothing may alter the
 * samples until the user explicitly enables it. v1.0.1 shipped with a +2.1 dB
 * bass shelf, a -1 dBFS brickwall limiter and on-the-fly ReplayGain all ON by
 * default, which is why playback sounded bass-heavy, quieter and less dynamic
 * than the same files in AIMP.
 *
 * These assertions mirror DEFAULT_DSP, the v2 persist migration and the
 * auto-enable rule in setDsp(). If someone re-introduces a default that
 * colours the signal, this fails.
 *
 * Run: npm run test:audio
 */
// Mirror of the shipped logic, exercised directly.
const DEFAULT_DSP = { enabled:false, eqOn:false, eq:new Array(18).fill(0), eqPreamp:0, echo:0,
  reverb:0, flanger:0, chorus:0, bass:0, stereoWidth:0.5, speed:1, pitch:0, tempo:1, balance:0,
  voiceRemover:false, fadeOnPause:false, fadeOnSeek:false, smoothVolume:true, logVolume:false,
  loudnessComp:false, peakNorm:false, peakTarget:0, rgOn:false, rgDefault:0, rgOnTheFly:false,
  rgOnTheFlyPreamp:0, rgFromTags:true, rgTagPreamp:0, rgSource:"file", limiter:false,
  crossfade:false, crossfadeSec:4, crossfadeCurve:"equalPower", gapless:true,
  crossfadeOnManual:true, removeSilence:false, silenceMs:500, silenceDb:-60, silenceEdges:true };

let fail=0;
const ok=(c,m)=>{ console.log((c?"  PASS  ":"  FAIL  ")+m); if(!c) fail++; };

console.log("\n1) FACTORY DEFAULTS ARE TRANSPARENT");
ok(DEFAULT_DSP.enabled===false, "DSP chain bypassed");
ok(DEFAULT_DSP.bass===0,        "no bass shelf (was +2.1 dB)");
ok(DEFAULT_DSP.limiter===false, "no limiter (was -1 dBFS 20:1)");
ok(DEFAULT_DSP.rgOn===false,    "no ReplayGain");
ok(DEFAULT_DSP.rgOnTheFly===false,"no on-the-fly loudness analysis");
ok(DEFAULT_DSP.eqOn===false && DEFAULT_DSP.eq.every(v=>v===0), "EQ off and flat");
ok(DEFAULT_DSP.loudnessComp===false && DEFAULT_DSP.peakNorm===false, "no loudness comp / peak norm");
ok(DEFAULT_DSP.fadeOnPause===false && DEFAULT_DSP.fadeOnSeek===false, "no transport fades");
ok([DEFAULT_DSP.echo,DEFAULT_DSP.reverb,DEFAULT_DSP.flanger,DEFAULT_DSP.chorus].every(v=>v===0),"all effects at zero");
ok(DEFAULT_DSP.speed===1&&DEFAULT_DSP.tempo===1&&DEFAULT_DSP.pitch===0,"no speed/tempo/pitch change");
ok(DEFAULT_DSP.balance===0, "balance centred (StereoPanner unity for stereo)");
ok(DEFAULT_DSP.gapless===true, "gapless still on (playback behaviour, not colouring)");

console.log("\n2) MIGRATION FROM THE OLD COLOURED SETTINGS");
function migrate(s, from){
  if(from>=2) return s;
  const dsp={...DEFAULT_DSP, ...(s.dsp||{})};
  return {...s, dsp:{...dsp, bass:0, limiter:false, rgOn:false, rgOnTheFly:false,
    fadeOnPause:false, fadeOnSeek:false,
    enabled: !!(dsp.eqOn||dsp.echo||dsp.reverb||dsp.flanger||dsp.chorus||dsp.voiceRemover||
      dsp.loudnessComp||dsp.peakNorm||dsp.speed!==1||dsp.pitch!==0||dsp.tempo!==1||
      dsp.balance!==0||dsp.stereoWidth!==0.5)}};
}
const old={dsp:{enabled:true,bass:0.15,limiter:true,rgOn:true,rgOnTheFly:true,eqOn:false,
  eq:new Array(18).fill(0),echo:0,reverb:0,flanger:0,chorus:0,stereoWidth:0.5,speed:1,pitch:0,
  tempo:1,balance:0,voiceRemover:false,loudnessComp:false,peakNorm:false}};
const m=migrate(old,1).dsp;
ok(m.bass===0,"bass shelf cleared");
ok(m.limiter===false,"limiter cleared");
ok(m.rgOn===false&&m.rgOnTheFly===false,"ReplayGain cleared");
ok(m.enabled===false,"chain bypassed for a user with no real effects");

// a user who DID configure something keeps it
const power={dsp:{...old.dsp, eqOn:true, eq:[6,5,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], reverb:0.3}};
const pm=migrate(power,1).dsp;
ok(pm.eqOn===true && pm.eq[0]===6, "custom EQ curve preserved");
ok(pm.reverb===0.3, "user's reverb preserved");
ok(pm.enabled===true, "chain stays enabled for a user with real effects");
ok(pm.bass===0 && pm.limiter===false, "...but the silent colouring is still removed");
ok(migrate({dsp:{bass:0.15}},2).dsp.bass===0.15, "migration does not re-run at version 2");

console.log("\n3) AUTO-ENABLE WHEN AN EFFECT IS SWITCHED ON");
const TRANSPORT_ONLY=new Set(["enabled","crossfade","crossfadeSec","crossfadeCurve","gapless",
  "crossfadeOnManual","fadeOnPause","fadeOnSeek","smoothVolume","logVolume","rgSource"]);
function setDsp(cur,p){ const dsp={...cur,...p};
  if(!("enabled" in p) && !dsp.enabled){
    if(Object.keys(p).some(k=>!TRANSPORT_ONLY.has(k))) dsp.enabled=true; }
  return dsp; }
ok(setDsp(DEFAULT_DSP,{eqOn:true}).enabled===true, "turning on EQ enables the chain");
ok(setDsp(DEFAULT_DSP,{reverb:0.4}).enabled===true, "adding reverb enables the chain");
ok(setDsp(DEFAULT_DSP,{bass:0.2}).enabled===true, "bass shelf enables the chain");
ok(setDsp(DEFAULT_DSP,{crossfade:true}).enabled===false, "crossfade does NOT enable the chain");
ok(setDsp(DEFAULT_DSP,{gapless:false}).enabled===false, "gapless does NOT enable the chain");
ok(setDsp(DEFAULT_DSP,{fadeOnPause:true}).enabled===false, "pause fade does NOT enable the chain");
ok(setDsp({...DEFAULT_DSP,enabled:true},{enabled:false}).enabled===false, "user can still force bypass");

console.log("\n4) MIRROR MATCHES THE REAL src/store.ts");
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/store.ts", import.meta.url), "utf8");
  const m = src.match(/export const DEFAULT_DSP: DspState = \{([\s\S]*?)\n\};/);
  if (!m) { console.log("  FAIL  could not locate DEFAULT_DSP in src/store.ts"); fail++; }
  else {
    const body = m[1];
    const real = {};
    for (const mm of body.matchAll(/(\w+):\s*(true|false|-?[\d.]+)/g)) {
      real[mm[1]] = mm[2] === "true" ? true : mm[2] === "false" ? false : Number(mm[2]);
    }
    const critical = ["enabled","bass","limiter","rgOn","rgOnTheFly","eqOn",
                      "loudnessComp","peakNorm","echo","reverb","flanger","chorus",
                      "speed","tempo","pitch","balance","fadeOnPause","fadeOnSeek"];
    for (const k of critical) {
      const got = real[k], want = DEFAULT_DSP[k];
      ok(got === want, `src/store.ts DEFAULT_DSP.${k} === ${JSON.stringify(want)} (got ${JSON.stringify(got)})`);
    }
  }
}

console.log(fail? `\n${fail} FAILURE(S)`:"\nALL CHECKS PASSED");
process.exit(fail?1:0);
