import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const virtualObsidianWasm = readFileSync(
	resolve(import.meta.dirname, "../node_modules/virtual-obsidian/wasm-pkg/core_bg.wasm"),
);

export default defineConfig({
	root: resolve(import.meta.dirname, "."),
	plugins: [
		react(),
		{
			name: "serve-virtual-obsidian-wasm",
			configureServer(server) {
				server.middlewares.use((request, response, next) => {
					const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
					if (pathname !== "/virtual-obsidian-core.wasm") return next();
					response.statusCode = 200;
					response.setHeader("Content-Type", "application/wasm");
					response.end(virtualObsidianWasm);
				});
			},
		},
	],
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "../src"),
			obsidian: resolve(import.meta.dirname, "./mock-app.ts"),
		},
	},
});
