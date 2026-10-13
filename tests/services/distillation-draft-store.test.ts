import {
	DistillationDraftStore,
	distillationDraftKey,
	type DistillationFormDraft,
} from "@/services/distillation-draft-store";
import type { EditorDraftJournal } from "@/services/editor-draft-journal";
import { describe, expect, it, vi } from "vitest";

const DRAFT: DistillationFormDraft = {
	title: "Claim",
	body: "Evidence",
	target: "Knowledge/Context.md",
	reason: "Extends the model",
};

function createJournal() {
	return {
		read: vi.fn(),
		write: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
	};
}

describe("DistillationDraftStore", () => {
	it("uses a stable key for the same Canvas and selected node set", () => {
		expect(distillationDraftKey("Maps/Ideas.canvas", ["b", "a"])).toBe(
			distillationDraftKey("Maps/Ideas.canvas", ["a", "b"]),
		);
		expect(distillationDraftKey("Maps/Other.canvas", ["a", "b"])).not.toBe(
			distillationDraftKey("Maps/Ideas.canvas", ["a", "b"]),
		);
	});

	it("restores a valid form and ignores malformed recovery data", async () => {
		const journal = createJournal();
		journal.read.mockResolvedValueOnce({ value: JSON.stringify(DRAFT) });
		const store = new DistillationDraftStore(journal as unknown as EditorDraftJournal);

		await expect(store.read("draft-key")).resolves.toEqual(DRAFT);

		journal.read.mockResolvedValueOnce({ value: '{"title":1}' });
		await expect(store.read("draft-key")).resolves.toBeNull();
	});

	it("drains the latest save before removing a completed draft", async () => {
		const journal = createJournal();
		const store = new DistillationDraftStore(journal as unknown as EditorDraftJournal);

		await store.clear("draft-key", DRAFT);

		const serialized = JSON.stringify(DRAFT);
		expect(journal.write).toHaveBeenCalledWith("draft-key", serialized, "pending");
		expect(journal.remove).toHaveBeenCalledWith("draft-key", serialized);
		expect(journal.write.mock.invocationCallOrder[0]).toBeLessThan(
			journal.remove.mock.invocationCallOrder[0]!,
		);
	});

	it("still attempts cleanup when the final save fails", async () => {
		const journal = createJournal();
		journal.write.mockRejectedValue(new Error("disk unavailable"));
		const store = new DistillationDraftStore(journal as unknown as EditorDraftJournal);

		await store.clear("draft-key", DRAFT);

		expect(journal.remove).toHaveBeenCalledOnce();
	});
});
