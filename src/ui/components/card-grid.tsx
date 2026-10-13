import { t } from "@/i18n";
import type { SearchResult } from "@/types/plugin";
import { NoteCard } from "@/ui/components/note-card";
import { useInfiniteScroll } from "@/ui/hooks/use-infinite-scroll";
import type React from "react";

const PAGE_SIZE = 20;

interface CardGridProps {
	results: SearchResult[];
	query?: string;
	inCanvasPaths?: ReadonlySet<string>;
	selectedPaths?: ReadonlySet<string>;
	isHydrating?: boolean;
	hasActiveFilters?: boolean;
	onClearFilters?: () => void;
}

export function CardGrid({
	results,
	query = "",
	inCanvasPaths = new Set(),
	selectedPaths = new Set(),
	isHydrating = false,
	hasActiveFilters = false,
	onClearFilters,
}: CardGridProps): React.ReactElement {
	const { visibleItems, hasMore, sentinelRef } = useInfiniteScroll(results, PAGE_SIZE);

	if (results.length === 0) {
		if (isHydrating) {
			return (
				<div
					className="heptabase-empty-state text-hb-muted text-center p-5 text-hb-ui-small"
					role="status"
				>
					{t("library.updating")}
				</div>
			);
		}

		return (
			<div className="heptabase-empty-state text-hb-muted text-center p-5 text-hb-ui-small">
				<p>{hasActiveFilters ? t("library.emptyFiltered") : t("library.empty")}</p>
				{hasActiveFilters && onClearFilters && (
					<button type="button" className="heptabase-text-action" onClick={onClearFilters}>
						{t("library.clearFilters")}
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="@container">
			<div className="heptabase-library__grid grid grid-cols-1 @[440px]:grid-cols-2">
				{visibleItems.map((result) => (
					<NoteCard
						key={result.file.path}
						file={result.file}
						excerpt={result.excerpt}
						headings={result.headings}
						sourceKind={result.sourceKind}
						tags={result.tags}
						query={query}
						isInCanvas={inCanvasPaths.has(result.file.path)}
						isCanvasSelected={selectedPaths.has(result.file.path)}
						isHydrating={isHydrating}
					/>
				))}
				{hasMore && <div ref={sentinelRef} data-testid="sentinel" className="h-full" />}
			</div>
		</div>
	);
}
