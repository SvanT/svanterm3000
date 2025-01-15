import {
	Base64,
	BrowserClipboardProvider,
	ClipboardAddon,
	type ClipboardSelectionType,
	IClipboardProvider,
} from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";

let hasSentInitialSize = false;

class MyCustomClipboardProvider extends BrowserClipboardProvider {
	public override writeText(
		selection: ClipboardSelectionType,
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
	} else if (e.ctrlKey && e.code === "KeyN" && e.type === "keydown") {
		window.api.newTerminal();
		return false;
	}

	return true;
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

const addon = new WebglAddon();
addon.onContextLoss((e) => {
	addon.dispose();
});
terminal.loadAddon(addon);

const clipboardAddon = new ClipboardAddon(
	new Base64(),
	new MyCustomClipboardProvider(),
);
terminal.loadAddon(clipboardAddon);

const container = document.getElementById("xterm");
terminal.open(container);
fitAddon.fit();
terminal.focus();

// Start the terminal
window.api.startTerminal();

// Listen to terminal output
window.api.onTerminalOutput((data) => {
	if (!hasSentInitialSize) {
		window.api.resizeTerminal(terminal.cols, terminal.rows);
		hasSentInitialSize = true;
	}

	terminal.write(data);
});

// Send terminal input to main process
terminal.onData((input) => {
	window.api.sendInput(input);
});

// Resize terminal on window resize
window.addEventListener("resize", () => {
	fitAddon.fit();
	window.api.resizeTerminal(terminal.cols, terminal.rows);
});
