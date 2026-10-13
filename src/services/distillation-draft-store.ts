import { EditorDraftJournal } from "@/services/editor-draft-journal";
import type { App } from "obsidian";

export interface DistillationFormDraft {
	title: string;
	body: string;
	target: string;
	reason: string;
}

const stores = new WeakMap<object, DistillationDraftStore>();

export class DistillationDraftStore {
	private pendingSaves = new Map<string, Promise<void>>();
	private pendingValues = new Map<string, string>();

	constructor(private journal: EditorDraftJournal) {}

	async read(resourceKey: string): Promise<DistillationFormDraft | null> {
		await this.pendingSaves.get(resourceKey)?.catch(() => undefined);
		const record = await this.journal.read(resourceKey);
		if (!record) return null;
		return parseDraft(record.value);
	}

	save(resourceKey: string, draft: DistillationFormDraft): Promise<void> {
		this.pendingValues.set(resourceKey, serializeDraft(draft));
		const active = this.pendingSaves.get(resourceKey);
		if (active) return active;
		const save = this.flush(resourceKey);
		this.pendingSaves.set(resourceKey, save);
		const finish = () => {
			if (this.pendingSaves.get(resourceKey) === save) this.pendingSaves.delete(resourceKey);
			if (this.pendingValues.has(resourceKey)) {
				void this.savePending(resourceKey).catch(() => undefined);
			}
		};
		void save.then(finish, finish);
		return save;
	}

	private savePending(resourceKey: string): Promise<void> {
		const value = this.pendingValues.get(resourceKey);
		if (value === undefined) return Promise.resolve();
		return this.save(resourceKey, parseDraft(value) ?? EMPTY_DRAFT);
	}

	private async flush(resourceKey: string): Promise<void> {
		while (this.pendingValues.has(resourceKey)) {
			const value = this.pendingValues.get(resourceKey)!;
			this.pendingValues.delete(resourceKey);
			await this.journal.write(resourceKey, value, "pending");
		}
	}

	async clear(resourceKey: string, draft: DistillationFormDraft): Promise<void> {
		const value = serializeDraft(draft);
		// Drain coalesced writes before the compare-and-remove. Otherwise an older in-flight save
		// could recreate a draft after a successful distillation.
		try {
			await this.save(resourceKey, draft);
		} catch {
			// Removal may still succeed after a transient save failure.
		}
		await this.journal.remove(resourceKey, value);
	}
}

export function getDistillationDraftStore(app: App): DistillationDraftStore {
	const existing = stores.get(app);
	if (existing) return existing;
	const created = new DistillationDraftStore(new EditorDraftJournal(app));
	stores.set(app, created);
	return created;
}

export function distillationDraftKey(canvasPath: string, nodeIds: string[]): string {
	return `distillation:${canvasPath}:${nodeIds.toSorted().join("\u0000")}`;
}

function serializeDraft(draft: DistillationFormDraft): string {
	return JSON.stringify(draft);
}

function parseDraft(value: string): DistillationFormDraft | null {
	try {
		const parsed = JSON.parse(value) as Partial<DistillationFormDraft>;
		if (
			typeof parsed.title === "string" &&
			typeof parsed.body === "string" &&
			typeof parsed.target === "string" &&
			typeof parsed.reason === "string"
		) {
			return {
				title: parsed.title,
				body: parsed.body,
				target: parsed.target,
				reason: parsed.reason,
			};
		}
	} catch {
		// An invalid recovery record must not block the dialog.
	}
	return null;
}

const EMPTY_DRAFT: DistillationFormDraft = { title: "", body: "", target: "", reason: "" };
