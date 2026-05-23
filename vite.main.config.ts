import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { defineConfig } from "vite";

// Copy conpty.dll to where node-pty expects it. electron-rebuild wipes
// build/Release/ during "yarn start" and doesn't re-run post-install.js.
function copyConptyDll(): import("vite").Plugin {
  return {
    name: "copy-conpty-dll",
    buildStart() {
      const ptyDir = path.join(__dirname, "node_modules/node-pty");
      const thirdParty = path.join(ptyDir, "third_party/conpty");
      const dest = path.join(ptyDir, "build/Release/conpty");
      if (!existsSync(thirdParty) || existsSync(dest)) return;
      const versions = readdirSync(thirdParty);
      const src = path.join(thirdParty, versions[0], "win10-x64");
      mkdirSync(dest, { recursive: true });
      for (const file of ["conpty.dll", "OpenConsole.exe"]) {
        copyFileSync(path.join(src, file), path.join(dest, file));
      }
    },
  };
}

// https://vitejs.dev/config
export default defineConfig({
  plugins: [copyConptyDll()],
  build: {
    rollupOptions: {
      // node-pty loads a .node binding via relative paths, so it must not be
      // bundled — leave it as a runtime require of the installed package.
      external: ["node-pty"],
    },
  },
});
