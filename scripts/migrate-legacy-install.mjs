import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const CURRENT_PLUGIN_ID = "graphune";
export const LEGACY_PLUGIN_ID = "obsidian-heptabase";

async function readOptional(file) {
	try {
		return await readFile(file, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return null;
		throw error;
	}
}

async function writeJsonAtomically(file, value) {
	const temporary = `${file}.graphune-migration-${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(temporary, file);
}

export async function migrateLegacyInstall(vault) {
	const configDir = path.join(vault, ".obsidian");
	const pluginsDir = path.join(configDir, "plugins");
	const legacyData = path.join(pluginsDir, LEGACY_PLUGIN_ID, "data.json");
	const currentDir = path.join(pluginsDir, CURRENT_PLUGIN_ID);
	const currentData = path.join(currentDir, "data.json");
	const communityPlugins = path.join(configDir, "community-plugins.json");
	const changes = [];

	const oldData = await readOptional(legacyData);
	const newData = await readOptional(currentData);
	if (oldData !== null && newData === null) {
		JSON.parse(oldData);
		await mkdir(currentDir, { recursive: true });
		await copyFile(legacyData, currentData);
		changes.push("copied legacy settings");
	}

	const config = await readOptional(communityPlugins);
	if (config !== null) {
		const enabled = JSON.parse(config);
		if (!Array.isArray(enabled) || enabled.some((id) => typeof id !== "string")) {
			throw new Error("community-plugins.json must contain an array of plugin IDs");
		}
		const next = [...new Set(enabled.map((id) => (id === LEGACY_PLUGIN_ID ? CURRENT_PLUGIN_ID : id)))];
		if (JSON.stringify(next) !== JSON.stringify(enabled)) {
			await copyFile(communityPlugins, `${communityPlugins}.pre-graphune-migration.bak`);
			await writeJsonAtomically(communityPlugins, next);
			changes.push("replaced the legacy enabled-plugin ID");
		}
	}

	return changes;
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isEntryPoint) {
	const vaultIndex = process.argv.indexOf("--vault");
	const vault = vaultIndex >= 0 ? process.argv[vaultIndex + 1] : null;
	if (!vault) throw new Error("Usage: pnpm migrate:legacy -- --vault <path>");
	const changes = await migrateLegacyInstall(path.resolve(vault));
	console.log(changes.length > 0 ? `migrated: ${changes.join(", ")}` : "migration not needed");
	console.log(`legacy folder preserved: .obsidian/plugins/${LEGACY_PLUGIN_ID}`);
}
