# svanterm3000

A terminal emulator built with Electron and xterm.js, using the WebGL renderer for hardware-accelerated rendering.

## Prerequisites

- [Node.js](https://nodejs.org/)
- [Yarn](https://classic.yarnpkg.com/) 1.x

### Font

svanterm3000 uses **CaskaydiaMono Nerd Font Mono** by default. Install it for the best experience, including powerline symbols and devicons.

Download **CaskaydiaMono Nerd Font** from [nerdfonts.com/font-downloads](https://www.nerdfonts.com/font-downloads), extract the zip, and install these four `.ttf` files (right-click > **Install**):

- `CaskaydiaMono NerdFontMono-Regular.ttf`
- `CaskaydiaMono NerdFontMono-Bold.ttf`
- `CaskaydiaMono NerdFontMono-Italic.ttf`
- `CaskaydiaMono NerdFontMono-BoldItalic.ttf`

If the Nerd Font is not installed, the terminal falls back to Cascadia Mono, Consolas, or the system monospace font.

## Setup

```sh
yarn install
```

## Development

```sh
yarn start
```

## Build

```sh
yarn make
```
