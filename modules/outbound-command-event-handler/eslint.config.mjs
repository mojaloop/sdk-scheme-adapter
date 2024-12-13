import typescriptEslint from "@typescript-eslint/eslint-plugin";
import _import from "eslint-plugin-import";
import { fixupPluginRules } from "@eslint/compat";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import jest from "eslint-plugin-jest";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["src/test"],
}, ...compat.extends("plugin:@typescript-eslint/recommended"), {
    plugins: {
        jest,
        import: _import,
    },

    languageOptions: {
        parser: tsParser,
        ecmaVersion: 5,
        sourceType: "module",

        parserOptions: {
            project: "./tsconfig.json",
        },
    },

    settings: {
        "import/resolver": "node",
    },

    rules: {
        indent: ["error", 4, {
            SwitchCase: 1,
        }],

        "linebreak-style": [2, "unix"],
        quotes: [2, "single"],
        semi: [2, "always"],

        "no-multiple-empty-lines": ["error", {
            max: 2,
            maxEOF: 0,
        }],

        "no-console": "off",
        "no-prototype-builtins": "off",
        "object-curly-spacing": ["warn", "always"],

        "no-unused-vars": ["warn", {
            vars: "all",
            args: "none",
        }],

        "@typescript-eslint/no-unused-vars": ["warn", {
            vars: "all",
            args: "none",
        }],

        "@typescript-eslint/no-explicit-any": ["off", {
            ignoreRestArgs: true,
        }],

        "react/jsx-filename-extension": [0, {
            extensions: [".js", ".jsx"],
        }],

        "max-len": ["warn", {
            code: 120,
            ignoreStrings: true,
            ignoreTemplateLiterals: true,
            ignoreComments: true,
        }],

        "no-plusplus": ["error", {
            allowForLoopAfterthoughts: true,
        }],

        "no-underscore-dangle": "off",

        "import/no-extraneous-dependencies": ["error", {
            devDependencies: ["**/*.test.js", "**/*.test.ts", "src/tests/**/*"],
        }],

        "import/prefer-default-export": "off",

        "spaced-comment": ["error", "always", {
            exceptions: ["*"],
        }],

        "keyword-spacing": ["error", {
            overrides: {
                if: {
                    after: false,
                },

                for: {
                    after: false,
                },

                while: {
                    after: false,
                },
            },
        }],

        "arrow-parens": ["error", "as-needed"],

        "import/extensions": ["error", {
            js: "never",
            ts: "never",
            json: "ignore",
        }],
    },
}];
