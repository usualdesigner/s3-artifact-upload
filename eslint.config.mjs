// ESLint flat configuration.
// Migrated from the legacy .github/linters/.eslintrc.yml when eslint-plugin-github
// moved to flat-config-only in v6. See https://eslint.org/docs/latest/use/configure/configuration-files

import github from "eslint-plugin-github";
import jest from "eslint-plugin-jest";
import tseslint from "typescript-eslint";
import prettier from "eslint-plugin-prettier/recommended";

export default [
  {
    ignores: [
      "dist/",
      "lib/",
      "coverage/",
      "node_modules/",
      "badges/",
      "eslint.config.mjs",
      "**/*.json",
    ],
  },
  github.getFlatConfigs().recommended,
  ...github.getFlatConfigs().typescript,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        project: ["./tsconfig.json", "./.github/linters/tsconfig.json"],
      },
    },
  },
  {
    files: ["__tests__/**/*.ts", "**/*.test.ts"],
    ...jest.configs["flat/recommended"],
  },
  prettier,
  {
    rules: {
      camelcase: "off",
      "eslint-comments/no-use": "off",
      "eslint-comments/no-unused-disable": "off",
      "i18n-text/no-en": "off",
      "import/no-namespace": "off",
      "no-console": "off",
      "no-unused-vars": "off",
      semi: "off",
      "prettier/prettier": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        { accessibility: "no-public" },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true },
      ],
    },
  },
];
