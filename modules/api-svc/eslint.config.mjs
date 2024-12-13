import jest from "eslint-plugin-jest";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [...compat.extends("eslint:recommended"), {
    plugins: {
        jest,
    },

    languageOptions: {
        ecmaVersion: 'latest',
        globals: {
            ...globals.node,
            ...globals.jest,
            structuredClone: 'readonly',
        },
    },

    rules: {
        indent: ["error", 4, {
            SwitchCase: 1,
        }],

        "linebreak-style": [2, "unix"],
        quotes: [2, "single"],
        semi: [2, "always"],
        "no-console": 2,
        "no-prototype-builtins": "off",
    },
}];