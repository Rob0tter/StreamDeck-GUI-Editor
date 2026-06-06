const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { execSync, exec, spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Plattform
// ---------------------------------------------------------------------------
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// ---------------------------------------------------------------------------
// Konfiguration (INI)
// ---------------------------------------------------------------------------
const CONFIG_PATH = path.join(__dirname, '..', 'config.ini');

function parseIni(text) {
    const result = {};
    let section = '__default__';
    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(';') || line.startsWith('#')) continue;
        const secMatch = line.match(/^\[(.+)\]$/);
        if (secMatch) {
            section = secMatch[1];
            result[section] = result[section] || {};
            continue;
        }
        const kvMatch = line.match(/^([^=]+)=(.*)$/);
        if (kvMatch) {
            result[section] = result[section] || {};
            result[section][kvMatch[1].trim()] = kvMatch[2].trim();
        }
    }
    return result;
}

function serializeIni(obj) {
    let out = '';
    for (const [section, keys] of Object.entries(obj)) {
        if (section === '__default__') continue;
        out += '[' + section + ']\n';
        for (const [k, v] of Object.entries(keys)) {
            out += k + '=' + v + '\n';
        }
        out += '\n';
    }
    return out;
}

function readConfig() {
    try {
        return parseIni(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
        return { StreamDeck: {}, UI: {}, Shortcuts: {} };
    }
}

function writeConfig(cfg) {
    fs.writeFileSync(CONFIG_PATH, serializeIni(cfg), 'utf8');
}

function getConfigValue(section, key, fallback) {
    if (fallback === undefined) fallback = '';
    const cfg = readConfig();
    const val = cfg && cfg[section] && cfg[section][key];
    return (val !== undefined && val !== null && val !== '') ? val : fallback;
}

function setConfigValue(section, key, value) {
    const cfg = readConfig();
    cfg[section] = cfg[section] || {};
    cfg[section][key] = value;
    writeConfig(cfg);
}

// ---------------------------------------------------------------------------
// Sprachdatei laden (synchron, fuer Menue)
// ---------------------------------------------------------------------------
function loadLangSync(lang) {
    const langPath = path.join(__dirname, '..', 'language', lang + '.json');
    try {
        return JSON.parse(fs.readFileSync(langPath, 'utf8'));
    } catch (e) {
        console.error('loadLangSync error:', e.message);
        return {};
    }
}

function menuT(strings, key) {
    if (!strings || Object.keys(strings).length === 0) {
        // Fallback-Texte wenn Sprachdatei nicht geladen werden konnte
        const fallback = {
            menu_file:'File', menu_file_save:'Save', menu_file_reload:'Reload',
            menu_file_restart_sd:'Restart SD', menu_file_quit:'Quit',
            menu_edit:'Edit', menu_edit_undo:'Undo', menu_edit_redo:'Redo',
            menu_edit_cut:'Cut', menu_edit_copy:'Copy', menu_edit_paste:'Paste',
            menu_edit_selectall:'Select All',
            menu_view:'View', menu_view_theme:'Toggle Theme',
            menu_view_lang_de:'German', menu_view_lang_en:'English',
            menu_help:'Help', menu_help_devtools:'DevTools',
            menu_help_about:'About', about_title:'About', about_message:'SD Editor',
        };
        return fallback[key] || key;
    }
    return strings[key] || key;
}

// ---------------------------------------------------------------------------
// Modell-Tabelle
// ---------------------------------------------------------------------------
const MODEL_NAMES = {
    '10GAA9901': 'Stream Deck (Original, 15 Keys)',
    '20GAA9901': 'Stream Deck (Original, 15 Keys)',
    '10GBA9901': 'Stream Deck MK.2 (15 Keys)',
    '20GBA9901': 'Stream Deck MK.2 (15 Keys)',
    '10GAI9901': 'Stream Deck Mini (6 Keys)',
    '20GAI9901': 'Stream Deck Mini (6 Keys)',
    '10GAT9901': 'Stream Deck XL (32 Keys)',
    '20GAT9901': 'Stream Deck XL (32 Keys)',
    '10GBD9901': 'Stream Deck+ (8 Keys + 4 Dials)',
    '20GBD9901': 'Stream Deck+ (8 Keys + 4 Dials)',
    '10GBX9901': 'Stream Deck+ XL (36 Keys + 6 Dials)',
    '20GBX9901': 'Stream Deck+ XL (36 Keys + 6 Dials)',
    '10GBJ9901': 'Stream Deck Neo (8 Keys)',
    '20GBJ9901': 'Stream Deck Neo (8 Keys)',
    '20GBM9901': 'Stream Deck Studio (32 Keys)',
    'UI Stream Deck': 'Virtual Stream Deck (Software)',
};

function getModelName(model) {
    return MODEL_NAMES[model] || ('Unknown (' + model + ')');
}

// ---------------------------------------------------------------------------
// Pfade
// ---------------------------------------------------------------------------
function getProfilesDir() {
    if (IS_WIN) return path.join(process.env.APPDATA, 'Elgato', 'StreamDeck', 'ProfilesV3');
    if (IS_MAC) return path.join(os.homedir(), 'Library', 'Application Support', 'com.elgato.StreamDeck', 'ProfilesV3');
    return null;
}

// ---------------------------------------------------------------------------
// Registry (Windows)
// ---------------------------------------------------------------------------
function readRegistryRaw() {
    if (!IS_WIN) return null;
    try {
        const tmpFile = path.join(os.tmpdir(), 'sd_reg_read.ps1');
        const psScript = '$val = Get-ItemPropertyValue "HKCU:\\Software\\Elgato Systems GmbH\\StreamDeck" -Name "Devices" -ErrorAction Stop\r\n($val | ForEach-Object { $_ }) -join ","';
        fs.writeFileSync(tmpFile, psScript, 'utf8');
        const result = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + tmpFile + '"', { encoding: 'utf8' });
        fs.unlinkSync(tmpFile);
        const bytes = result.trim().split(',').map(Number);
        return Buffer.from(bytes);
    } catch (e) {
        console.error('readRegistryRaw error:', e.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Profile einlesen
// ---------------------------------------------------------------------------
function readProfilesRaw() {
    const dir = getProfilesDir();
    if (!dir || !fs.existsSync(dir)) return [];
    const result = [];
    const entries = fs.readdirSync(dir).filter(function(f) { return f.endsWith('.sdProfile'); });
    for (const entry of entries) {
        const profileDir   = path.join(dir, entry);
        const manifestPath = path.join(profileDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        const raw = fs.readFileSync(manifestPath, 'utf8');
        let profileModel = '';
        try { profileModel = JSON.parse(raw).Device.Model || ''; } catch {}
        result.push({
            guid:         path.basename(entry, '.sdProfile'),
            manifestPath: manifestPath,
            manifestRaw:  raw,
            modelName:    getModelName(profileModel),
        });
    }
    return result;
}

// ---------------------------------------------------------------------------
// Menue aufbauen
// ---------------------------------------------------------------------------
let mainWindow = null;

function buildMenu(lang) {
    const s = loadLangSync(lang);
    const sc  = readConfig().Shortcuts || {};
    const get = function(key, def) { return sc[key] && sc[key].trim() ? sc[key].trim() : def; };

    const template = [
        {
            label: menuT(s, 'menu_file'),
            submenu: [
                {
                    label:       menuT(s, 'menu_file_save'),
                    accelerator: get('Save', 'CmdOrCtrl+S'),
                    click: function() { if (mainWindow) mainWindow.webContents.send('menu:save'); }
                },
                { type: 'separator' },
                {
                    label:       menuT(s, 'menu_file_reload'),
                    accelerator: get('Reload', 'CmdOrCtrl+R'),
                    click: function() { if (mainWindow) mainWindow.webContents.send('menu:reload'); }
                },
                {
                    label:       menuT(s, 'menu_file_restart_sd'),
                    accelerator: get('RestartSD', 'CmdOrCtrl+Shift+R'),
                    click: function() { if (mainWindow) mainWindow.webContents.send('menu:restartSD'); }
                },
                { type: 'separator' },
                {
                    label: menuT(s, 'menu_file_quit'),
                    accelerator: IS_MAC ? 'Cmd+Q' : 'Alt+F4',
                    click: function() { app.quit(); }
                },
            ]
        },
        {
            label: menuT(s, 'menu_edit'),
            submenu: [
                { label: menuT(s, 'menu_edit_undo'),      role: 'undo'      },
                { label: menuT(s, 'menu_edit_redo'),      role: 'redo'      },
                { type: 'separator' },
                { label: menuT(s, 'menu_edit_cut'),       role: 'cut'       },
                { label: menuT(s, 'menu_edit_copy'),      role: 'copy'      },
                { label: menuT(s, 'menu_edit_paste'),     role: 'paste'     },
                { label: menuT(s, 'menu_edit_selectall'), role: 'selectAll' },
            ]
        },
        {
            label: menuT(s, 'menu_view'),
            submenu: [
                {
                    label:       menuT(s, 'menu_view_theme'),
                    accelerator: get('ToggleTheme', 'CmdOrCtrl+Shift+T'),
                    click: function() { if (mainWindow) mainWindow.webContents.send('menu:toggleTheme'); }
                },
                { type: 'separator' },
                {
                    label: menuT(s, 'menu_view_lang_de'),
                    type:  'radio',
                    checked: lang === 'de',
                    click: function() { if (mainWindow) mainWindow.webContents.send('menu:setLang', 'de'); }
                },
                {
                    label: menuT(s, 'menu_view_lang_en'),
                    type:  'radio',
                    checked: lang === 'en',
                    click: function() { if (mainWindow) mainWindow.webContents.send('menu:setLang', 'en'); }
                },
            ]
        },
        {
            label: menuT(s, 'menu_help'),
            submenu: [
                {
                    label:       menuT(s, 'menu_help_devtools'),
                    accelerator: get('DevTools', 'F12'),
                    click: function() { if (mainWindow) mainWindow.webContents.toggleDevTools(); }
                },
                { type: 'separator' },
                {
                    label: menuT(s, 'menu_help_about'),
                    click: function() {
                        dialog.showMessageBox(mainWindow, {
                            type:    'info',
                            title:   menuT(s, 'about_title'),
                            message: menuT(s, 'about_message'),
                            buttons: ['OK'],
                        });
                    }
                },
            ]
        },
    ];

    // macOS: App-Menue an erster Stelle
    if (IS_MAC) {
        template.unshift({
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
            ]
        });
    }

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC Handler
// ---------------------------------------------------------------------------

ipcMain.handle('profiles:list', function() {
    return readProfilesRaw();
});

ipcMain.handle('registry:raw', function() {
    const buf = readRegistryRaw();
    if (!buf) return { supported: false, hex: null };
    return { supported: true, hex: buf.toString('hex') };
});

ipcMain.handle('profile:save', function(_event, args) {
    try {
        fs.writeFileSync(args.manifestPath, args.content, 'utf8');
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('pages:list', function(_event, args) {
    const dir = getProfilesDir();
    if (!dir) return [];
    const profileDir = path.join(dir, args.profileGuid + '.sdProfile');
    const profileManifestPath = path.join(profileDir, 'manifest.json');
    if (!fs.existsSync(profileManifestPath)) return [];
    let profileManifest;
    try {
        profileManifest = JSON.parse(fs.readFileSync(profileManifestPath, 'utf8'));
    } catch (e) {
        console.error('pages:list parse error:', e.message);
        return [];
    }
    const pageGuids   = (profileManifest.Pages && profileManifest.Pages.Pages) ? profileManifest.Pages.Pages : [];
    const defaultPg   = profileManifest.Pages && profileManifest.Pages.Default ? profileManifest.Pages.Default.toLowerCase() : '';
    const profilesDir = path.join(profileDir, 'Profiles');
    const result = [];
    let existingDirs = [];
    try { existingDirs = fs.readdirSync(profilesDir); } catch {}
    const dirMap = {};
    for (const d of existingDirs) dirMap[d.toLowerCase()] = d;
    for (let i = 0; i < pageGuids.length; i++) {
        const pageGuidRaw = pageGuids[i];
        const pageGuidLow = pageGuidRaw.toLowerCase();
        const actualDir   = dirMap[pageGuidLow];
        if (!actualDir) { console.warn('pages:list: dir not found for guid', pageGuidRaw); continue; }
        const manifestPath = path.join(profilesDir, actualDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        const raw = fs.readFileSync(manifestPath, 'utf8');
        let name = '';
        try { name = JSON.parse(raw).Name || ''; } catch {}
        result.push({
            guid:         pageGuidRaw,
            index:        i,
            name:         name || ('Seite ' + (i + 1)),
            manifestPath: manifestPath,
            manifestRaw:  raw,
            isDefault:    pageGuidLow === defaultPg,
        });
    }
    return result;
});

ipcMain.handle('element:open', function(_event, args) {
    const dir = getProfilesDir();
    if (!dir) return { ok: false };
    const profileDir = path.join(dir, args.profileGuid + '.sdProfile');
    const searchDirs = [
        path.join(profileDir, 'Profiles'),
        profileDir,
    ];
    for (const base of searchDirs) {
        if (!fs.existsSync(base)) continue;
        let entries = [];
        try { entries = fs.readdirSync(base); } catch { continue; }
        const match = entries.find(function(e) { return e.toLowerCase() === args.elementGuid.toLowerCase(); });
        if (!match) continue;
        const manifestPath = path.join(base, match, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        const raw = fs.readFileSync(manifestPath, 'utf8');
        return { ok: true, manifestPath: manifestPath, manifestRaw: raw };
    }
    return { ok: false };
});

ipcMain.handle('streamdeck:restart', function() {
    const exePath = IS_WIN
        ? getConfigValue('StreamDeck', 'ExePath', 'C:\\Program Files\\Elgato\\StreamDeck\\StreamDeck.exe')
        : getConfigValue('StreamDeck', 'MacAppPath', '/Applications/Stream Deck.app');
    const killCmd = IS_WIN ? 'taskkill /F /IM StreamDeck.exe' : 'pkill -x "Stream Deck"';
    return new Promise(function(resolve) {
        exec(killCmd, function() {
            setTimeout(function() {
                try {
                    if (IS_WIN) {
                        spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
                    } else {
                        spawn('open', ['-a', 'Stream Deck'], { detached: true, stdio: 'ignore' }).unref();
                    }
                    resolve({ ok: true });
                } catch (e) {
                    resolve({ ok: false, error: e.message });
                }
            }, 1500);
        });
    });
});

ipcMain.handle('config:get', function(_event, args) {
    return getConfigValue(args.section, args.key, args.fallback);
});

ipcMain.handle('config:set', function(_event, args) {
    setConfigValue(args.section, args.key, args.value);
    return { ok: true };
});

ipcMain.handle('lang:load', function(_event, args) {
    return loadLangSync(args.lang);
});

// Menue neu aufbauen (nach Sprachwechsel)
ipcMain.handle('menu:rebuild', function(_event, args) {
    buildMenu(args.lang);
    return { ok: true };
});

ipcMain.handle('img:load', function(_event, args) {
    const imgDir = path.join(__dirname, '..', 'img');
    const candidates = [];
    if (args.filename) candidates.push(path.join(imgDir, args.filename));
    candidates.push(path.join(imgDir, 'default.jpg'));
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            try {
                const data   = fs.readFileSync(candidate);
                const base64 = data.toString('base64');
                const ext    = path.extname(candidate).toLowerCase().replace('.', '');
                const mime   = ext === 'png' ? 'image/png' : 'image/jpeg';
                return { ok: true, data: 'data:' + mime + ';base64,' + base64 };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        }
    }
    return { ok: false, error: 'No image found' };
});

// ---------------------------------------------------------------------------
// Fenster
// ---------------------------------------------------------------------------
function createWindow() {
    mainWindow = new BrowserWindow({
        width:  1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0b0c10',
        titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration:  false,
        },
    });
    mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
    mainWindow.on('closed', function() { mainWindow = null; });
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(function() {
    const lang = getConfigValue('UI', 'Language', 'de');
    buildMenu(lang);
    createWindow();
});

app.on('window-all-closed', function() { if (!IS_MAC) app.quit(); });
app.on('activate', function() { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
