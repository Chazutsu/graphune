import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

const securityRules = new Set([
	"no-eval",
	"no-implied-eval",
	"no-unsanitized/method",
	"no-unsanitized/property",
	"obsidianmd/regex-lookbehind",
	"obsidianmd/no-forbidden-elements",
]);

function scannerSeverity(config) {
	if (!config.rules) return config;

	return {
		...config,
		rules: Object.fromEntries(
			Object.entries(config.rules)
				.filter(([rule]) => rule !== "no-prototype-bultins")
				.map(([rule, setting]) => {
					if (securityRules.has(rule)) return [rule, "error"];

					const severity = Array.isArray(setting) ? setting[0] : setting;
					if (severity === "off" || severity === 0) return [rule, setting];

					const options = Array.isArray(setting) ? setting.slice(1) : [];
					return [rule, ["warn", ...options]];
				}),
		),
	};
}

export default defineConfig([
	...obsidianmd.configs.recommended.map(scannerSeverity),
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*", "manifest.json"],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	{
		files: ["**/*.{ts,tsx,js,jsx}"],
		rules: {
			"no-eval": "error",
			"no-implied-eval": "error",
			"no-unsanitized/method": "error",
			"no-unsanitized/property": "error",
			"obsidianmd/regex-lookbehind": "error",
			"obsidianmd/no-forbidden-elements": "error",
		},
	},
	globalIgnores([
		"main.js",
		"styles.css",
		"dist/**",
		"build/**",
		"pkg/**",
		".obsidian/**",
		"tests/**",
		"scripts/**",
		"**/*.test.*",
		"**/*.spec.*",
		"**/*.cjs",
		"**/*.mjs",
		"**/*.cts",
		"**/*.mts",
	]),
]);
