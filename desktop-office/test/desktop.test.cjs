// Launches the real KD Office desktop app against a tiny local page and checks what the app itself provides.
const { _electron } = require('playwright');
const http = require('http');
const path = require('path');
const exe = process.env.KD_EXE || require('electron');
const args = process.env.KD_EXE ? [] : ['.'];
const cwd = path.join(__dirname, '..');
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><title>(2) Virtual Office</title><div id="root"><p>test page</p></div>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const userData = path.join(require('os').tmpdir(), 'kd-office-test-' + Date.now());
  const app = await _electron.launch({ executablePath: exe, args: [...args, `--user-data-dir=${userData}`], cwd, env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ELECTRON_'))), KD_OFFICE_URL: `http://127.0.0.1:${port}/office` } });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  check('opens the site in its window', (await page.url()).includes('/office'), await page.url());
  const ua = await page.evaluate(() => navigator.userAgent);
  check('site can tell it is the desktop app (user agent)', /KDOfficeDesktop\/\d/.test(ua), ua.match(/KDOfficeDesktop\/\S+/)?.[0] || '');
  const bridge = await page.evaluate(() => ({ platform: window.kdDesktop && window.kdDesktop.platform, fns: window.kdDesktop ? Object.keys(window.kdDesktop).sort().join(',') : '' }));
  check('desktop bridge is exposed to the page', bridge.platform === process.platform && bridge.fns.includes('notify') && bridge.fns.includes('focus') && bridge.fns.includes('setBadge'), bridge.fns);

  // notifications: record what the app really shows
  await app.evaluate(({ Notification }) => {
    global.__shown = [];
    const proto = Notification.prototype;
    const orig = proto.show;
    proto.show = function () { global.__shown.push({ title: this.title, body: this.body }); return orig.call(this); };
  });
  const supported = await app.evaluate(({ Notification }) => Notification.isSupported());
  check('system notifications are supported on this computer', supported);
  await page.evaluate(() => window.kdDesktop.notify({ id: 'ring:test', title: 'Test is at your door', body: 'Ringing you' }));
  await page.evaluate(() => window.kdDesktop.notify({ id: 'wave:test', title: 'Test waved at you', body: 'Wave back' }));
  await page.evaluate(() => window.kdDesktop.notify({ id: 'msg:test', title: 'Test: Hello', body: 'a message' }));
  await page.waitForTimeout(800);
  const shown = await app.evaluate(() => global.__shown);
  check('ring, wave and message each raise a real notification', shown.length === 3 && shown[0].title.includes('door') && shown[1].title.includes('waved') && shown[2].title.includes('Hello'), JSON.stringify(shown.map((s) => s.title)));
  const bad = await page.evaluate(() => { try { window.kdDesktop.notify({}); window.kdDesktop.notify({ id: 1, title: '' }); return 'ok'; } catch (e) { return String(e); } });
  check('a bad notification request does not crash the app', bad === 'ok');

  // permissions: the page may use notifications and the microphone and camera without a browser prompt
  const perm = await page.evaluate(async () => (await navigator.permissions.query({ name: 'notifications' })).state);
  check('notifications are allowed without a prompt', perm === 'granted', perm);

  // title count -> unread badge, then focus clears it
  const title = await page.title();
  check('page title with a count is passed through ("(2) …")', /^\(2\)/.test(title), title);

  // tray behaviour: closing the window keeps the app alive and hidden
  const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await page.waitForTimeout(500);
  const after = await app.evaluate(({ BrowserWindow }) => ({ n: BrowserWindow.getAllWindows().length, visible: BrowserWindow.getAllWindows()[0] ? BrowserWindow.getAllWindows()[0].isVisible() : null }));
  check('closing the window hides it to the tray (you stay in the office)', before === 1 && after.n === 1 && after.visible === false, JSON.stringify(after));
  await page.evaluate(() => window.kdDesktop.focus()).catch(() => undefined);
  await page.waitForTimeout(500);
  const shownAgain = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
  check('focus request (clicking a notification) brings the window back', shownAgain === true);

  // external links never navigate the window away
  const ext = await page.evaluate(() => { try { window.open('https://example.com'); return 'tried'; } catch (e) { return String(e); } });
  await page.waitForTimeout(400);
  check('links to other sites do not replace the office', (await page.url()).includes('127.0.0.1'), ext);

  await app.evaluate(({ app }) => { global.__quit = true; app.exit(0); }).catch(() => undefined);
  server.close();

  // offline screen: point at a port nothing listens on
  const dead = await new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const app2 = await _electron.launch({ executablePath: exe, args: [...args, `--user-data-dir=${userData}-2`], cwd, env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ELECTRON_'))), KD_OFFICE_URL: `http://127.0.0.1:${dead}/office` } });
  const p2 = await app2.firstWindow();
  await p2.waitForTimeout(4000);
  const off = await p2.url();
  check('shows the friendly offline screen when the site cannot be reached', off.endsWith('offline.html'), off);
  await app2.evaluate(({ app }) => app.exit(0)).catch(() => undefined);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
