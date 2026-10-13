import { KnowledgeContextService, type KnowledgeContext } from "@/services/knowledge-context";
import { useApp } from "@/ui/hooks/use-app";
import { TFile } from "obsidian";
import { useEffect, useMemo, useRef, useState } from "react";

const EMPTY_CONTEXT: KnowledgeContext = {
	backlinks: [],
	canvases: [],
	canvasStatus: "fresh",
	relatedCandidates: [],
	status: "loading",
};
const REFRESH_DEBOUNCE = 120;

export function useKnowledgeContext(
	file: TFile | null,
	excludedPaths: ReadonlySet<string> = new Set(),
): KnowledgeContext {
	const { app } = useApp();
	const service = useMemo(() => new KnowledgeContextService(app), [app]);
	const exclusionKey = [...excludedPaths].toSorted().join("\u0000");
	const [snapshot, setSnapshot] = useState<{
		file: TFile;
		exclusionKey: string;
		context: KnowledgeContext;
	} | null>(null);
	const requestIdRef = useRef(0);

	useEffect(() => {
		if (!file) return;

		let cancelled = false;
		let controller: AbortController | undefined;
		let timer: number | undefined;
		const refresh = () => {
			const requestId = ++requestIdRef.current;
			controller?.abort();
			controller = new AbortController();
			service
				.getForFile(file, controller.signal, new Set(exclusionKey.split("\u0000").filter(Boolean)))
				.then((next) => {
					if (!cancelled && requestId === requestIdRef.current)
						setSnapshot({ file, exclusionKey, context: next });
				})
				.catch(() => {
					if (!cancelled && requestId === requestIdRef.current) {
						setSnapshot({
							file,
							exclusionKey,
							context: { ...EMPTY_CONTEXT, status: "error" },
						});
					}
				});
		};
		const scheduleRefresh = () => {
			if (timer) window.clearTimeout(timer);
			timer = window.setTimeout(refresh, REFRESH_DEBOUNCE);
		};

		refresh();
		const handleModify = (changedFile: unknown) => {
			if (
				changedFile instanceof TFile &&
				(changedFile.extension === "md" || changedFile.extension === "canvas")
			) {
				if (changedFile.extension === "canvas") service.markCanvasStale(changedFile.path);
				scheduleRefresh();
			}
		};
		const handleDelete = (changedFile: unknown) => {
			if (!(changedFile instanceof TFile)) return;
			if (changedFile.extension === "canvas") service.invalidateCanvas(changedFile.path);
			if (changedFile.extension === "md" || changedFile.extension === "canvas") scheduleRefresh();
		};
		const handleRename = (changedFile: unknown, oldPath: string) => {
			if (!(changedFile instanceof TFile)) return;
			if (changedFile.extension === "canvas" || oldPath.endsWith(".canvas")) {
				service.renameCanvas(oldPath, changedFile);
				scheduleRefresh();
			} else if (changedFile.extension === "md" || oldPath.endsWith(".md")) {
				scheduleRefresh();
			}
		};
		const handleCreate = (changedFile: unknown) => {
			if (changedFile instanceof TFile && changedFile.extension === "canvas") {
				service.invalidateCanvas(changedFile.path);
				scheduleRefresh();
			}
		};
		const modifyRef = app.vault.on("modify", handleModify);
		const deleteRef = app.vault.on("delete", handleDelete);
		const createRef = app.vault.on("create", handleCreate);
		const renameRef = app.vault.on("rename", handleRename);
		const metadataRef = app.metadataCache.on("resolved", scheduleRefresh);

		return () => {
			cancelled = true;
			controller?.abort();
			if (timer) window.clearTimeout(timer);
			app.vault.offref(modifyRef);
			app.vault.offref(deleteRef);
			app.vault.offref(createRef);
			app.vault.offref(renameRef);
			app.metadataCache.offref(metadataRef);
		};
	}, [app.metadataCache, app.vault, exclusionKey, file, service]);

	return file && snapshot?.file === file && snapshot.exclusionKey === exclusionKey
		? snapshot.context
		: EMPTY_CONTEXT;
}
