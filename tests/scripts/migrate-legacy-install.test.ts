import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { migrateLegacyInstall } from "../../scripts/migrate-legacy-install.mjs";

describe("migrateLegacyInstall", () => {
	it("copies settings and replaces the enabled legacy ID without deleting the old folder", async () => {
		const vault = await mkdtemp(join(tmpdir(), "graphune-migration-"));
		const oldDir = join(vault, ".obsidian/plugins/obsidian-heptabase");
		await mkdir(oldDir, { recursive: true });
		await writeFile(join(oldDir, "data.json"), '{"language":"ja"}\n');
		await writeFile(
			join(vault, ".obsidian/community-plugins.json"),
			'["calendar","obsidian-heptabase"]\n',
		);

		await expect(migrateLegacyInstall(vault)).resolves.toEqual([
			"copied legacy settings",
			"replaced the legacy enabled-plugin ID",
		]);
		expect(await readFile(join(vault, ".obsidian/plugins/graphune/data.json"), "utf8")).toBe(
			'{"language":"ja"}\n',
		);
		expect(await readFile(join(oldDir, "data.json"), "utf8")).toBe('{"language":"ja"}\n');
		expect(
			JSON.parse(await readFile(join(vault, ".obsidian/community-plugins.json"), "utf8")),
		).toEqual(["calendar", "graphune"]);
	});

	it("does not overwrite settings already stored under the new ID", async () => {
		const vault = await mkdtemp(join(tmpdir(), "graphune-migration-"));
		const oldDir = join(vault, ".obsidian/plugins/obsidian-heptabase");
		const newDir = join(vault, ".obsidian/plugins/graphune");
		await mkdir(oldDir, { recursive: true });
		await mkdir(newDir, { recursive: true });
		await writeFile(join(oldDir, "data.json"), '{"language":"ja"}\n');
		await writeFile(join(newDir, "data.json"), '{"language":"en"}\n');

		await migrateLegacyInstall(vault);
		expect(await readFile(join(newDir, "data.json"), "utf8")).toBe('{"language":"en"}\n');
	});
});
