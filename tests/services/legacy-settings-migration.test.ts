import { loadLegacyGraphuneData } from "@/services/legacy-settings-migration";
import { describe, expect, it, vi } from "vitest";

describe("loadLegacyGraphuneData", () => {
	it("loads settings from the legacy plugin directory", async () => {
		const adapter = {
			exists: vi.fn().mockResolvedValue(true),
			read: vi.fn().mockResolvedValue('{"language":"ja","enableEdgeSync":false}'),
		};

		await expect(loadLegacyGraphuneData(adapter, ".obsidian")).resolves.toEqual({
			language: "ja",
			enableEdgeSync: false,
		});
		expect(adapter.read).toHaveBeenCalledWith(".obsidian/plugins/obsidian-heptabase/data.json");
	});

	it("does not read when the legacy data file is absent", async () => {
		const adapter = {
			exists: vi.fn().mockResolvedValue(false),
			read: vi.fn(),
		};

		await expect(loadLegacyGraphuneData(adapter, ".obsidian")).resolves.toBeNull();
		expect(adapter.read).not.toHaveBeenCalled();
	});

	it("rejects malformed and non-object data", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const malformed = {
			exists: vi.fn().mockResolvedValue(true),
			read: vi.fn().mockResolvedValue("{"),
		};
		const array = {
			exists: vi.fn().mockResolvedValue(true),
			read: vi.fn().mockResolvedValue("[]"),
		};

		await expect(loadLegacyGraphuneData(malformed, ".obsidian")).resolves.toBeNull();
		await expect(loadLegacyGraphuneData(array, ".obsidian")).resolves.toBeNull();
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});
});
