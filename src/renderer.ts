import "@xterm/xterm/css/xterm.css";
import {
  Base64,
  BrowserClipboardProvider,
  ClipboardAddon,
  type ClipboardSelectionType,
} from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";

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
  allowProposedApi: true,
  fontFamily: '"Consolas Nerd Font Mono", Consolas, "Courier New", monospace',
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
  } else if (
    e.code === "Enter" &&
    e.type === "keydown" &&
    (e.ctrlKey || e.shiftKey)
  ) {
    // Send Ctrl-Enter/Shift-Enter as CSI u (kitty keyboard protocol)
    // so they survive through SSH + tmux to the inner application.
    // Requires tmux bindings: bind-key -n C-Enter/S-Enter send-keys -l
    e.preventDefault();
    const modifier = e.ctrlKey ? 5 : 2;
    window.api.sendInput(`\x1b[13;${modifier}u`);
    return false;
  }

  return true;
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

const webglAddon = new WebglAddon();
webglAddon.onContextLoss(() => {
  webglAddon.dispose();
});
terminal.loadAddon(webglAddon);

const clipboardAddon = new ClipboardAddon(
  new Base64(),
  new MyCustomClipboardProvider(),
);
terminal.loadAddon(clipboardAddon);

const weblinksAddon = new WebLinksAddon((_event, uri) => {
  window.api.openLink(uri);
});
terminal.loadAddon(weblinksAddon);

const unicode11Addon = new Unicode11Addon();
terminal.loadAddon(unicode11Addon);
terminal.unicode.activeVersion = '11';

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
      window.api.sendInput(`${BRACKET_START}${filePaths.join(" ")} `);
      await new Promise((r) => setTimeout(r, 5));
      window.api.sendInput(BRACKET_END);
    } catch (error) {
      console.error("Error handling dropped files:", error);
    }
  }
});

// Full paste handler: intercepts before xterm.js to ensure bracketed paste
// end marker is never split across a ConPTY buffer boundary.
document.addEventListener(
  "paste",
  async (event: ClipboardEvent) => {
    if (!document.activeElement?.closest("#xterm")) return;

    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const items = Array.from(clipboardData.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    const text = clipboardData.getData("text/plain");

    if (imageItems.length === 0 && !text) return;

    event.preventDefault();
    event.stopPropagation();

    if (imageItems.length > 0) {
      try {
        const uploadPromises = imageItems.map(async (item, index) => {
          const blob = item.getAsFile();
          if (!blob) return null;
          const extension = blob.type.split("/")[1] || "png";
          const fileName = `pasted-image-${Date.now()}-${index}.${extension}`;
          const arrayBuffer = await blob.arrayBuffer();
          const tempPath = await window.api.uploadFile(fileName, arrayBuffer);
          return tempPath.includes(" ") ? `"${tempPath}"` : tempPath;
        });
        const filePaths = (await Promise.all(uploadPromises)).filter(Boolean);
        if (filePaths.length > 0) {
          window.api.sendInput(`${BRACKET_START}${filePaths.join(" ")} `);
          await new Promise((r) => setTimeout(r, 5));
          window.api.sendInput(BRACKET_END);
        }
      } catch (error) {
        console.error("Error handling pasted images:", error);
      }
      return;
    }

    // Normalize line endings (same as xterm.js prepareTextForTerminal)
    let processed = text.replace(/\r?\n/g, "\r");

    if (terminal.modes.bracketedPasteMode) {
      // Sanitize ESC chars to prevent bracket escape (same as xterm.js)
      processed = processed.replace(/\x1b/g, "\u241b");
      // Send start marker + text as one write, end marker as a separate write
      // after a small delay. The delay ensures ConPTY has read and flushed the
      // first write before the end marker arrives, preventing ConPTY's 96-byte
      // output chunking from splitting the end marker across chunks. Without the
      // delay, both writes land in the pipe buffer simultaneously and ConPTY
      // re-chunks the combined data on its own boundary.
      window.api.sendInput(`${BRACKET_START}${processed}`);
      await new Promise((r) => setTimeout(r, 5));
      window.api.sendInput(BRACKET_END);
    } else {
      window.api.sendInput(processed);
    }
  },
  true,
);

const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
});
resizeObserver.observe(container);

terminal.onResize(({ cols, rows }) => {
  window.api.resizeTerminal(cols, rows);
});

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
