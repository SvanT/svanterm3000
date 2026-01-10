import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { BrowserWindow, app, clipboard, ipcMain } from "electron";
import started from "electron-squirrel-startup";
import type { IPty } from "node-pty";
import open from "open";

const execAsync = promisify(exec);

import { readFileSync } from "node:fs";
const configPath = path.join(__dirname, "..", "..", "config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));

const pty = require("node-pty");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = (): BrowserWindow => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    show: false,
    icon: path.join(__dirname, "../assets/icon-256.png"),
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
  return mainWindow;
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

app.on("window-all-closed", () => {
  // Quick and dirty fix to avoid some node-pty error when closing the last window without exiting the shell
  setTimeout(() => {
    app.quit();
  }, 1000);
});

ipcMain.on("start-terminal", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;

  const ptyProcess: IPty = pty.spawn('ssh.exe', ['-L', '3000:127.0.0.1:3000', config.sshHost]);

  // Listen to terminal output and send to renderer
  ptyProcess.onData((data) => {
    if (!window.isDestroyed()) {
      event.sender.send("terminal-output", data);
    }
  });

  ptyProcess.onExit(() => {
    if (!window.isDestroyed()) {
      window.close();
    }
  });

  // Listen to input from renderer
  const inputHandler = (e: Electron.IpcMainEvent, input: string): void => {
    if (e.sender === event.sender) {
      ptyProcess.write(input);
    }
  };
  ipcMain.on("terminal-input", inputHandler);

  // Resize terminal
  const resizeHandler = (
    e: Electron.IpcMainEvent,
    cols: number,
    rows: number,
  ): void => {
    if (e.sender === event.sender) {
      ptyProcess.resize(cols, rows);
    }
  };
  ipcMain.on("resize-terminal", resizeHandler);

  // Clean up handlers when window is closed
  window.on("closed", () => {
    ipcMain.removeListener("terminal-input", inputHandler);
    ipcMain.removeListener("resize-terminal", resizeHandler);
    ptyProcess.kill();
  });
});

// Handle new window creation
ipcMain.on("new-terminal", () => {
  createWindow();
});

ipcMain.on("clipboard-write", (_event, text) => {
  clipboard.writeText(text);
});

ipcMain.on("open-link", (_event, uri) => {
  open(uri);
});

// Handle file uploads - SCP to remote server and return remote path
ipcMain.handle(
  "upload-file",
  async (_event, fileName: string, fileData: ArrayBuffer) => {
    try {
      // Create a temporary directory if it doesn't exist
      const tempDir = path.join(os.tmpdir(), "svanterm3000-uploads");
      await fs.mkdir(tempDir, { recursive: true });

      // Generate a unique filename to avoid collisions
      const timestamp = Date.now();
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const tempFileName = `${timestamp}-${safeFileName}`;
      const tempFilePath = path.join(tempDir, tempFileName);

      // Write the file data locally first
      const buffer = Buffer.from(fileData);
      await fs.writeFile(tempFilePath, buffer);

      // SCP the file to the remote server
      const remotePath = `/tmp/${tempFileName}`;
      await execAsync(`scp.exe "${tempFilePath}" ${config.sshHost}:${remotePath}`);

      // Return the remote path
      return remotePath;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  },
);
