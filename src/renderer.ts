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

// Resize terminal on window resize
window.addEventListener("resize", () => {
	fitAddon.fit();
	const { cols, rows } = terminal;
	window.api.resizeTerminal(cols, rows);
});
