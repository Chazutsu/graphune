import { SourceChangeDetector, type SourceChangeStatus } from "@/services/source-change-detector";
import type { TFile } from "obsidian";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./use-app";

interface SourceChangeState {
	status: SourceChangeStatus;
	sourcePath: string | null;
}

export function useSourceChangeStatus(file: TFile): SourceChangeState {
	const { app } = useApp();
	const detector = useMemo(() => new SourceChangeDetector(app), [app]);
	const frontmatter = toRecord(app.metadataCache.getFileCache(file)?.frontmatter);
	const sourcePath =
		typeof frontmatter?.["heptabase-source"] === "string" ? frontmatter["heptabase-source"] : null;
	const fingerprint = frontmatter?.["heptabase-source-content-hash"];
	const [status, setStatus] = useState<SourceChangeStatus>("not-tracked");

	useEffect(() => {
		if (typeof fingerprint !== "string" || !sourcePath) return;
		let cancelled = false;
		let requestId = 0;
		const refresh = () => {
			const currentRequest = ++requestId;
			void detector.getStatus(file).then((nextStatus) => {
				if (!cancelled && currentRequest === requestId) setStatus(nextStatus);
			});
		};
		refresh();

		const affectsTrackedSource = (changedFile: { path: string }): boolean =>
			changedFile.path === sourcePath || changedFile.path === file.path;
		const modifyRef = app.vault.on("modify", (changedFile) => {
			if (affectsTrackedSource(changedFile)) refresh();
		});
		const createRef = app.vault.on("create", (changedFile) => {
			if (affectsTrackedSource(changedFile)) refresh();
		});
		const deleteRef = app.vault.on("delete", (changedFile) => {
			if (affectsTrackedSource(changedFile)) refresh();
		});
		const renameRef = app.vault.on("rename", (changedFile, oldPath) => {
			if (affectsTrackedSource(changedFile) || oldPath === sourcePath || oldPath === file.path)
				refresh();
		});
		const metadataRef = app.metadataCache.on("changed", (changedFile) => {
			if (changedFile.path === sourcePath || changedFile.path === file.path) refresh();
		});
		return () => {
			cancelled = true;
			app.vault.offref(modifyRef);
			app.vault.offref(createRef);
			app.vault.offref(deleteRef);
			app.vault.offref(renameRef);
			app.metadataCache.offref(metadataRef);
		};
	}, [app.metadataCache, app.vault, detector, file, fingerprint, sourcePath]);

	return {
		status: typeof fingerprint === "string" && sourcePath ? status : "not-tracked",
		sourcePath,
	};
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}
