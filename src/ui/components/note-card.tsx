import { t } from "@/i18n";
import { ContentExtractor } from "@/services/content-extractor";
import { CanvasObserver } from "@/services/canvas-observer";
import { CanvasOperator } from "@/services/canvas-operator";
import type {
	NoteDragData,
	ParsedHeading,
	SourceKind,
	TextSelectionDragData,
} from "@/types/plugin";
import { useApp } from "@/ui/hooks/use-app";
import { useDragData } from "@/ui/hooks/use-drag-data";
import { useSidebarActions } from "@/ui/hooks/use-sidebar-actions";
import { useSourceChangeStatus } from "@/ui/hooks/use-source-change-status";
import { Component, MarkdownRenderer, Menu, Notice, type TFile } from "obsidian";
import type React from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface NoteCardProps {
	file: TFile;
	excerpt: string;
	headings?: ParsedHeading[];
	sourceKind?: SourceKind;
	tags?: string[];
	query?: string;
	isInCanvas?: boolean;
	isCanvasSelected?: boolean;
	isHydrating?: boolean;
}

const COLLAPSED_HEADING_COUNT = 2;

export const NoteCard = memo(function NoteCardInner({
	file,
	excerpt,
	headings = [],
	sourceKind = "note",
	tags = [],
	query = "",
	isInCanvas = false,
	isCanvasSelected = false,
	isHydrating = false,
}: NoteCardProps): React.ReactElement {
	const {
		app,
		settings,
		canvasOperator: sharedCanvasOperator,
		canvasObserver: sharedCanvasObserver,
	} = useApp();
	const { openInArticle } = useSidebarActions();
	const { status: sourceChangeStatus, sourcePath } = useSourceChangeStatus(file);
	const canvasObserver = useMemo(
		() => sharedCanvasObserver ?? new CanvasObserver(app),
		[app, sharedCanvasObserver],
	);
	const canvasOperator = useMemo(
		() => sharedCanvasOperator ?? new CanvasOperator(app, settings),
		[app, settings, sharedCanvasOperator],
	);
	const excerptRef = useRef<HTMLDivElement>(null);
	const [content, setContent] = useState("");
	const [detailsExpanded, setDetailsExpanded] = useState(false);
	const [headingsExpanded, setHeadingsExpanded] = useState(false);
	const extractor = useRef(new ContentExtractor()).current;
	const distinctHeadings = headings.filter(
		(heading, index) => index !== 0 || heading.heading.trim() !== file.basename.trim(),
	);
	const visibleHeadings = headingsExpanded
		? distinctHeadings
		: distinctHeadings.slice(0, COLLAPSED_HEADING_COUNT);
	const hiddenHeadingCount = distinctHeadings.length - visibleHeadings.length;

	const getDragData = useCallback(
		(): NoteDragData => ({
			type: "note-drag",
			filePath: file.path,
		}),
		[file.path],
	);

	const { isDragging, handleDragStart, handleDragEnd } = useDragData(getDragData);

	const addToCanvas = useCallback(
		(subpath?: string, displayName = file.basename) => {
			const canvasView = canvasObserver.getActiveCanvasView();
			if (!canvasView) {
				new Notice(t("card.noCanvas"));
				return;
			}
			const canvas = canvasView.canvas;
			const position = {
				x: Math.round(-canvas.tx / canvas.tZoom),
				y: Math.round(-canvas.ty / canvas.tZoom),
			};
			if (canvasOperator.addNodeToCanvas(canvas, file, position, subpath)) {
				new Notice(t("card.added", { name: displayName }));
			}
		},
		[canvasObserver, canvasOperator, file],
	);

	useEffect(() => {
		if (headings.length === 0) return;
		let cancelled = false;
		app.vault
			.cachedRead(file)
			.then((value) => {
				if (!cancelled) setContent(value);
			})
			.catch(() => {
				if (!cancelled) setContent("");
			});
		return () => {
			cancelled = true;
		};
	}, [app, file, headings.length]);

	const getHeadingDragData = useCallback(
		(heading: ParsedHeading): TextSelectionDragData => ({
			type: "text-selection-drag",
			filePath: file.path,
			selectedText: content
				? extractor.extractContentWithHeading(content, heading.position.start.line, heading.level)
				: `${"#".repeat(heading.level)} ${heading.heading}`,
			title: heading.heading,
			sourceHeading: heading.heading,
		}),
		[content, extractor, file.path],
	);

	useEffect(() => {
		const el = excerptRef.current;
		if (!el || !excerpt) return;
		let cancelled = false;
		const component = new Component();
		const renderTarget = createDiv();
		component.load();
		void MarkdownRenderer.render(app, excerpt, renderTarget, file.path, component)
			.then(() => {
				if (!cancelled) {
					highlightText(renderTarget, query);
					el.replaceChildren(...renderTarget.childNodes);
				}
			})
			.catch(() => {
				if (!cancelled) el.textContent = excerpt;
			});
		return () => {
			cancelled = true;
			component.unload();
		};
	}, [app, excerpt, file.path, query]);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			const menu = new Menu();
			menu.addItem((item) => {
				item
					.setTitle(t("card.addToCanvas"))
					.setIcon("layout-dashboard")
					.onClick(() => addToCanvas());
			});
			menu.addItem((item) => {
				item
					.setTitle(t("card.openArticle"))
					.setIcon("file-text")
					.onClick(() => {
						openInArticle(file.path);
					});
			});
			menu.showAtMouseEvent(e.nativeEvent);
		},
		[addToCanvas, file.path, openInArticle],
	);

	const className = `heptabase-note-card p-2 rounded border border-hb-border-subtle ${isDragging ? "is-dragging" : ""} ${isInCanvas ? "is-in-canvas" : ""} ${isCanvasSelected ? "is-canvas-selected" : ""}`;

	return (
		<div
			className={className}
			data-file-path={file.path}
			data-canvas-selected={isCanvasSelected || undefined}
			aria-current={isCanvasSelected ? "true" : undefined}
			onContextMenu={handleContextMenu}
		>
			<span className={`graphune-source-kind is-${sourceKind}`}>
				{t(`sourceKind.${sourceKind}`)}
			</span>
			<span
				className="heptabase-note-card__drag-handle"
				draggable
				aria-hidden="true"
				title={t("card.drag")}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
				<span aria-hidden="true">⠿</span>
			</span>
			<button
				type="button"
				className="heptabase-note-card__quick-add"
				aria-label={t("card.addToCanvas")}
				title={t("card.addToCanvas")}
				onClick={() => addToCanvas()}
			>
				<span aria-hidden="true">＋</span>
			</button>
			<a
				href={`#${encodeURIComponent(file.path)}`}
				className="heptabase-note-card__main"
				title={file.basename}
				aria-label={file.basename}
				onClick={(event) => {
					event.preventDefault();
					openInArticle(file.path);
				}}
			>
				<span className="heptabase-note-card__title text-hb-ui-small font-medium">
					<HighlightedText text={file.basename} query={query} />
				</span>
				{(excerpt || isHydrating) && (
					<div
						ref={excerptRef}
						className={`heptabase-note-card__excerpt text-hb-muted text-hb-ui-small mt-1 max-h-20 overflow-hidden card-fade ${isHydrating && !excerpt ? "is-loading" : ""}`}
						aria-hidden={isHydrating && !excerpt ? "true" : undefined}
					/>
				)}
				{tags.length > 0 && (
					<span className="heptabase-note-card__tags flex flex-wrap gap-1 mt-1.5">
						{tags.slice(0, 2).map((tag) => (
							<span
								key={tag}
								className="px-1.5 py-0.5 rounded text-hb-muted text-hb-ui-small bg-hb-hover"
							>
								#{tag}
							</span>
						))}
						{tags.length > 2 && (
							<span className="px-1 py-0.5 text-hb-muted text-hb-ui-small">+{tags.length - 2}</span>
						)}
					</span>
				)}
			</a>
			{isInCanvas && (
				<span className="heptabase-note-card__canvas-status" aria-label={t("card.onCanvas")}>
					Canvas
				</span>
			)}
			{sourceChangeStatus === "changed" && sourcePath && (
				<button
					type="button"
					className="heptabase-note-card__source-change"
					onClick={(event) => {
						event.stopPropagation();
						openInArticle(sourcePath);
					}}
				>
					{t("card.sourceUpdated")}
				</button>
			)}
			<button
				type="button"
				className="heptabase-note-card__details-toggle"
				aria-expanded={detailsExpanded}
				onClick={() => setDetailsExpanded((expanded) => !expanded)}
			>
				{detailsExpanded ? t("card.hideTools") : t("card.showTools")}
			</button>
			{detailsExpanded && (
				<div className="heptabase-note-card__details">
					{distinctHeadings.length > 0 && (
						<div className="heptabase-note-card__headings" aria-label={t("card.headings")}>
							{visibleHeadings.map((heading) => (
								<HeadingItem
									key={`${heading.position.start.line}-${heading.heading}`}
									heading={heading}
									onGetDragData={getHeadingDragData}
									onActivate={() =>
										openInArticle(file.path, { headingLine: heading.position.start.line })
									}
									onAddToCanvas={() => addToCanvas(`#${heading.heading}`, heading.heading)}
								/>
							))}
							{distinctHeadings.length > COLLAPSED_HEADING_COUNT && (
								<button
									type="button"
									className="heptabase-note-card__heading-toggle"
									aria-expanded={headingsExpanded}
									onClick={() => setHeadingsExpanded((expanded) => !expanded)}
								>
									{headingsExpanded
										? t("card.showLess")
										: t("card.more", { count: hiddenHeadingCount })}
								</button>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
});

function HighlightedText({ text, query }: { text: string; query: string }): React.ReactElement {
	const normalizedQuery = query.trim();
	if (!normalizedQuery) return <>{text}</>;
	const index = text.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase());
	if (index < 0) return <>{text}</>;
	return (
		<>
			{text.slice(0, index)}
			<mark className="heptabase-search-match">
				{text.slice(index, index + normalizedQuery.length)}
			</mark>
			{text.slice(index + normalizedQuery.length)}
		</>
	);
}

function highlightText(root: HTMLElement, query: string): void {
	const normalizedQuery = query.trim();
	if (!normalizedQuery) return;
	const lowerQuery = normalizedQuery.toLocaleLowerCase();
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const matches: Text[] = [];
	let node: Node | null;
	while ((node = walker.nextNode())) {
		if (node.textContent?.toLocaleLowerCase().includes(lowerQuery)) matches.push(node as Text);
	}
	for (const textNode of matches) {
		const text = textNode.data;
		const index = text.toLocaleLowerCase().indexOf(lowerQuery);
		if (index < 0) continue;
		const mark = root.createEl("mark");
		mark.detach();
		mark.className = "heptabase-search-match";
		mark.textContent = text.slice(index, index + normalizedQuery.length);
		textNode.replaceWith(text.slice(0, index), mark, text.slice(index + normalizedQuery.length));
	}
}

function HeadingItem({
	heading,
	onGetDragData,
	onActivate,
	onAddToCanvas,
}: {
	heading: ParsedHeading;
	onGetDragData: (heading: ParsedHeading) => TextSelectionDragData;
	onActivate: () => void;
	onAddToCanvas: () => void;
}): React.ReactElement {
	const { isDragging, handleDragStart, handleDragEnd } = useDragData(() => onGetDragData(heading), {
		label: heading.heading,
	});

	return (
		<div
			draggable
			className={`heptabase-heading-item text-hb-ui-small text-hb-muted truncate cursor-grab ${isDragging ? "is-dragging" : ""}`}
			style={{ paddingLeft: `${Math.max(0, heading.level - 1) * 8}px` }}
			onDragStart={(event) => {
				event.stopPropagation();
				handleDragStart(event);
			}}
			onDragEnd={(event) => {
				event.stopPropagation();
				handleDragEnd();
			}}
		>
			<button type="button" className="heptabase-heading-item__open" onClick={onActivate}>
				{heading.heading}
			</button>
			<button
				type="button"
				className="heptabase-heading-item__canvas-action"
				aria-label={t("card.addHeadingToCanvas", { heading: heading.heading })}
				onClick={onAddToCanvas}
			>
				{t("card.canvas")}
			</button>
		</div>
	);
}
