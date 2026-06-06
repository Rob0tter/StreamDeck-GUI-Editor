const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    listProfiles:     ()                   => ipcRenderer.invoke('profiles:list'),
    readRegistry:     ()                   => ipcRenderer.invoke('registry:raw'),
    saveProfile:      (manifestPath, content) => ipcRenderer.invoke('profile:save', { manifestPath, content }),
    listPages:        (profileGuid)        => ipcRenderer.invoke('pages:list',      { profileGuid }),
    openElement:      (profileGuid, elementGuid) => ipcRenderer.invoke('element:open', { profileGuid, elementGuid }),
    restartStreamDeck:()                   => ipcRenderer.invoke('streamdeck:restart'),
    getConfig:        (section, key, fallback) => ipcRenderer.invoke('config:get',  { section, key, fallback }),
    setConfig:        (section, key, value) => ipcRenderer.invoke('config:set',     { section, key, value }),
    loadLang:         (lang)               => ipcRenderer.invoke('lang:load',       { lang }),
    rebuildMenu:      (lang)               => ipcRenderer.invoke('menu:rebuild',    { lang }),
    loadImg:          (filename)           => ipcRenderer.invoke('img:load',        { filename }),

    // Menue-Events empfangen (Main -> Renderer)
    onMenuEvent: (callback) => {
        ipcRenderer.on('menu:save',        () => callback('save'));
        ipcRenderer.on('menu:reload',      () => callback('reload'));
        ipcRenderer.on('menu:restartSD',   () => callback('restartSD'));
        ipcRenderer.on('menu:toggleTheme', () => callback('toggleTheme'));
        ipcRenderer.on('menu:setLang',     (_event, lang) => callback('setLang', lang));
    },
});
