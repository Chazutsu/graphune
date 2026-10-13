import { t } from "@/i18n";
import { CanvasSearch } from "@/services/canvas-search";
import { CanvasOperator } from "@/services/canvas-operator";
import { CanvasLayoutToolbar } from "@/ui/components/canvas-layout-toolbar";
import {
	canFloatSelectionToolbar,
	CanvasSelectionToolbar,
} from "@/ui/components/canvas-selection-toolbar";
import { CanvasCardContext } from "@/ui/components/canvas-card-context";
import { CanvasOutline } from "@/ui/components/canvas-outline";
import { DistillationDialog } from "@/ui/components/distillation-dialog";
import { sourcesFromCanvasNodes } from "@/services/distillation-service";
import type { CanvasNodeData, CanvasView } from "@/types/obsidian-canvas";
import { useApp } from "@/ui/hooks/use-app";
import { useActiveCanvasState } from "@/ui/hooks/use-canvas-state";
import { notifyError } from "@/utils/notify-error";
import type React from "react";
import { useCallback, useEffect, useId, useMemo, useReducer, useState } from "react";

const getKindLabels = () => ({
	file: t("canvasSearch.kindCard"),
	text: t("canvasSearch.kindText"),
	group: t("canvasSearch.kindGroup"),
	link: t("canvasSearch.kindLink"),
});

function getCanvasNodes(
	canvasView: ReturnType<typeof useActiveCanvasState>["canvasView"],
	revision: number,
) {
	// Canvas internals are mutable, so the Vault modification revision is part of this snapshot.
	void revision;
	if (!canvasView) return [];
	const data = canvasView.canvas.getData();
	return Array.isArray(data.nodes) ? data.nodes : [];
}

function getCanvasEdgeCount(
	canvasView: ReturnType<typeof useActiveCanvasState>["canvasView"],
	revision: number,
): number {
	void revision;
	if (!canvasView) return 0;
	const edges = canvasView.canvas.getData().edges;
	return Array.isArray(edges) ? edges.length : 0;
}

