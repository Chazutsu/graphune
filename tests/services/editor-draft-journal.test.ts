import { EditorDraftJournal } from "@/services/editor-draft-journal";
import { App, TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("EditorDraftJournal", () => {
	let app: App;
	let files: Map<string, TFile | object>;
	let contents: Map<string, string>;

	beforeEach(() => {
		app = new App();
		files = new Map();
		contents = new Map();
		app.vault.getAbstractFileByPath = vi.fn((path: string) => files.get(path) ?? null);
		app.vault.createFolder = vi.fn(async (path: string) => {
			files.set(path, {});
		});
		app.vault.create = vi.fn(async (path: string, content: string) => {
			const file = new TFile(path);
			files.set(path, file);
			contents.set(path, content);
			return file;
		});
		app.vault.cachedRead = vi.fn(async (file: TFile) => contents.get(file.path) ?? "");
		app.vault.process = vi.fn(async (file: TFile, mutate: (raw: string) => string) => {
			contents.set(file.path, mutate(contents.get(file.path) ?? ""));
		});
	});

	it("persists and restores a draft without deriving a Vault path from the resource key", async () => {
		const journal = new EditorDraftJournal(app);
		const unsafeKey = "../../notes/private.md";

		await journal.write(unsafeKey, "local draft", "conflict");

		expect(await journal.read(unsafeKey)).toMatchObject({
			resourceKey: unsafeKey,
			value: "local draft",
			reason: "conflict",
		});
		expect(app.vault.create).toHaveBeenCalledWith(
			".graphune/recovery/editor-drafts.json",
			expect.any(String),
		);
	});

	it("only removes the draft version that was successfully saved", async () => {
		const journal = new EditorDraftJournal(app);
		await journal.write("note.md", "newer", "pending");

		await journal.remove("note.md", "older");
		expect((await journal.read("note.md"))?.value).toBe("newer");

		await journal.remove("note.md", "newer");
		expect(await journal.read("note.md")).toBeNull();
	});

	it("does not let malformed journal JSON block editing", async () => {
		const file = new TFile(".graphune/recovery/editor-drafts.json");
		files.set(file.path, file);
		contents.set(file.path, "not-json");
		const journal = new EditorDraftJournal(app);

		expect(await journal.read("note.md")).toBeNull();
		await expect(journal.write("note.md", "safe", "failed")).resolves.toBeUndefined();
		expect((await journal.read("note.md"))?.value).toBe("safe");
	});

	it("reports an unreadable journal without making the compatibility read throw", async () => {
		const file = new TFile(".graphune/recovery/editor-drafts.json");
		files.set(file.path, file);
		app.vault.cachedRead = vi.fn().mockRejectedValue(new Error("iCloud placeholder unavailable"));
		const journal = new EditorDraftJournal(app);

		await expect(journal.readWithStatus("note.md")).resolves.toEqual({ status: "error" });
		await expect(journal.read("note.md")).resolves.toBeNull();
	});

	it("starts the first recovery write immediately and coalesces edits received while it is active", async () => {
		const file = new TFile(".graphune/recovery/editor-drafts.json");
		files.set(file.path, file);
		contents.set(file.path, JSON.stringify({ version: 1, drafts: {} }));
		let releaseFirstWrite: (() => void) | undefined;
		let processCount = 0;
		app.vault.process = vi.fn(async (target: TFile, mutate: (raw: string) => string) => {
			processCount += 1;
			if (processCount === 1) {
				await new Promise<void>((resolve) => {
					releaseFirstWrite = resolve;
				});
			}
			contents.set(target.path, mutate(contents.get(target.path) ?? ""));
		});
		const journal = new EditorDraftJournal(app);

		const firstFlush = journal.writeCoalesced("note.md", "a", "pending");
		await Promise.resolve();
		expect(app.vault.process).toHaveBeenCalledTimes(1);

		void journal.writeCoalesced("note.md", "ab", "pending");
		void journal.writeCoalesced("note.md", "abc", "pending");
		releaseFirstWrite?.();
		await firstFlush;

		expect(app.vault.process).toHaveBeenCalledTimes(2);
		expect((await journal.read("note.md"))?.value).toBe("abc");
	});

	it("retries the newest coalesced draft when an in-flight journal write fails", async () => {
		const file = new TFile(".graphune/recovery/editor-drafts.json");
		files.set(file.path, file);
		contents.set(file.path, JSON.stringify({ version: 1, drafts: {} }));
		let rejectFirstWrite: ((error: Error) => void) | undefined;
		let processCount = 0;
		app.vault.process = vi.fn(async (target: TFile, mutate: (raw: string) => string) => {
			processCount += 1;
			if (processCount === 1) {
				await new Promise<void>((_resolve, reject) => {
					rejectFirstWrite = reject;
				});
			}
			contents.set(target.path, mutate(contents.get(target.path) ?? ""));
		});
		const journal = new EditorDraftJournal(app);

		const failedFlush = journal.writeCoalesced("note.md", "first", "pending");
		await Promise.resolve();
		void journal.writeCoalesced("note.md", "latest", "pending");
		rejectFirstWrite?.(new Error("simulated disk interruption"));
		await expect(failedFlush).rejects.toThrow("simulated disk interruption");

		expect((await journal.read("note.md"))?.value).toBe("latest");
		expect(app.vault.process).toHaveBeenCalledTimes(2);
	});
});
