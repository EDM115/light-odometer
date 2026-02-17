import { defineConfig } from "tsdown"

export default defineConfig({
  dts: true,
  entry: { "light-odometer": "./src/core/odometer.ts" },
  exports: false,
  format: ["esm"],
  minify: true,
  platform: "browser",
  shims: true,
  target: ["es2023"],
  unused: true,
})
