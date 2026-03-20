import stylistic from "@stylistic/eslint-plugin"
import tsParser from "@typescript-eslint/parser"

import { eslint as edm115Lint } from "edm115-lint"

export default [
  { ignores: [ "**/dist/", "**/node_modules/" ] },
  {
    files: ["**/*.ts"],
    linterOptions: { reportUnusedDisableDirectives: false },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tsParser,
    },
    plugins: { "@stylistic": stylistic },
    rules: edm115Lint,
  },
]
