import { CardGrid } from "@/ui/components/card-grid";
import { filterAndSortLibraryResults, type LibrarySort } from "@/services/library-results";
import { buildProcessingStateIndex, filterUnprocessedResults } from "@/services/processing-state";
import { LibraryFilters } from "@/ui/components/library-filters";
import { SearchBar } from "@/ui/components/search-bar";
import { t } from "@/i18n";
import type { SourceKind } from "@/types/plugin";
import { useActiveCanvasState } from "@/ui/hooks/use-canvas-state";
import { useNoteSearch } from "@/ui/hooks/use-note-search";
import { useApp } from "@/ui/hooks/use-app";
import type React from "react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

function resetResultsScroll(element: HTMLDivElement | null, filterSignature: string): void {
	// The signature makes clearing a filter observable as well as applying one.
	void filterSignature;
	if (element) element.scrollTop = 0;
}

export function HeadingExplorer(): React.ReactElement {
	const { app } = useApp();
	const { query, results, isSearching, isHydrating, failedCount, setQuery, retrySearch } =
		useNoteSearch();
	const [tag, setTag] = useState("");
	const [folder, setFolder] = useState("");
	const [sort, setSort] = useState<LibrarySort>("updated");
	const [canvasOnly, setCanvasOnly] = useState(false);
	const [sourceScope, setSourceScope] = useState<"sources" | SourceKind>("sources");
	const deferredResults = useDeferredValue(results);
	const deferredTag = useDeferredValue(tag);
	const deferredFolder = useDeferredValue(folder);
	const resultsRef = useRef<HTMLDivElement>(null);
	const canvasContext = useActiveCanvasState();
	const canvasView = canvasContext.canvasView;
	const selectedPath =
		canvasContext.selectedPaths.size === 1
			? canvasContext.selectedPaths.values().next().value
			: undefined;
	const filterSignature = JSON.stringify([query, tag, folder, sort, canvasOnly, sourceScope]);

	const effectiveCanvasOnly = canvasOnly && Boolean(canvasView);
	const filteredResults = useMemo(() => {
		const filtered = filterAndSortLibraryResults(deferredResults, {
			tag: deferredTag,
			folder: deferredFolder,
			sort,
		});
		const scoped =
			sourceScope === "sources"
				? filterUnprocessedResults(
						filtered.filter(
							(result) => result.sourceKind !== undefined && result.sourceKind !== "note",
						),
						buildProcessingStateIndex(app, canvasView?.canvas.getData()),
					)
				: filtered.filter((result) => (result.sourceKind ?? "note") === sourceScope);
		return effectiveCanvasOnly
			? scoped.filter((result) => canvasContext.inCanvasPaths.has(result.file.path))
			: scoped;
	}, [
		canvasContext.inCanvasPaths,
		app,
		canvasView,
		deferredFolder,
		deferredResults,
		deferredTag,
		effectiveCanvasOnly,
		sourceScope,
		sort,
	]);

	useEffect(() => {
		resetResultsScroll(resultsRef.current, filterSignature);
	}, [filterSignature]);

	useEffect(() => {
		if (!selectedPath || !resultsRef.current) return;
		const card = [...resultsRef.current.querySelectorAll<HTMLElement>("[data-file-path]")].find(
			(element) => element.dataset.filePath === selectedPath,
		);
		card?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
	}, [selectedPath]);

	return (
		<div className="heptabase-library p-2 h-full flex flex-col overflow-hidden">
			<div className="heptabase-library__controls shrink-0">
				<div className="graphune-source-header">
					<strong>{t("sources.title")}</strong>
					<span>{t("sources.description")}</span>
				</div>
				<div className="graphune-source-scopes" role="group" aria-label={t("sources.filterLabel")}>
					{(["sources", "clipping", "kindle", "daily", "note"] as const).map((scope) => (
						<button
							key={scope}
							type="button"
							className={sourceScope === scope ? "is-active" : ""}
							aria-pressed={sourceScope === scope}
							onClick={() => setSourceScope(scope)}
						>
							{t(`sourceScope.${scope}`)}
						</button>
					))}
				</div>
				<SearchBar query={query} onQueryChange={setQuery} />
				<LibraryFilters
					results={results}
					tag={tag}
					folder={folder}
					sort={sort}
					resultCount={filteredResults.length}
					canvasOnly={effectiveCanvasOnly}
					hasCanvas={Boolean(canvasView)}
					onTagChange={setTag}
					onFolderChange={setFolder}
					onSortChange={setSort}
					onCanvasOnlyChange={setCanvasOnly}
				/>
				<div
					className={`heptabase-search-progress ${isSearching ? "is-active" : ""}`}
					role="progressbar"
					aria-label={t("library.updating")}
					aria-hidden={!isSearching}
				/>
				{failedCount > 0 && (
					<div className="heptabase-search-warning" role="status">
						<span>{t("library.partialFailure", { count: failedCount })}</span>
						<button type="button" onClick={retrySearch}>
							{t("library.retry")}
						</button>
					</div>
				)}
			</div>
			<div
				ref={resultsRef}
				className="heptabase-library__results flex-1 min-h-0 overflow-y-auto pt-2"
				aria-busy={isSearching}
			>
				<CardGrid
					results={filteredResults}
					query={query}
					inCanvasPaths={canvasContext.inCanvasPaths}
					selectedPaths={canvasContext.selectedPaths}
					isHydrating={isHydrating}
					hasActiveFilters={
						query.trim() !== "" || tag !== "" || folder !== "" || effectiveCanvasOnly
					}
					onClearFilters={() => {
						setQuery("");
						setTag("");
						setFolder("");
						setCanvasOnly(false);
					}}
				/>
			</div>
		</div>
	);
}
