import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "logs/", "data/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // pm2:n asetustiedosto on CommonJS-muotoa.
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { module: "writable", require: "readonly", __dirname: "readonly" } },
  },
);
