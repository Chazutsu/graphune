import { normalizePath, type App, TFile } from "obsidian";

const JOURNAL_FOLDER = ".graphune/recovery";
const JOURNAL_PATH = `${JOURNAL_FOLDER}/editor-drafts.json`;

export type EditorDraftReason = "pending" | "conflict" | "failed";

export interface EditorDraftRecord {
	resourceKey: string;
	value: string;
	reason: EditorDraftReason;
	updatedAt: number;
}

export type EditorDraftReadResult =
	| { status: "ok"; draft: EditorDraftRecord | null }
	| { status: "error" };

interface EditorDraftJournalData {
	version: 1;
	drafts: Record<string, EditorDraftRecord>;
}

const EMPTY_JOURNAL: EditorDraftJournalData = { version: 1, drafts: {} };

export class EditorDraftJournal {
	private queue: Promise<void> = Promise.resolve();
	private coalescedDrafts = new Map<string, Omit<EditorDraftRecord, "updatedAt">>();
	private coalescedFlushes = new Map<string, Promise<void>>();

	constructor(private app: App) {}

	async read(resourceKey: string): Promise<EditorDraftRecord | null> {
		const result = await this.readWithStatus(resourceKey);
		return result.status === "ok" ? result.draft : null;
	}

	async readWithStatus(resourceKey: string): Promise<EditorDraftReadResult> {
		await this.queue;
		const file = this.getJournalFile();
		if (!file) return { status: "ok", draft: null };
		try {
			const data = parseJournal(await this.app.vault.cachedRead(file));
			return {
				status: "ok",
				draft:
					data.drafts[editorDraftKey(resourceKey)]?.resourceKey === resourceKey
						? data.drafts[editorDraftKey(resourceKey)]!
						: null,
			};
		} catch {
			return { status: "error" };
		}
	}

	write(resourceKey: string, value: string, reason: EditorDraftReason): Promise<void> {
		return this.enqueue(async () => {
			await this.update((data) => {
				data.drafts[editorDraftKey(resourceKey)] = {
					resourceKey,
					value,
					reason,
					updatedAt: Date.now(),
				};
			});
		});
	}

	/**
	 * Starts durable recording immediately, while collapsing edits that arrive during an active write.
	 * This keeps the autosave debounce out of the recovery path without writing once per keystroke.
	 */
	writeCoalesced(resourceKey: string, value: string, reason: EditorDraftReason): Promise<void> {
		this.coalescedDrafts.set(resourceKey, { resourceKey, value, reason });
		const activeFlush = this.coalescedFlushes.get(resourceKey);
		if (activeFlush) return activeFlush;

		const flush = this.flushCoalesced(resourceKey).finally(() => {
			this.coalescedFlushes.delete(resourceKey);
			if (this.coalescedDrafts.has(resourceKey)) {
				void this.writeCoalescedRecord(resourceKey);
			}
		});
		this.coalescedFlushes.set(resourceKey, flush);
		return flush;
	}

	private writeCoalescedRecord(resourceKey: string): Promise<void> {
		const pending = this.coalescedDrafts.get(resourceKey);
		if (!pending) return Promise.resolve();
		return this.writeCoalesced(pending.resourceKey, pending.value, pending.reason);
	}

	private async flushCoalesced(resourceKey: string): Promise<void> {
		while (this.coalescedDrafts.has(resourceKey)) {
			const pending = this.coalescedDrafts.get(resourceKey)!;
			this.coalescedDrafts.delete(resourceKey);
			await this.write(pending.resourceKey, pending.value, pending.reason);
		}
	}

	remove(resourceKey: string, expectedValue?: string): Promise<void> {
		return this.enqueue(async () => {
			await this.update((data) => {
				const key = editorDraftKey(resourceKey);
				const current = data.drafts[key];
				if (!current || current.resourceKey !== resourceKey) return;
				if (expectedValue !== undefined && current.value !== expectedValue) return;
				delete data.drafts[key];
			});
		});
	}

	private enqueue(operation: () => Promise<void>): Promise<void> {
		const next = this.queue.then(operation, operation);
		this.queue = next.catch(() => undefined);
		return next;
	}

	private async update(mutate: (data: EditorDraftJournalData) => void): Promise<void> {
		const file = this.getJournalFile();
		if (file) {
			await this.app.vault.process(file, (raw) => {
				const data = parseJournal(raw);
				mutate(data);
				return JSON.stringify(data, null, "\t");
			});
			return;
		}
		await this.ensureFolder();
		const data = structuredClone(EMPTY_JOURNAL);
		mutate(data);
		await this.app.vault.create(JOURNAL_PATH, JSON.stringify(data, null, "\t"));
	}

	private async readData(): Promise<EditorDraftJournalData> {
		const file = this.getJournalFile();
		if (!file) return structuredClone(EMPTY_JOURNAL);
		try {
			return parseJournal(await this.app.vault.cachedRead(file));
		} catch {
			return structuredClone(EMPTY_JOURNAL);
		}
	}

	private getJournalFile(): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(JOURNAL_PATH));
		return file instanceof TFile ? file : null;
	}

	private async ensureFolder(): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath(normalizePath(".graphune"))) {
			await this.app.vault.createFolder(normalizePath(".graphune"));
		}
		if (!this.app.vault.getAbstractFileByPath(normalizePath(JOURNAL_FOLDER))) {
			await this.app.vault.createFolder(normalizePath(JOURNAL_FOLDER));
		}
	}
}

function parseJournal(raw: string): EditorDraftJournalData {
	try {
		const parsed = JSON.parse(raw) as Partial<EditorDraftJournalData>;
		if (parsed.version === 1 && parsed.drafts && typeof parsed.drafts === "object") {
			return { version: 1, drafts: { ...parsed.drafts } };
		}
	} catch {
		// A malformed recovery journal must never block editing.
	}
	return structuredClone(EMPTY_JOURNAL);
}

export function editorDraftKey(resourceKey: string): string {
	let hash = 0x811c9dc5;
	for (const character of resourceKey) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 0x01000193);
	}
	return `draft-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
