// Screenshots voor de zelfreview: node tools/shots.mjs  (preview moet draaien op poort 4860)
// Schrijft shots/<naam>-<breedte>.png (viewport) en shots/<naam>-<breedte>-vol.png (hele pagina),
// en meldt horizontaal scrollen per breedte.
import { chromium } from 'playwright';

const BASIS = 'http://127.0.0.1:4860';
const paginas = (process.argv[2] ?? 'hero=/,collectie=/webshop/,product=/webshop/india-kasten/21a5-indian-blue-vitrinekast/,verkocht=/webshop/india-kasten/20a5-hoge-vitrinekast-gebroken-wit/')
  .split(',').map((x) => x.split('='));
const breedtes = (process.argv[3] ?? '1440,390,320').split(',').map(Number);
const hoogte = { 1440: 900, 390: 844, 320: 640 };

// Gebruik de al geinstalleerde Chromium als de versie van Playwright er (nog) niet is; scheelt een download.
import fs from 'node:fs';
import path from 'node:path';
const pwDir = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const shell = fs.existsSync(pwDir) ? fs.readdirSync(pwDir).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  .map((d) => path.join(pwDir, d, fs.readdirSync(path.join(pwDir, d))[0], 'chrome-headless-shell.exe')).find((p) => fs.existsSync(p)) : undefined;
const b = await chromium.launch(shell ? { executablePath: shell } : {});
for (const w of breedtes) {
  const ctx = await b.newContext({ viewport: { width: w, height: hoogte[w] ?? 900 }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  const p = await ctx.newPage();
  for (const [naam, pad] of paginas) {
    await p.goto(BASIS + pad, { waitUntil: 'networkidle' });
    // Lazy images laden door één keer langs de pagina te scrollen.
    await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.querySelectorAll('img[loading=lazy]').forEach((i) => (i.loading = 'eager')); });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); });
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(800);
    await p.screenshot({ path: `shots/${naam}-${w}.png` });
    await p.screenshot({ path: `shots/${naam}-${w}-vol.png`, fullPage: true });
    const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    console.log(`${naam} ${w}: ${sw > cw ? `HORIZONTAAL SCROLLEN (${sw})` : 'ok'}`);
  }
  await ctx.close();
}
await b.close();
