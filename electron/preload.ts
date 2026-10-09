/** The bridge between the page and the desktop app: a native folder dialog for choosing the GB Studio project. */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("gbpaint", {
  platform: process.platform,
  /** Opens the folder dialog; resolves to the chosen project folder (already set on the server), or null. */
  chooseProject: (): Promise<string | null> => ipcRenderer.invoke("gbpaint-choose-project"),
});
