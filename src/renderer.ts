import {
  Base64,
  BrowserClipboardProvider,
  ClipboardAddon,
  type ClipboardSelectionType,
} from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";

const BRACKET_START = "\x1b[200~"; // ESC [ 200 ~
const BRACKET_END = "\x1b[201~"; // ESC [ 201 ~

class MyCustomClipboardProvider extends BrowserClipboardProvider {
  public override writeText(
    _selection: ClipboardSelectionType,
    data: string,
  ): Promise<void> {
    window.api.clipboardWrite(data);
    return Promise.resolve();
  }
}

// Initialize xterm.js
const terminal = new Terminal({
  fontFamily: "Consolas Nerd Font Mono",
  scrollback: 0,
});

terminal.attachCustomKeyEventHandler((e) => {
  if (e.ctrlKey && e.code === "KeyV" && e.type === "keydown") {
    if (e.shiftKey) {
      e.preventDefault();
      window.api.sendInput("\x16");
    } else {
      return false;
    }
  } else if (e.ctrlKey && e.code === "KeyC" && e.type === "keydown") {
    const selection = terminal.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
      terminal.clearSelection();
      return false;
    }
  } else if (
    e.ctrlKey &&
    e.shiftKey &&
    e.code === "KeyN" &&
    e.type === "keydown"
  ) {
    window.api.newTerminal();
    return false;
  } else if (e.code === "Enter" && e.type === "keydown" && e.ctrlKey) {
    // Support using Ctrl-Enter to insert a newline in Claude Code instead of executing command,
    // without bracketed paste it doesn't work in tmux
    e.preventDefault();
    window.api.sendInput(`${BRACKET_START}\n${BRACKET_END}`);
    return false;
  }

  return true;
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

const addon = new WebglAddon();
addon.onContextLoss(() => {
  addon.dispose();
});
terminal.loadAddon(addon);

const clipboardAddon = new ClipboardAddon(
  new Base64(),
  new MyCustomClipboardProvider(),
);
terminal.loadAddon(clipboardAddon);

const weblinksAddon = new WebLinksAddon((_event, uri) => {
  window.api.openLink(uri);
});
terminal.loadAddon(weblinksAddon);

const container = document.getElementById("xterm");
terminal.open(container);
terminal.focus();

// Add drag and drop support for file paths
container.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.stopPropagation();
});

container.addEventListener("dragenter", (event) => {
  event.preventDefault();
  event.stopPropagation();
});

container.addEventListener("drop", async (event) => {
  event.preventDefault();
  event.stopPropagation();

  // Since it seems like we cannot get the full paths directly (only file names)
  // we handle it as an upload and paste the full path of the uploaded temporary files
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length > 0) {
    try {
      // Upload each file and collect the temporary paths
      const uploadPromises = files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const tempPath = await window.api.uploadFile(file.name, arrayBuffer);
        // Quote the path if it contains spaces
        return tempPath.includes(" ") ? `"${tempPath}"` : tempPath;
      });

      const filePaths = await Promise.all(uploadPromises);
      window.api.sendInput(
        `${BRACKET_START}${filePaths.join(" ")} ${BRACKET_END}`,
      );
    } catch (error) {
      console.error("Error handling dropped files:", error);
    }
  }
});

const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
  window.api.resizeTerminal(terminal.cols, terminal.rows);
});
resizeObserver.observe(container);

// Start the terminal
window.api.startTerminal();

// Listen to terminal output
window.api.onTerminalOutput((data) => {
  terminal.write(data);
});

// Send terminal input to main process
terminal.onData((input) => {
  window.api.sendInput(input);
});
