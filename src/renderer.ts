import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";

// Initialize xterm.js
const terminal = new Terminal({
	fontFamily: "Consolas Nerd Font Mono",
});
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

const addon = new WebglAddon();
addon.onContextLoss((e) => {
	addon.dispose();
});
terminal.loadAddon(addon);

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
