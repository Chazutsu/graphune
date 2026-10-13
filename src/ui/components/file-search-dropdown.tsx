import { t } from "@/i18n";
import { useClickOutside } from "@/ui/hooks/use-click-outside";
import { useFileSearch } from "@/ui/hooks/use-file-search";
import type { TFile } from "obsidian";
import type React from "react";
import { useCallback, useId, useRef, useState } from "react";

interface FileSearchDropdownProps {
	onSelect: (file: TFile | null) => void;
}

export function FileSearchDropdown({ onSelect }: FileSearchDropdownProps): React.ReactElement {
	const { query, setQuery, results, searchSettled } = useFileSearch();
	const [showResults, setShowResults] = useState(true);
	const [activeIndex, setActiveIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const instanceId = useId().replaceAll(":", "");
	const resultsId = `heptabase-article-search-results-${instanceId}`;

	const handleDismiss = useCallback(() => {
		setShowResults(false);
		setActiveIndex(-1);
	}, []);

	useClickOutside(containerRef, handleDismiss);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setQuery(e.target.value);
			setShowResults(true);
			setActiveIndex(-1);
		},
		[setQuery],
	);

	const handleSelect = useCallback(
		(file: TFile) => {
			onSelect(file);
			setQuery("");
			setShowResults(false);
			setActiveIndex(-1);
			inputRef.current?.focus();
		},
		[onSelect, setQuery],
	);

	// Do not show results for the previous query while the new query is debouncing.
	const visibleResults = showResults && searchSettled ? results : [];
	const showNoResults = showResults && searchSettled && query.trim() !== "" && results.length === 0;
	const showSearching = showResults && !searchSettled && query.trim() !== "";
	const handleInputKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			const currentResults = showResults && searchSettled ? results : [];
			if (event.key === "ArrowDown" && currentResults.length > 0) {
				event.preventDefault();
				setActiveIndex((index) => Math.min(index + 1, currentResults.length - 1));
			} else if (event.key === "ArrowUp" && currentResults.length > 0) {
				event.preventDefault();
				setActiveIndex((index) => Math.max(index - 1, 0));
			} else if (event.key === "Enter" && activeIndex >= 0) {
				event.preventDefault();
				const selectedFile = currentResults[activeIndex];
				if (selectedFile) handleSelect(selectedFile);
			} else if (event.key === "Escape") {
				setShowResults(false);
				setActiveIndex(-1);
			}
		},
		[activeIndex, handleSelect, results, searchSettled, showResults],
	);

	return (
		<div ref={containerRef} className="heptabase-article-search px-2 py-1.5">
			<input
				ref={inputRef}
				type="text"
				placeholder={t("article.search")}
				aria-label={t("article.searchLabel")}
				value={query}
				aria-autocomplete="list"
				aria-controls={resultsId}
				aria-expanded={visibleResults.length > 0}
				aria-busy={!searchSettled}
				aria-activedescendant={activeIndex >= 0 ? `${resultsId}-option-${activeIndex}` : undefined}
				onChange={handleChange}
				onKeyDown={handleInputKeyDown}
				className="heptabase-field w-full px-2 py-1 text-hb-normal text-hb-ui-small"
			/>
			{visibleResults.length > 0 && (
				<ul
					id={resultsId}
					role="listbox"
					aria-label={t("article.results")}
					className="mt-1 max-h-48 overflow-y-auto list-none p-0 m-0"
				>
					{visibleResults.map((file, index) => (
						<FileSearchItem
							key={file.path}
							file={file}
							id={`${resultsId}-option-${index}`}
							isActive={index === activeIndex}
							onSelect={handleSelect}
							onFocus={() => setActiveIndex(index)}
						/>
					))}
				</ul>
			)}
			{showNoResults && (
				<div role="status" aria-live="polite" className="px-2 py-1 text-hb-muted text-hb-ui-small">
					{t("article.noMatches")}
				</div>
			)}
			{showSearching && (
				<div role="status" aria-live="polite" className="px-2 py-1 text-hb-muted text-hb-ui-small">
					{t("article.searching")}
				</div>
			)}
		</div>
	);
}

interface FileSearchItemProps {
	file: TFile;
	id: string;
	isActive: boolean;
	onSelect: (file: TFile) => void;
	onFocus: () => void;
}

function FileSearchItem({
	file,
	id,
	isActive,
	onSelect,
	onFocus,
}: FileSearchItemProps): React.ReactElement {
	const handleClick = useCallback(() => {
		onSelect(file);
	}, [file, onSelect]);

	return (
		<li role="presentation">
			<button
				id={id}
				role="option"
				aria-selected={isActive}
				aria-label={t("article.open", { path: file.path })}
				type="button"
				onFocus={onFocus}
				className={`heptabase-search-option w-full text-left px-2 py-1.5 cursor-pointer text-hb-muted rounded text-hb-ui-small ${isActive ? "is-active" : ""}`}
				onClick={handleClick}
			>
				{file.path}
			</button>
		</li>
	);
}
