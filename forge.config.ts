import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import path from "path";

const config: ForgeConfig = {
  packagerConfig: {
    asar: false,
    icon: path.join(__dirname, "assets", "icon.ico"),
    ignore: [
      // Ignore files/directories not needed
    ],
  },
  makers: [
    new MakerSquirrel({
      iconUrl:
        "https://raw.githubusercontent.com/SvanT/svanterm3000/master/assets/icon.ico",
      setupIcon: path.join(__dirname, "assets", "icon.ico"),
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
};

export default config;
