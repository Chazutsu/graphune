import { createObsidianPluginConfig } from "obsidian-plugin-kit/rolldown";

export default createObsidianPluginConfig({
	input: "src/main.ts",
	external: [/^@codemirror\/.*/, /^@lezer\/.*/],
});
