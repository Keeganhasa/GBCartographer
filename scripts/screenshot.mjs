// Screenshots a page with headless Edge or Chrome (no display needed), at 2x: a 1280 x 800 layout, a 2560 x 1600 PNG.
//   node scripts/screenshot.mjs <url> <out.png> [prep.js]   (npm run screenshot: the README picture, with the demo open)
// prep.js is JavaScript run in the page before the shot (async allowed; `return` a value to print it).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, prepFile] = process.argv.slice(2);
const browser = ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
if (!browser) throw new Error("No Edge or Chrome found");
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "gbc-chrome-"));
const child = spawn(browser, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-device-scale-factor=2", "--window-size=1280,800", "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 40 && !target; i += 1) {
    await wait(500);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
  }
  if (!target) throw new Error("The browser did not start");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map();
  socket.onmessage = (event) => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { id += 1; pending.set(id, (m) => m.error ? reject(new Error(m.error.message)) : resolve(m.result)); socket.send(JSON.stringify({ id, method, params })); });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  await send("Page.enable");
  await send("Page.navigate", { url });
  await wait(4000);
  if (prepFile) {
    const result = await send("Runtime.evaluate", { expression: `(async () => { ${readFileSync(prepFile, "utf8")} })()`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "prep failed");
    if (result.result.value !== undefined) console.log("prep:", JSON.stringify(result.result.value).slice(0, 400));
    await wait(1500);
  }
  await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("saved", out);
  socket.close();
} finally {
  child.kill();
  // The headless browser's profile is a few hundred MB: remove it again.
  await new Promise((done) => setTimeout(done, 500));
  rmSync(profile, { recursive: true, force: true });
}
