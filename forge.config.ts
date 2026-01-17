import { readdir, rm } from "fs/promises";
import path from "path";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

// Only include files that are needed in the final package
const allowedPaths = [
  /^\/\.vite/, // Built app bundles
  /^\/assets/, // Icons
  /^\/node_modules/, // Native dependencies (node-pty)
  /^\/package\.json$/, // Required by Electron
  /^\/config\.json$/, // SSH configuration
];

// Exclude unnecessary files even from allowed paths
// Note: node-pty/deps is needed for native rebuild during packaging
const excludedPaths = [
  /^\/node_modules\/\.vite/, // Vite's dev dependency cache (3MB)
  /^\/node_modules\/node-pty\/prebuilds\/(?!win32-x64)/, // Other platform prebuilds (28MB)
  /^\/node_modules\/.*\.map$/, // Source maps from npm packages (5MB)
];

// Clean up build artifacts after native rebuild (created during packaging)
async function cleanupBuildArtifacts(appPath: string) {
  // Remove directories not needed at runtime
  const dirsToRemove = [
    "node_modules/node-pty/deps",
    "node_modules/node-pty/src",
    "node_modules/node-pty/scripts",
    "node_modules/node-pty/third_party",
    "node_modules/@xterm", // Bundled by Vite
  ];
  for (const dir of dirsToRemove) {
    await rm(path.join(appPath, dir), { recursive: true, force: true });
  }

  // Clean node-pty/build - keep only Release/
  const buildDir = path.join(appPath, "node_modules/node-pty/build");
  const entries = await readdir(buildDir);
  for (const entry of entries) {
    if (entry !== "Release") {
      await rm(path.join(buildDir, entry), { recursive: true, force: true });
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    icon: path.join(__dirname, "assets", "icon.ico"),
    ignore: (filePath: string) => {
      // Don't ignore the root
      if (filePath === "") return false;
      // Exclude specific paths
      if (excludedPaths.some((pattern) => pattern.test(filePath))) return true;
      // Include files matching allowed paths
      return !allowedPaths.some((pattern) => pattern.test(filePath));
    },
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
  hooks: {
    postPackage: async (_config, options) => {
      const appPath = path.join(options.outputPaths[0], "resources", "app");
      await cleanupBuildArtifacts(appPath);
    },
  },
};

export default config;
