// Launches the real KD Ops desktop app against a tiny local site and checks what the app itself provides:
// the two tabs, keeping the Office running in the background, links, notifications, the tray and the offline screen.
const { _electron } = require('playwright');
const http = require('http');
const path = require('path');
// KD_EXE = a built, installed app; KD_ELECTRON = any Electron program to run this folder with; otherwise the one from node_modules
const exe = process.env.KD_EXE || process.env.KD_ELECTRON || require('electron');
const args = process.env.KD_EXE ? [] : ['.'];
const cwd = path.join(__dirname, '..');
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ELECTRON_')));

(async () => {
  // a tiny stand-in for ops.kdsquares.com: "/" is the ops site, "/office" is the Office
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    if (req.url.startsWith('/office')) res.end('<!doctype html><title>(2) Virtual Office</title><div id="root"><p>office</p></div>');
    else res.end('<!doctype html><title>KD Ops</title><div id="root"><p>ops</p></div>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const userData = path.join(require('os').tmpdir(), 'kd-ops-test-' + Date.now());
  const app = await _electron.launch({ executablePath: exe, args: [...args, `--user-data-dir=${userData}`], cwd, env: { ...cleanEnv(), KD_OPS_URL: `${base}/` } });
  await app.firstWindow();
  await new Promise((r) => setTimeout(r, 3000));
  const bar = app.windows().find((p) => p.url().endsWith('tabs.html'));
  if (!bar) throw new Error('tab bar page not found: ' + JSON.stringify(app.windows().map((p) => p.url())));
  await bar.waitForTimeout(500);

  // run code inside one of the two site pages (found by its address)
  const pathOf = (w) => { try { return new URL(w.getURL()).pathname; } catch { return ''; } };
  const ids = await app.evaluate(({ webContents }) => {
    const all = webContents.getAllWebContents().filter((w) => !w.isDestroyed() && w.getURL().startsWith('http'));
    const office = all.find((w) => new URL(w.getURL()).pathname.startsWith('/office'));
    const ops = all.find((w) => w !== office);
    return { ops: ops && ops.id, office: office && office.id };
  });
  // the two site pages are found once, by id, so they stay findable whatever address they are on
  const inTab = (id, code) => app.evaluate(({ webContents }, a) => { const wc = webContents.fromId(a.wid); return wc && !wc.isDestroyed() ? wc.executeJavaScript(a.code) : '__missing__'; }, { wid: ids[id], code });
  const urlOf = (id) => inTab(id, 'location.href');
  const active = () => bar.evaluate(() => document.querySelector('button[aria-selected="true"]').dataset.tab);

  // ---- the two tabs
  check('has a KD Ops tab and an Office tab', (await bar.locator('button[data-tab]').count()) === 2);
  check('the ops site opens in the KD Ops tab', (await urlOf('ops')).startsWith(base + '/') && !(await urlOf('ops')).includes('/office'), await urlOf('ops'));
  check('the office opens in the Office tab', (await urlOf('office')).includes('/office'), await urlOf('office'));
  check('KD Ops is the tab shown first', (await active()) === 'ops');

  const ua = await inTab('ops', 'navigator.userAgent');
  check('site can tell it is the desktop app (user agent)', /KDOfficeDesktop\/\d/.test(ua) && /KDOpsDesktop\/\d/.test(ua), ua.match(/KDOfficeDesktop\/\S+/)?.[0] || '');
  const bridge = async (id) => JSON.parse(await inTab(id, 'JSON.stringify({ platform: window.kdDesktop && window.kdDesktop.platform, fns: window.kdDesktop ? Object.keys(window.kdDesktop).sort().join(",") : "" })'));
  const bo = await bridge('ops'); const bf = await bridge('office');
  check('desktop bridge is exposed to both tabs', bo.platform === process.platform && bf.platform === process.platform && bo.fns.includes('notify') && bf.fns.includes('setBadge') && bf.fns.includes('focus'), bf.fns);

  // ---- only the tab you are on is shown, the other keeps running
  await inTab('office', 'window.__ticks = 0; setInterval(() => { window.__ticks++; }, 100); 1');
  await bar.waitForTimeout(2500);
  const ticks = await inTab('office', 'window.__ticks');
  check('the Office keeps running while it is hidden (not put to sleep)', ticks >= 20, 'ticks in 2.5s: ' + ticks);

  await bar.click('button[data-tab="office"]');
  await bar.waitForTimeout(500);
  check('clicking the Office tab shows the Office', (await active()) === 'office');
  await bar.click('button[data-tab="ops"]');
  await bar.waitForTimeout(500);
  check('clicking the KD Ops tab switches back', (await active()) === 'ops');

  // ---- the site's own links keep each page in its own tab
  await inTab('ops', "history.pushState({}, '', '/office'); 1");
  await bar.waitForTimeout(900);
  check('opening the Office from inside KD Ops goes to the Office tab', (await active()) === 'office');
  check('...and KD Ops itself is not left sitting on the Office page', !(await urlOf('ops')).includes('/office'), await urlOf('ops'));
  await bar.click('button[data-tab="ops"]');
  await bar.waitForTimeout(300);
  await inTab('ops', "window.open('/office'); 1");
  await bar.waitForTimeout(700);
  check('a link that opens a new window onto the Office goes to the Office tab', (await active()) === 'office');
  await inTab('office', "history.pushState({}, '', '/dashboard'); 1");
  await bar.waitForTimeout(900);
  check('leaving the Office for a KD Ops page goes to the KD Ops tab', (await active()) === 'ops' && (await urlOf('office')).includes('/office'), await urlOf('office'));

  // ---- notifications: record what the app is asked to show (nothing is really shown, so the test never pops up on someone's screen)
  await app.evaluate(({ Notification }) => {
    global.__shown = [];
    const proto = Notification.prototype;
    proto.show = function () { global.__shown.push({ title: this.title, body: this.body }); };
  });
  const supported = await app.evaluate(({ Notification }) => Notification.isSupported());
  check('system notifications are supported on this computer', supported);
  await inTab('office', "window.kdDesktop.notify({ id: 'ring:test', title: 'Test is at your door', body: 'Ringing you' }); 1");
  await inTab('office', "window.kdDesktop.notify({ id: 'wave:test', title: 'Test waved at you', body: 'Wave back' }); 1");
  await inTab('ops', "window.kdDesktop.notify({ id: 'msg:test', title: 'Test: Hello', body: 'a message' }); 1");
  await bar.waitForTimeout(800);
  const shown = await app.evaluate(() => global.__shown);
  check('ring, wave and message each raise a real notification', shown.length === 3 && shown[0].title.includes('door') && shown[1].title.includes('waved') && shown[2].title.includes('Hello'), JSON.stringify(shown.map((s) => s.title)));
  const bad = await inTab('office', "(() => { try { window.kdDesktop.notify({}); window.kdDesktop.notify({ id: 1, title: '' }); return 'ok'; } catch (e) { return String(e); } })()");
  check('a bad notification request does not crash the app', bad === 'ok');
  await bar.waitForTimeout(500);
  const shownAfterBad = await app.evaluate(() => global.__shown);
  check('an empty notification request shows nothing (never "undefined")', shownAfterBad.length === 3, JSON.stringify(shownAfterBad.map((s) => s.title)));
  const audio = await inTab('office', "(() => { const c = new AudioContext(); const s = c.state; c.close(); return s; })()");
  check('sound can play without anyone clicking first (rings and messages are heard from the tray)', audio === 'running', audio);

  const perm = await inTab('office', "navigator.permissions.query({ name: 'notifications' }).then((r) => r.state)");
  check('notifications are allowed without a prompt', perm === 'granted', perm);

  // ---- tray behaviour: closing the window keeps the app alive and hidden; a notification click brings the right tab back
  const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await bar.waitForTimeout(500);
  const after = await app.evaluate(({ BrowserWindow }) => ({ n: BrowserWindow.getAllWindows().length, visible: BrowserWindow.getAllWindows()[0] ? BrowserWindow.getAllWindows()[0].isVisible() : null }));
  check('closing the window hides it to the tray (you stay in the office)', before === 1 && after.n === 1 && after.visible === false, JSON.stringify(after));
  await inTab('office', 'window.__ticks2 = 0; setInterval(() => { window.__ticks2++; }, 100); 1');
  const officeKept = await inTab('office', 'window.__ticks2');
  await bar.waitForTimeout(1000);
  check('the Office keeps running while the window is in the tray', (await inTab('office', 'window.__ticks2')) > officeKept);
  await inTab('office', 'window.kdDesktop.focus(); 1');
  await bar.waitForTimeout(600);
  const back = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
  check('focus request (clicking a notification) brings the window back on the right tab', back === true && (await active()) === 'office');

  // ---- other sites never replace the app, they open in the normal browser (recorded here, never really opened)
  await app.evaluate(({ shell }) => { global.__opened = []; shell.openExternal = (u) => { global.__opened.push(u); return Promise.resolve(); }; });
  await inTab('ops', "window.open('https://example.com'); 1");
  await bar.waitForTimeout(500);
  check('links to other sites do not replace KD Ops', (await urlOf('ops')).startsWith(base));
  await inTab('office', "window.open('https://example.com'); 1");
  await bar.waitForTimeout(500);
  check('links to other sites do not replace the Office', (await urlOf('office')).includes('/office'));
  const opened = await app.evaluate(() => global.__opened);
  check('...they are handed to the normal browser instead', opened.length === 2 && opened.every((u) => u.startsWith('https://example.com')), JSON.stringify(opened));

  await app.evaluate(({ app }) => { app.exit(0); }).catch(() => undefined);
  server.close();

  // ---- offline screen: point at a port nothing listens on
  const dead = await new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const app2 = await _electron.launch({ executablePath: exe, args: [...args, `--user-data-dir=${userData}-2`], cwd, env: { ...cleanEnv(), KD_OPS_URL: `http://127.0.0.1:${dead}/` } });
  const bar2 = await app2.firstWindow();
  await bar2.waitForTimeout(5500);
  const urls = await app2.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()));
  check('shows the friendly offline screen in both tabs when the site cannot be reached', urls.filter((u) => u.endsWith('offline.html')).length === 2, JSON.stringify(urls.map((u) => u.split('/').pop())));
  await app2.evaluate(({ app }) => app.exit(0)).catch(() => undefined);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
