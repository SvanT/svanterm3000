import "@xterm/xterm/css/xterm.css";
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

// Add paste support for images
// Use document-level paste handler to intercept before terminal
document.addEventListener(
  "paste",
  async (event) => {
    // Only handle if terminal is focused
    if (!document.activeElement?.closest("#xterm")) return;

    const items = Array.from(event.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));

    if (imageItems.length > 0) {
      // Prevent default paste behavior only for images
      event.preventDefault();
      event.stopPropagation();

      try {
        // Process each image item
        const uploadPromises = imageItems.map(async (item, index) => {
          const blob = item.getAsFile();
          if (!blob) return null;

          // Generate a filename based on the image type
          const extension = blob.type.split("/")[1] || "png";
          const fileName = `pasted-image-${Date.now()}-${index}.${extension}`;

          const arrayBuffer = await blob.arrayBuffer();
          const tempPath = await window.api.uploadFile(fileName, arrayBuffer);
          // Quote the path if it contains spaces
          return tempPath.includes(" ") ? `"${tempPath}"` : tempPath;
        });

        const filePaths = (await Promise.all(uploadPromises)).filter(Boolean);
        if (filePaths.length > 0) {
          window.api.sendInput(
            `${BRACKET_START}${filePaths.join(" ")} ${BRACKET_END}`,
          );
        }
      } catch (error) {
        console.error("Error handling pasted images:", error);
      }
    }
    // If no images, let the default paste behavior happen
  },
  true,
); // Use capture phase to intercept before terminal

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