export function CanvasSearchPanel({
	onOpenArticle,
}: {
	onOpenArticle?: (path: string) => void;
} = {}): React.ReactElement {
	const { app, settings, canvasOperator: sharedCanvasOperator } = useApp();
	const { canvasView, selectedNodes } = useActiveCanvasState();
	const search = useMemo(() => new CanvasSearch(), []);
	const canvasOperator = useMemo(
		() => sharedCanvasOperator ?? new CanvasOperator(app, settings),
		[app, settings, sharedCanvasOperator],
	);
	const [query, setQuery] = useState("");
	const [distillationSession, setDistillationSession] = useState<{
		canvasView: CanvasView;
		selectedNodes: CanvasNodeData[];
	} | null>(null);
	const [selectedCanvasPath, setSelectedCanvasPath] = useState("");
	const searchInputId = `heptabase-canvas-search-${useId().replaceAll(":", "")}`;
	const [revision, refresh] = useReducer((value: number) => value + 1, 0);
	const canvasFiles = useMemo(
		() =>
			app.vault
				.getFiles()
				.filter((file) => file.extension === "canvas")
				.toSorted((left, right) => left.basename.localeCompare(right.basename)),
		[app.vault],
	);
	const openCanvas = useCallback(async () => {
		const file =
			canvasFiles.length === 1
				? canvasFiles[0]
				: canvasFiles.find((candidate) => candidate.path === selectedCanvasPath);
		if (!file) return;
		try {
			await app.workspace.getLeaf(false).openFile(file);
		} catch (error) {
			notifyError(t("canvasSearch.openFailed"), error);
		}
	}, [app.workspace, canvasFiles, selectedCanvasPath]);
	const createCanvas = useCallback(async () => {
		try {
			let suffix = 0;
			let path = `${t("canvasSearch.untitledCanvas")}.canvas`;
			while (app.vault.getAbstractFileByPath(path)) {
				suffix += 1;
				path = `${t("canvasSearch.untitledCanvas")} ${suffix}.canvas`;
			}
			const file = await app.vault.create(path, JSON.stringify({ nodes: [], edges: [] }));
			await app.workspace.getLeaf(false).openFile(file);
		} catch (error) {
			notifyError(t("canvasSearch.createFailed"), error);
		}
	}, [app.vault, app.workspace]);

	useEffect(() => {
		if (!canvasView) return;
		const eventRef = app.vault.on("modify", (file) => {
			if (file.path === canvasView.file.path) refresh();
		});
		return () => app.vault.offref(eventRef);
	}, [app.vault, canvasView]);

	const nodes = useMemo(() => getCanvasNodes(canvasView, revision), [canvasView, revision]);
	const edgeCount = useMemo(() => getCanvasEdgeCount(canvasView, revision), [canvasView, revision]);
	const results = useMemo(() => search.search(nodes, query), [nodes, query, search]);
	const hasQuery = query.trim().length > 0;
	const selectedIds = new Set(selectedNodes.map((node) => node.id));
	const distillationSources = sourcesFromCanvasNodes(
		nodes.filter((node) => selectedIds.has(node.id)),
	);
	const canDistill = distillationSources.length >= 2;
	const openDistillation = useCallback(() => {
		if (!canvasView) return;
		const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
		const selectedSnapshot = canvasView.canvas
			.getData()
			.nodes.filter((node) => selectedNodeIds.has(node.id))
			.map((node) => ({ ...node }));
		if (sourcesFromCanvasNodes(selectedSnapshot).length < 2) return;
		setDistillationSession({ canvasView, selectedNodes: selectedSnapshot });
	}, [canvasView, selectedNodes]);

	if (!canvasView) {
		return (
			<div className="canvas-panel__welcome text-hb-ui-small">
				<div role="status">
					<p className="m-0 text-hb-normal">{t("canvasSearch.noCanvasTitle")}</p>
					<p className="mt-1 mb-0 text-hb-muted">{t("canvasSearch.noCanvasAction")}</p>
				</div>
				<div className="canvas-panel__welcome-actions">
					{canvasFiles.length > 1 && (
						<label className="canvas-panel__canvas-picker">
							<span>{t("canvasSearch.chooseCanvas")}</span>
							<select
								value={selectedCanvasPath}
								onChange={(event) => setSelectedCanvasPath(event.target.value)}
							>
								<option value="">{t("canvasSearch.chooseCanvasPlaceholder")}</option>
								{canvasFiles.map((file) => (
									<option key={file.path} value={file.path}>
										{file.basename}
									</option>
								))}
							</select>
						</label>
					)}
					<button
						type="button"
						className="mod-cta"
						disabled={
							canvasFiles.length === 0 ||
							(canvasFiles.length > 1 && selectedCanvasPath.length === 0)
						}
						onClick={() => void openCanvas()}
					>
						{canvasFiles.length === 1
							? t("canvasSearch.openNamedCanvas", { name: canvasFiles[0]!.basename })
							: t("canvasSearch.openCanvas")}
					</button>
					<button type="button" onClick={() => void createCanvas()}>
						{t("canvasSearch.newCanvas")}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="canvas-panel h-full flex flex-col">
			{canFloatSelectionToolbar(selectedNodes) && (
				<CanvasSelectionToolbar
					canvasView={canvasView}
					selectedNodes={selectedNodes}
					canvasOperator={canvasOperator}
					edgeColor={settings.defaultEdgeColor}
					edgeLabel={settings.defaultEdgeLabel}
					onCanvasChange={refresh}
					onDistill={canDistill ? openDistillation : undefined}
				/>
			)}
			<label className="sr-only" htmlFor={searchInputId}>
				{t("canvasSearch.current")}
			</label>
			<div className="canvas-panel__rail">
				<div className="canvas-panel__search">
					<input
						id={searchInputId}
						type="search"
						className="heptabase-field w-full px-2.5 py-1.5"
						placeholder={t("canvasSearch.placeholder")}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
					{query && (
						<button
							type="button"
							className="canvas-panel__clear"
							aria-label={t("canvasSearch.clear")}
							onClick={() => setQuery("")}
						>
							×
						</button>
					)}
				</div>
				<CanvasLayoutToolbar
					canvasView={canvasView}
					selectedNodes={selectedNodes}
					canvasOperator={canvasOperator}
					edgeColor={settings.defaultEdgeColor}
					edgeLabel={settings.defaultEdgeLabel}
					onCanvasChange={refresh}
					mode={canFloatSelectionToolbar(selectedNodes) ? "history" : "all"}
				/>
			</div>
			<div className="canvas-panel__summary">
				<span className="truncate">{canvasView.file.basename}</span>
				<span aria-label={t("canvasSearch.results", { count: results.length })}>
					{results.length}
				</span>
			</div>
			{canDistill && !canFloatSelectionToolbar(selectedNodes) && (
				<button type="button" className="canvas-panel__distill mod-cta" onClick={openDistillation}>
					{t("distill.action")}
				</button>
			)}
			<CanvasCardContext
				canvasView={canvasView}
				selectedNodes={selectedNodes}
				onOpenArticle={onOpenArticle}
			/>
			<CanvasFirstConnectionGuide
				nodeCount={nodes.length}
				edgeCount={edgeCount}
				selectedCount={selectedNodes.length}
			/>
			<CanvasOutline
				nodes={nodes}
				onFocus={(nodeId) => {
					search.focus(canvasView.canvas, nodeId);
				}}
			/>
			<div className="canvas-panel__results flex-1 overflow-y-auto">
				{results.map((result) => (
					<button
						type="button"
						key={result.id}
						className="heptabase-canvas-result"
						onClick={() => search.focus(canvasView.canvas, result.id)}
					>
						<span className="heptabase-canvas-result__kind">{getKindLabels()[result.kind]}</span>
						<span className="heptabase-canvas-result__label">{result.label}</span>
						<span aria-hidden="true" />
						<span className="heptabase-canvas-result__detail">{result.detail}</span>
					</button>
				))}
				{nodes.length === 0 && (
					<p className="canvas-panel__empty">{t("canvasSearch.emptyCanvas")}</p>
				)}
				{nodes.length > 0 && results.length === 0 && hasQuery && (
					<div className="canvas-panel__empty">
						<p>{t("canvasSearch.noMatches")}</p>
						<button type="button" className="mod-cta" onClick={() => setQuery("")}>
							{t("canvasSearch.clearResults")}
						</button>
					</div>
				)}
			</div>
			{distillationSession && (
				<DistillationDialog
					canvasView={distillationSession.canvasView}
					selectedNodes={distillationSession.selectedNodes}
					canvasOperator={canvasOperator}
					onClose={() => setDistillationSession(null)}
					onComplete={(path) => {
						setDistillationSession(null);
						refresh();
						onOpenArticle?.(path);
					}}
				/>
			)}
		</div>
	);
}

function CanvasFirstConnectionGuide({
	nodeCount,
	edgeCount,
	selectedCount,
}: {
	nodeCount: number;
	edgeCount: number;
	selectedCount: number;
}): React.ReactElement | null {
	if (edgeCount > 0 || nodeCount > 2) return null;
	const currentStep = nodeCount === 0 ? 1 : 3;
	const currentInstruction =
		nodeCount === 0
			? t("canvasGuide.findHeading")
			: selectedCount === 2
				? t("canvasGuide.connectReady")
				: t("canvasGuide.selectTwo", { count: selectedCount });

	return (
		<aside className="canvas-first-guide" aria-label={t("canvasGuide.label")}>
			<div className="canvas-first-guide__current" aria-live="polite">
				<span>{t("canvasGuide.progress", { current: currentStep })}</span>
				<strong>{currentInstruction}</strong>
			</div>
			<details>
				<summary>{t("canvasGuide.showSteps")}</summary>
				<ol>
					<li data-complete={nodeCount > 0 || undefined}>{t("canvasGuide.findHeading")}</li>
					<li data-complete={nodeCount > 0 || undefined}>{t("canvasGuide.addToCanvas")}</li>
					<li>{t("canvasGuide.selectAndConnect")}</li>
				</ol>
			</details>
		</aside>
	);
}
