import { defineConfig } from "oxlint"
import { oxlint as edm115Lint } from "edm115-lint"

export default defineConfig({
  "env": {
    browser: true,
    es2025: true,
  },
  "extends": [edm115Lint],
  "ignorePatterns": [
    "**/dist/",
    "**/node_modules/",
  ],
  "options": {
    typeAware: true,
  },
})
