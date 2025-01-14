import path from "path";
import { BrowserWindow, app, clipboard, ipcMain } from "electron";
import started from "electron-squirrel-startup";
import type { IPty } from "node-pty";

const pty = require("node-pty");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
	app.quit();
}

const createWindow = () => {
	// Create the browser window.
	const mainWindow = new BrowserWindow({
		show: false,
		webPreferences: { preload: path.join(__dirname, "preload.js") },
	});

	mainWindow.removeMenu();
	mainWindow.maximize();

	// and load the index.html of the app.
	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
	} else {
		mainWindow.loadFile(
			path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
		);
	}

	mainWindow.show();

	//mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

ipcMain.on("start-terminal", (event) => {
	// Spawn a shell
	const shell = process.platform === "win32" ? "wsl.exe" : "bash";
	const ptyProcess: IPty = pty.spawn(shell);

	// Listen to terminal output and send to renderer
	ptyProcess.onData((data) => {
		event.sender.send("terminal-output", data);
	});

	ptyProcess.onExit(() => {
		app.quit();
	});

	// Listen to input from renderer
	ipcMain.on("terminal-input", (event, input) => {
		ptyProcess.write(input);
	});

	// Resize terminal
	ipcMain.on("resize-terminal", (event, cols, rows) => {
		ptyProcess.resize(cols, rows);
	});

	ipcMain.on("clipboard-write", (event, text) => {
		clipboard.writeText(text);
	});
});
