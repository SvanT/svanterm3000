import type { IpcRenderer } from "electron";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  startTerminal: (): void => ipcRenderer.send("start-terminal"),
  newTerminal: (): void => ipcRenderer.send("new-terminal"),
  onTerminalOutput: (callback): IpcRenderer =>
    ipcRenderer.on("terminal-output", (_, data): void => callback(data)),
  sendInput: (input): void => ipcRenderer.send("terminal-input", input),
  resizeTerminal: (cols, rows): void =>
    ipcRenderer.send("resize-terminal", cols, rows),
  clipboardWrite: (text): void => ipcRenderer.send("clipboard-write", text),
  openLink: (uri): void => ipcRenderer.send("open-link", uri),
});
