import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default defineConfig([
  globalIgnores([
    "node_modules/**",
    "dist/**",
    ".next/**",
    "build/**"
  ]),

  {
    files: ["src/**/*.ts", "prisma/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin
    },
    rules: {
      ...tseslint.configs.recommended.rules,

      // temporarily silence noisy Prisma/Nest warnings
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off"
    }
  },

  prettier
]);