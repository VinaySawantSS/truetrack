import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The web app vendors the engine under src/engine, so the build has no
// dependency on the repo layout. Plain Vite, nothing exotic.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
});
