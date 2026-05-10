const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const dataPath     = path.join(app.getPath('userData'), 'kanban-data.json');
const settingsPath = path.join(app.getPath('userData'), 'kanban-settings.json');

// ── Local data ──────────────────────────────────────────────────────────────

function loadLocal() {
  try {
    if (fs.existsSync(dataPath)) return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (e) {}
  return null;
}

function saveLocal(data) {
  data.lastModified = Date.now();
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// ── Settings ─────────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {}
  return { token: '', gistId: '' };
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ── GitHub Gist sync ─────────────────────────────────────────────────────────

function githubRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'KanbanApp/1.0',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function fetchGist(token, gistId) {
  const res = await githubRequest('GET', `/gists/${gistId}`, token);
  if (res.status !== 200) throw new Error(`GitHub returned ${res.status}`);
  const content = res.body.files?.['kanban-data.json']?.content;
  if (!content) throw new Error('kanban-data.json not found in Gist');
  return JSON.parse(content);
}

async function pushGist(token, gistId, data) {
  const res = await githubRequest('PATCH', `/gists/${gistId}`, token, {
    files: { 'kanban-data.json': { content: JSON.stringify(data, null, 2) } },
  });
  if (res.status !== 200) throw new Error(`GitHub returned ${res.status}`);
  return true;
}

async function createGist(token) {
  const res = await githubRequest('POST', '/gists', token, {
    description: 'Kanban App Data',
    public: false,
    files: { 'kanban-data.json': { content: JSON.stringify({ columns: [], lastModified: Date.now() }, null, 2) } },
  });
  if (res.status !== 201) throw new Error(`GitHub returned ${res.status}`);
  return res.body.id;
}

// ── Sync logic ────────────────────────────────────────────────────────────────

async function syncOnStart(settings) {
  if (!settings.token || !settings.gistId) return { status: 'no-config' };
  try {
    const remote = await fetchGist(settings.token, settings.gistId);
    const local  = loadLocal();
    if (!local || (remote.lastModified && remote.lastModified > (local.lastModified || 0))) {
      saveLocal(remote);
      return { status: 'pulled', data: remote };
    }
    return { status: 'local-newer', data: local };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function syncOnClose(settings, data) {
  if (!settings.token || !settings.gistId) return { status: 'no-config' };
  try {
    await pushGist(settings.token, settings.gistId, data);
    return { status: 'pushed' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

// ── Window ────────────────────────────────────────────────────────────────────

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 700,
    minHeight: 450,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('load-data',      ()         => loadLocal());
ipcMain.handle('save-data',      (_, data)  => { saveLocal(data); return true; });
ipcMain.handle('load-settings',  ()         => loadSettings());
ipcMain.handle('save-settings',  (_, s)     => { saveSettings(s); return true; });
ipcMain.handle('sync-on-start',  ()         => syncOnStart(loadSettings()));
ipcMain.handle('sync-on-close',  (_, data)  => syncOnClose(loadSettings(), data));
ipcMain.handle('create-gist',    (_, token) => createGist(token));
ipcMain.handle('test-connection', async (_, { token, gistId }) => {
  try {
    await fetchGist(token, gistId);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});
