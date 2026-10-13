import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/visual",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://127.0.0.1:5173",
		colorScheme: "dark",
		deviceScaleFactor: 1,
	},
	webServer: {
		command: "pnpm dev:ui --host 127.0.0.1",
		url: "http://127.0.0.1:5173",
		reuseExistingServer: !process.env.CI,
		stdout: "pipe",
		stderr: "pipe",
	},
	expect: {
		toHaveScreenshot: {
			animations: "disabled",
			caret: "hide",
			maxDiffPixelRatio: 0.002,
		},
	},
});
