import type { DataAdapter } from "obsidian";

export const LEGACY_PLUGIN_ID = "obsidian-heptabase";

type ReadableAdapter = Pick<DataAdapter, "exists" | "read">;

export async function loadLegacyGraphuneData(
	adapter: ReadableAdapter,
	configDir: string,
): Promise<Record<string, unknown> | null> {
	const path = `${configDir}/plugins/${LEGACY_PLUGIN_ID}/data.json`;
	if (!(await adapter.exists(path))) return null;

	try {
		const value: unknown = JSON.parse(await adapter.read(path));
		return value !== null && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	} catch (error) {
		console.warn(`Graphune could not import legacy settings from ${path}`, error);
		return null;
	}
}
