// Where the updater keeps a downloaded installer.
//
// On some Windows computers the whole AppData folder is encrypted (EFS). A file written there cannot be renamed into place
// ("EXDEV: cross-device link not permitted"), so the updater downloads the new version and then fails to save it: the app never
// updates, and people have to reinstall by hand. The updater's own folder is checked once at start with a small file; if it cannot
// be renamed there, the first folder where it can is used instead.
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Can a file just written here be renamed? (what the updater does with every download) */
function renameWorks(dir) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok, ...cleanup) => {
      if (done) return;
      done = true;
      for (const f of cleanup) { try { fs.rmSync(f, { force: true }); } catch { /* fine */ } }
      resolve(ok);
    };
    try {
      fs.mkdirSync(dir, { recursive: true });
      const a = path.join(dir, 'rename-test.tmp');
      const b = path.join(dir, 'rename-test.done');
      const ws = fs.createWriteStream(a);
      ws.on('error', () => finish(false, a, b));
      ws.end(Buffer.alloc(512 * 1024, 7), () => {
        try { fs.renameSync(a, b); finish(true, a, b); } catch { finish(false, a, b); }
      });
    } catch { finish(false); }
  });
}

/** The folders to try, best first. The first is the updater's own. */
function candidates(name) {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const list = [path.join(local, name), path.join(local, 'Programs', name), path.join(os.homedir(), '.' + name)];
  if (process.env.ProgramData) list.push(path.join(process.env.ProgramData, name));
  return list;
}

/**
 * Make the updater save downloads somewhere a rename works. `name` is the updater's folder name (the same as in app-update.yml).
 * Returns the folder that is used, or null if the default is fine (or this is not Windows, or nothing better was found).
 */
async function useSafeUpdateCache(autoUpdater, name, log) {
  if (process.platform !== 'win32') return null;
  try {
    const list = candidates(name);
    for (let i = 0; i < list.length; i++) {
      if (!(await renameWorks(list[i]))) {
        if (i === 0) log?.('updates cannot be saved in', list[0], '(renaming a downloaded file fails there); looking for another folder');
        continue;
      }
      if (i === 0) return null;
      const { DownloadedUpdateHelper } = require('electron-updater/out/DownloadedUpdateHelper');
      autoUpdater.downloadedUpdateHelper = new DownloadedUpdateHelper(list[i]);
      log?.('saving updates in', list[i], 'instead');
      return list[i];
    }
    log?.('no folder found where a downloaded update can be saved');
  } catch (e) {
    log?.('could not choose an update folder:', e);
  }
  return null;
}

module.exports = { useSafeUpdateCache, renameWorks, candidates };
