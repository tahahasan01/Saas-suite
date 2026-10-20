// ESLint flat config for the web app (Q2, F14, F26).
//   npm run lint --workspace @business-os/web
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import logicalCss from "./eslint/logical-css.mjs";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "test-results/**", "playwright-report/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,

  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    plugins: { "react-hooks": reactHooks, "logical-css": logicalCss },
    languageOptions: {
      globals: { window: "readonly", document: "readonly", navigator: "readonly", process: "readonly", console: "readonly" },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // RTL-ready CSS (D-53): ms-/me-/ps-/pe-/start-/end-/text-start, never
      // ml-/mr-/pl-/pr-/left-/right-/text-left. Warn while the existing classes
      // are migrated; flip to "error" once the count reaches zero.
      "logical-css/no-physical-classes": "warn",

      // Intl is called in lib/format.ts only (F26): one place to switch locale.
      "no-restricted-syntax": ["error",
        { selector: "MemberExpression[object.name='Intl']", message: "Format through lib/format.ts (money, formatNumber, formatDate…), not Intl directly." },
        { selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]", message: "Format through lib/format.ts, not toLocale*String." },
      ],

      // Kept, as a warning, on purpose: the scan field and single-job auth
      // screens focus their one input (a cashier's scanner types into it).
      // New uses should justify themselves the same way.
      "jsx-a11y/no-autofocus": "warn",

      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },

  // The one Intl entry point, and tests that compute expected values independently.
  { files: ["lib/format.ts", "e2e/**", "**/*.test.ts"], rules: { "no-restricted-syntax": "off" } },
  { files: ["e2e/**", "**/*.test.ts", "*.config.*"], rules: { "logical-css/no-physical-classes": "off" } },
);
