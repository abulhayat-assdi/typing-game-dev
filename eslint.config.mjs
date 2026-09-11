// ESLint flat config — M1 foundation (TypeScript strict).
// NOTE: `eslint-config-next` is intentionally NOT extended here: its
// @rushstack/eslint-patch is incompatible with ESLint 9 flat config and
// breaks `turbo run lint`. Next.js build already runs its own type/route
// validation; the Next preset is re-evaluated in M3.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.open-next/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  // Generated Next.js types: rule-level relaxations only.
  {
    files: ["**/next-env.d.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Keep M1 pragmatic: warn (not error) on type-unsafe helpers until M2+ typed DB clients land.
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" },
      ],
      "no-console": ["warn", { "allow": ["warn", "error"] }],
    },
  },
);
