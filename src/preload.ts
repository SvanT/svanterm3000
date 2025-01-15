const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	startTerminal: () => ipcRenderer.send("start-terminal"),
	newTerminal: () => ipcRenderer.send("new-terminal"),
	onTerminalOutput: (callback) =>
		ipcRenderer.on("terminal-output", (_, data) => callback(data)),
	sendInput: (input) => ipcRenderer.send("terminal-input", input),
	resizeTerminal: (cols, rows) =>
		ipcRenderer.send("resize-terminal", cols, rows),
	clipboardWrite: (text) => ipcRenderer.send("clipboard-write", text),
});
