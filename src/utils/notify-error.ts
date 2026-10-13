import { Notice } from "obsidian";

export function notifyError(prefix: string, error: unknown): void {
	const message = error instanceof Error ? error.message : "Unknown error";
	new Notice(`${prefix}: ${message}`);
}
