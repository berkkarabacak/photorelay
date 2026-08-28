// PhotoRelay preload — exposes a tiny, safe bridge to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("photorelay", {
  getState: () => ipcRenderer.invoke("get-state"),
  onState: (cb) => {
    const handler = (_event, state) => cb(state);
    ipcRenderer.on("state", handler);
    return () => ipcRenderer.removeListener("state", handler);
  },
});
