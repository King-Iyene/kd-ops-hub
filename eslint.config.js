import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "supabase/functions/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // "warn" not "error" — `npm run lint` (the CI gate) has no
      // --max-warnings flag, so this surfaces dead code/imports in output
      // without blocking the build. Was fully "off"; re-enabling as a warning
      // per the forensic review's code-health finding.
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      // Catches the Rolldown/Vite 8 TDZ crash class:
      //   const { x } = useAutoRefresh(fetchBatches);
      //   ...
      //   const fetchBatches = async () => { ... };  // ← defined too late
      // The base no-use-before-define lets functions slide because function
      // *declarations* are hoisted. We disable it and use the TS-aware version
      // below, which knows that `const` arrow functions are NOT hoisted.
      "no-use-before-define": "off",
      "@typescript-eslint/no-use-before-define": [
        "error",
        {
          functions: false,    // function decls are hoisted — fine
          classes: true,
          variables: true,     // catches const/let used before init (the bug)
          enums: true,
          typedefs: false,     // types are erased at runtime; allow forward use
          ignoreTypeReferences: true,
        },
      ],
    },
  },
);
