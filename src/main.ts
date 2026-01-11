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

  let ptyProcess: IPty | null = null;
  let isWindowClosing = false;
  let currentCols = 80;
  let currentRows = 24;

  const spawnSsh = (): void => {
    if (isWindowClosing || window.isDestroyed()) return;

    ptyProcess = pty.spawn('ssh.exe', [
      '-o', 'ConnectTimeout=2',
      '-o', 'ServerAliveInterval=1',
      '-o', 'ServerAliveCountMax=2',
      '-o', 'TCPKeepAlive=no',
      '-L', '3000:127.0.0.1:3000',
      config.sshHost
    ]);
    try {
      ptyProcess.resize(currentCols, currentRows);
    } catch {
      // pty may have already exited
    }

    // Listen to terminal output and send to renderer
    ptyProcess.onData((data: string) => {
      if (!window.isDestroyed()) {
        event.sender.send("terminal-output", data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      ptyProcess = null;
      if (!isWindowClosing && !window.isDestroyed()) {
        event.sender.send("terminal-output", `\r\n\x1b[33m[ssh exited with code ${exitCode}, reconnecting in 1s...]\x1b[0m\r\n`);
        setTimeout(spawnSsh, 1000);
      }
    });
  };

  spawnSsh();

  // Listen to input from renderer
  const inputHandler = (e: Electron.IpcMainEvent, input: string): void => {
    if (e.sender === event.sender && ptyProcess) {
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
      currentCols = cols;
      currentRows = rows;
      if (ptyProcess) {
        try {
          ptyProcess.resize(cols, rows);
        } catch {
          // pty may have already exited
        }
      }
    }
  };
  ipcMain.on("resize-terminal", resizeHandler);

  // Clean up handlers when window is closed
  window.on("closed", () => {
    isWindowClosing = true;
    ipcMain.removeListener("terminal-input", inputHandler);
    ipcMain.removeListener("resize-terminal", resizeHandler);
    if (ptyProcess) {
      ptyProcess.kill();
    }
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
