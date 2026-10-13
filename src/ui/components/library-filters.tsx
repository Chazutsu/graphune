import type { SearchResult } from "@/types/plugin";
import { t } from "@/i18n";
import type { LibrarySort } from "@/services/library-results";
import type React from "react";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useClickOutside } from "@/ui/hooks/use-click-outside";

interface LibraryFiltersProps {
	results: SearchResult[];
	tag: string;
	folder: string;
	sort: LibrarySort;
	resultCount: number;
	canvasOnly?: boolean;
	hasCanvas?: boolean;
	onTagChange: (tag: string) => void;
	onFolderChange: (folder: string) => void;
	onSortChange: (sort: LibrarySort) => void;
	onCanvasOnlyChange?: (canvasOnly: boolean) => void;
}

export const LibraryFilters = memo(function LibraryFiltersInner({
	results,
	tag,
	folder,
	sort,
	resultCount,
	canvasOnly = false,
	hasCanvas = false,
	onTagChange,
	onFolderChange,
	onSortChange,
	onCanvasOnlyChange,
}: LibraryFiltersProps): React.ReactElement {
	const tagFilterId = useId();
	const folderFilterId = useId();
	const sortId = useId();
	const canvasScopeHelpId = useId();
	const popoverId = useId();
	const popoverLabelId = useId();
	const menuRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const firstControlRef = useRef<HTMLSelectElement>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [draftTag, setDraftTag] = useState(tag);
	const [draftFolder, setDraftFolder] = useState(folder);
	const [draftSort, setDraftSort] = useState(sort);
	const [draftCanvasOnly, setDraftCanvasOnly] = useState(canvasOnly);
	const [isSheet, setIsSheet] = useState(false);
	const close = useCallback(() => setIsOpen(false), []);
	useClickOutside(menuRef, close);
	useEffect(() => {
		if (isOpen) firstControlRef.current?.focus();
	}, [isOpen]);
	const open = useCallback(() => {
		setDraftTag(tag);
		setDraftFolder(folder);
		setDraftSort(sort);
		setDraftCanvasOnly(canvasOnly);
		const shell = menuRef.current?.closest<HTMLElement>(".heptabase-shell");
		setIsSheet((shell?.getBoundingClientRect().width ?? window.innerWidth) < 320);
		setIsOpen(true);
	}, [canvasOnly, folder, sort, tag]);
	const closeAndRestoreFocus = useCallback(() => {
		close();
		triggerRef.current?.focus();
	}, [close]);
	const apply = useCallback(() => {
		if (draftTag !== tag) onTagChange(draftTag);
		if (draftFolder !== folder) onFolderChange(draftFolder);
		if (draftSort !== sort) onSortChange(draftSort);
		if (draftCanvasOnly !== canvasOnly) onCanvasOnlyChange?.(draftCanvasOnly);
		closeAndRestoreFocus();
	}, [
		canvasOnly,
		closeAndRestoreFocus,
		draftCanvasOnly,
		draftFolder,
		draftSort,
		draftTag,
		folder,
		onCanvasOnlyChange,
		onFolderChange,
		onSortChange,
		onTagChange,
		sort,
		tag,
	]);
	const reset = useCallback(() => {
		if (tag) onTagChange("");
		if (folder) onFolderChange("");
		if (sort !== "updated") onSortChange("updated");
		if (canvasOnly) onCanvasOnlyChange?.(false);
		closeAndRestoreFocus();
	}, [
		canvasOnly,
		closeAndRestoreFocus,
		folder,
		onCanvasOnlyChange,
		onFolderChange,
		onSortChange,
		onTagChange,
		sort,
		tag,
	]);
	const { tags, folders } = useMemo(() => {
		const tagSet = new Set<string>();
		const folderSet = new Set<string>();
		for (const result of results) {
			for (const resultTag of result.tags ?? []) tagSet.add(resultTag);
			folderSet.add(result.folder ?? "/");
		}
		return {
			tags: [...tagSet].toSorted((a, b) => a.localeCompare(b)),
			folders: [...folderSet].toSorted((a, b) => a.localeCompare(b)),
		};
	}, [results]);

	return (
		<div className="heptabase-library-filters">
			<div className="heptabase-library-filters__bar">
				<span className="heptabase-library-filters__count" aria-live="polite">
					{resultCount === 1
						? t("filter.cardCountOne")
						: t("filter.cardCount", { count: resultCount })}
				</span>
				<div
					ref={menuRef}
					className={`heptabase-library-filters__menu ${isOpen ? "is-open" : ""}`}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							closeAndRestoreFocus();
							return;
						}
						if (event.key !== "Tab" || !isSheet) return;
						const controls = Array.from(
							menuRef.current?.querySelectorAll<HTMLElement>(
								"[role='dialog'] button:not(:disabled), [role='dialog'] select:not(:disabled), [role='dialog'] input:not(:disabled)",
							) ?? [],
						);
						const first = controls[0];
						const last = controls.at(-1);
						if (event.shiftKey && event.target === first) {
							event.preventDefault();
							last?.focus();
						} else if (!event.shiftKey && event.target === last) {
							event.preventDefault();
							first?.focus();
						}
					}}
				>
					<button
						ref={triggerRef}
						type="button"
						className="heptabase-library-filters__trigger"
						aria-label={t("filter.open")}
						aria-expanded={isOpen}
						aria-controls={popoverId}
						aria-haspopup="dialog"
						onClick={() => {
							if (isOpen) {
								closeAndRestoreFocus();
								return;
							}
							open();
						}}
					>
						<span aria-hidden="true" className="heptabase-library-filters__glyph" />
						{t("filter.refine")}
					</button>
					{isOpen && (
						<>
							<button
								type="button"
								className="heptabase-library-filters__backdrop"
								aria-label={t("filter.close")}
								onClick={closeAndRestoreFocus}
							/>
							<div
								id={popoverId}
								role="dialog"
								aria-modal={isSheet || undefined}
								aria-labelledby={popoverLabelId}
								className="heptabase-library-filters__popover"
							>
								<span id={popoverLabelId} className="sr-only">
									{t("filter.open")}
								</span>
								<label htmlFor={tagFilterId}>{t("filter.tag")}</label>
								<select
									ref={firstControlRef}
									id={tagFilterId}
									aria-label={t("filter.byTag")}
									className="heptabase-field w-full min-w-0"
									value={draftTag}
									onChange={(event) => setDraftTag(event.target.value)}
								>
									<option value="">{t("filter.allTags")}</option>
									{tags.map((value) => (
										<option key={value} value={value}>
											#{value}
										</option>
									))}
								</select>
								<label htmlFor={folderFilterId}>{t("filter.folder")}</label>
								<select
									id={folderFilterId}
									aria-label={t("filter.byFolder")}
									className="heptabase-field w-full min-w-0"
									value={draftFolder}
									onChange={(event) => setDraftFolder(event.target.value)}
								>
									<option value="">{t("filter.allFolders")}</option>
									{folders.map((value) => (
										<option key={value} value={value}>
											{value}
										</option>
									))}
								</select>
								<label htmlFor={sortId}>{t("filter.sort")}</label>
								<select
									id={sortId}
									aria-label={t("filter.sortCards")}
									className="heptabase-field w-full min-w-0"
									value={draftSort}
									onChange={(event) => setDraftSort(event.target.value as LibrarySort)}
								>
									<option value="updated">{t("filter.recent")}</option>
									<option value="title-asc">{t("filter.titleAsc")}</option>
									<option value="title-desc">{t("filter.titleDesc")}</option>
								</select>
								<span className="heptabase-library-filters__label">{t("filter.scope")}</span>
								<label className="heptabase-library-filters__check" htmlFor={`${sortId}-canvas`}>
									<input
										id={`${sortId}-canvas`}
										type="checkbox"
										checked={draftCanvasOnly}
										disabled={!hasCanvas}
										aria-describedby={!hasCanvas ? canvasScopeHelpId : undefined}
										onChange={(event) => setDraftCanvasOnly(event.target.checked)}
									/>
									{t("filter.currentCanvas")}
								</label>
								{!hasCanvas && (
									<p
										id={canvasScopeHelpId}
										className="col-start-2 m-0 text-hb-muted text-hb-ui-small"
									>
										{t("filter.noCanvas")}
									</p>
								)}
								<div className="heptabase-library-filters__actions">
									<button
										type="button"
										className="heptabase-library-filters__reset"
										onClick={reset}
									>
										{t("filter.reset")}
									</button>
									<button
										type="button"
										className="heptabase-library-filters__apply"
										onClick={apply}
									>
										{t("filter.apply")}
									</button>
								</div>
							</div>
						</>
					)}
				</div>
			</div>
			{(tag || folder || sort !== "updated" || canvasOnly) && (
				<div className="heptabase-library-filters__active" aria-label={t("filter.active")}>
					{tag && (
						<button
							type="button"
							onClick={() => onTagChange("")}
							aria-label={t("filter.removeTag", { tag })}
						>
							#{tag}
							<span aria-hidden="true">×</span>
						</button>
					)}
					{folder && (
						<button
							type="button"
							onClick={() => onFolderChange("")}
							aria-label={t("filter.removeFolder", { folder })}
						>
							{folder}
							<span aria-hidden="true">×</span>
						</button>
					)}
					{sort !== "updated" && (
						<button
							type="button"
							onClick={() => onSortChange("updated")}
							aria-label={t("filter.resetSort")}
						>
							{sort === "title-asc" ? "A–Z" : "Z–A"}
							<span aria-hidden="true">×</span>
						</button>
					)}
					{canvasOnly && (
						<button
							type="button"
							onClick={() => onCanvasOnlyChange?.(false)}
							aria-label={t("filter.showEntireVault")}
						>
							{t("filter.currentCanvas")}
							<span aria-hidden="true">×</span>
						</button>
					)}
				</div>
			)}
		</div>
	);
});
