/**
 * Boot smoke test.
 *
 * Runs the real production bundle in a DOM and fails if the app doesn't
 * render. This exists because v1.0.0 shipped a black screen: `zustand/traditional`
 * pulls in the optional peer package `use-sync-external-store`, npm never
 * installed it, and Vite emitted a bundle containing an unresolved bare import
 * while still exiting 0. Type-checking and packaging both passed, so CI went
 * green and the installer was blank on launch.
 *
 * Two independent guards below:
 *   1. no "Could not resolve" markers in the bundle
 *   2. the app actually mounts something into #root
 */
const fs=require("fs"); const { JSDOM } = require("jsdom");
let html = fs.readFileSync("dist/index.html","utf8");
// jsdom runs inline scripts immediately and ignores `defer`, while a real
// `type="module"` script is deferred until after parsing. Relocate the bundle
// to the end of <body> so #root exists when it runs, matching the browser.
const sm = html.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/);
if (!sm) { console.log("NO BUNDLE SCRIPT FOUND"); process.exit(1); }
let code = sm[1];
// jsdom parses inline scripts as classic scripts, where import.meta is a
// syntax error. Vite leaves it in for lazily-imported parsers.
code = code.replace(/import\.meta\.url/g, '"file:///app/"');
code = code.replace(/import\.meta\.env/g, '({MODE:"production",DEV:false,PROD:true})');
html = html.replace(sm[0], "");
html = html.replace("</body>", "<script>" + code + "</script></body>");

const dom = new JSDOM(html, { runScripts:"dangerously", pretendToBeVisual:true, url:"http://localhost/" });
const w = dom.window;
w.matchMedia = w.matchMedia || ((q)=>({matches:false,media:q,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return false;}}));
w.ResizeObserver = w.ResizeObserver || class{observe(){}unobserve(){}disconnect(){}};
// jsdom has no canvas backend; return a no-op 2D context so the waveform
// and spectrum canvases don't crash the tree (they draw nothing here).
const noopCtx = new Proxy({}, { get: (t,p) => {
  if (p === "canvas") return null;
  if (p === "createLinearGradient") return () => ({ addColorStop(){} });
  if (p === "getImageData") return (x,y,w2,h2) => ({ data:new Uint8ClampedArray(Math.max(1,w2*h2*4)) });
  if (p === "measureText") return () => ({ width: 0 });
  return () => {};
}});
w.HTMLCanvasElement.prototype.getContext = () => noopCtx;
const errors=[];
w.addEventListener("error",(e)=>errors.push(((e.error&&e.error.stack)||e.message)));
const oe=w.console.error.bind(w.console);
w.console.error=(...a)=>{errors.push(a.map(x=>(x&&x.stack)||String(x)).join(" "));};
// Guard 1: Vite leaves this marker in the output for unresolved imports and
// only *warns*, so grep for it explicitly.
{
  const unresolved = [...html.matchAll(/Could not resolve "([^"]+)"/g)].map(m => m[1]);
  if (unresolved.length) {
    console.error("FAIL: bundle contains unresolved imports:");
    [...new Set(unresolved)].forEach(u => console.error("  - " + u));
    process.exit(1);
  }
}

setTimeout(()=>{
  const root=w.document.getElementById("root");
  console.log("root html length:", root?root.innerHTML.length:0);
  if (root) {
    const txt = (root.textContent||"").replace(/\s+/g," ").trim();
    console.log("visible text (first 300):", JSON.stringify(txt.slice(0,300)));
    console.log("element count:", root.querySelectorAll("*").length);
    console.log("buttons:", root.querySelectorAll("button").length);
  }
  if(errors.length){console.log("\n--- errors ---");errors.slice(0,3).forEach(e=>console.log("\n"+String(e).slice(0,600)));}
  // Guard 2: a mounted app renders a substantial tree. A crashed one renders
  // nothing, which is exactly the black window users saw.
  const ok = !!root && root.querySelectorAll("*").length > 50;
  console.log(ok ? "\nRESULT: rendered" : "\nRESULT: BLANK");
  if (!ok) {
    console.error("FAIL: app did not mount - this is the black-screen bug.");
    try { dom.window.close(); } catch {}
    process.exit(1);
  }
  try { dom.window.close(); } catch {}
  process.exit(0);
},2500);
