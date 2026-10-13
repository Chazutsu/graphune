import {
	existsSync,
	lstatSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const PLUGIN_NAME = "graphune";

const vaultPath = process.argv[2] ? resolve(process.argv[2]) : null;
if (!vaultPath) {
	console.error("Usage: pnpm setup:link -- <vault-path>");
	process.exit(1);
}
const pluginsDir = join(vaultPath, ".obsidian", "plugins");
const targetPath = join(pluginsDir, PLUGIN_NAME);

if (!existsSync(pluginsDir)) {
	console.error(`Error: Plugins directory not found: ${pluginsDir}`);
	console.error("Make sure the vault path is correct and Obsidian has been opened at least once.");
	process.exit(1);
}

function createSymlink() {
	symlinkSync(projectRoot, targetPath);
	console.log(`Symlink created: ${targetPath} -> ${projectRoot}`);
}

const stat = lstatSync(targetPath, { throwIfNoEntry: false });

if (stat) {
	if (stat.isSymbolicLink()) {
		const currentTarget = readlinkSync(targetPath);
		if (currentTarget === projectRoot) {
			console.log(`Symlink already exists: ${targetPath} -> ${projectRoot}`);
		} else {
			console.log(`Updating symlink: ${currentTarget} -> ${projectRoot}`);
			unlinkSync(targetPath);
			createSymlink();
		}
	} else {
		if (stat.isDirectory()) {
			console.log(`Removing existing directory: ${targetPath}`);
			rmSync(targetPath, { recursive: true });
		} else {
			unlinkSync(targetPath);
		}
		createSymlink();
	}
} else {
	createSymlink();
}

const hotreloadPath = join(projectRoot, ".hotreload");
if (!existsSync(hotreloadPath)) {
	writeFileSync(hotreloadPath, "");
	console.log("Created .hotreload marker file");
} else {
	console.log(".hotreload marker file already exists");
}

console.log("\nSetup complete! Next steps:");
console.log("1. Enable 'Graphune' in Obsidian");
console.log("2. Run 'pnpm dev' to start the watch build");
console.log("3. Reload plugins from Settings > Community plugins after changes");
console.log("   Optional: install 'Hot Reload' by pjeby to automate step 3");
