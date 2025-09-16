import { defineConfig } from "tsdown"

export default defineConfig({
  dts: true,
  entry: { main: "./src/core/odometer.ts" },
  exports: true,
  format: ["esm"],
  minify: true,
  platform: "browser",
  shims: true,
  target: ["es2016"],
  unused: true,
})
