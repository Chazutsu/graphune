import { ArticleEditor } from "@/ui/components/article-editor";
import { ArticleHeader } from "@/ui/components/article-header";
import { ArticleInfo } from "@/ui/components/article-info";
import { FileSearchDropdown } from "@/ui/components/file-search-dropdown";
import { SelectionDragHandle } from "@/ui/components/selection-drag-handle";
import { t } from "@/i18n";
import { useApp } from "@/ui/hooks/use-app";
import { useEditorSelection } from "@/ui/hooks/use-editor-selection";
import { useFileContent } from "@/ui/hooks/use-file-content";
import { useFileMetadata } from "@/ui/hooks/use-file-metadata";
import { useKnowledgeContext } from "@/ui/hooks/use-knowledge-context";
import { notifyError } from "@/utils/notify-error";
import { EditorView as CodeMirrorEditorView, type EditorView } from "@codemirror/view";
import { TFile, type TAbstractFile } from "obsidian";
import React, {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const LEADING_H1_RE = /^((?:[ \t]*\r?\n)*[ \t]*#(?!#)[ \t]+([^\r\n]+)\r?\n(?:[ \t]*\r?\n)?)/;

function stripFrontmatter(content: string): string {
	const match = content.match(FRONTMATTER_RE);
	return match ? content.slice(match[0].length) : content;
}

function extractFrontmatterBlock(content: string): string {
	const match = content.match(FRONTMATTER_RE);
	return match ? match[0] : "";
}

export function articleHeadingLine(
	sourceLine: number,
	content: string,
	hiddenPrefix: string,
	maxLines: number,
): number {
	const removedPrefix = extractFrontmatterBlock(content) + hiddenPrefix;
	const removedLines = (removedPrefix.match(/\n/g) ?? []).length;
	return Math.min(Math.max(1, sourceLine - removedLines + 1), Math.max(1, maxLines));
}

function normalizeTitle(value: string): string {
	return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function separateDuplicateTitleHeading(
	content: string,
	title: string,
): { body: string; hiddenPrefix: string } {
	const match = content.match(LEADING_H1_RE);
	if (!match) return { body: content, hiddenPrefix: "" };

	const heading = match[2]?.replace(/[ \t]+#+[ \t]*$/, "").trim() ?? "";
	if (normalizeTitle(heading) !== normalizeTitle(title)) {
		return { body: content, hiddenPrefix: "" };
	}

	return {
		body: content.slice(match[1]!.length),
		hiddenPrefix: match[1]!,
	};
}

export interface ArticleViewerPanelHandle {
	selectFile: (path: string, options?: { focusTitle?: boolean; headingLine?: number }) => void;
}

export const ArticleViewerPanel = forwardRef<ArticleViewerPanelHandle>(
	function ArticleViewerPanelInner(_props, ref) {
		const { app } = useApp();
		const [selectedFile, setSelectedFile] = useState<TFile | null>(null);
		const [shouldFocusTitle, setShouldFocusTitle] = useState(false);
		const [headingTarget, setHeadingTarget] = useState<{
			line: number;
			request: number;
		} | null>(null);
		const {
			content,
			isLoading,
			save: saveRaw,
			refresh: refreshContent,
		} = useFileContent(selectedFile);
		const { metadata } = useFileMetadata(selectedFile);
		const knowledgeContext = useKnowledgeContext(selectedFile);
		const [editorView, setEditorView] = useState<EditorView | null>(null);
		const lastSavedBodyRef = useRef<{ path: string; body: string } | null>(null);
		const { selectedText, selectionRect } = useEditorSelection(editorView);

		useEffect(() => {
			if (!selectedFile) return;
			const eventRef = app.vault.on("delete", (deletedFile: TAbstractFile) => {
				if (deletedFile.path === selectedFile.path) {
					setSelectedFile(null);
					setEditorView(null);
				}
			});
			return () => app.vault.offref(eventRef);
		}, [app.vault, selectedFile]);

		const articleContent = useMemo(
			() => separateDuplicateTitleHeading(stripFrontmatter(content), metadata?.title ?? ""),
			[content, metadata?.title],
		);

		useEffect(() => {
			if (!editorView || isLoading || headingTarget === null) return;
			const targetLine = articleHeadingLine(
				headingTarget.line,
				content,
				articleContent.hiddenPrefix,
				editorView.state.doc.lines,
			);
			const line = editorView.state.doc.line(targetLine);
			editorView.dispatch({
				selection: { anchor: line.from },
				effects: CodeMirrorEditorView.scrollIntoView(line.from, { y: "center" }),
			});
			editorView.focus();
		}, [articleContent.hiddenPrefix, content, editorView, headingTarget, isLoading]);

		const saveBody = useCallback(
			async (newBody: string) => {
				if (!selectedFile) {
					return { status: "failed", error: new Error("No file selected") } as const;
				}
				const path = selectedFile.path;
				const expectedBody =
					lastSavedBodyRef.current?.path === path
						? lastSavedBodyRef.current.body
						: articleContent.body;
				const expectedHiddenPrefix = articleContent.hiddenPrefix;
				const changed = await saveRaw((latest) => {
					const latestWithoutFrontmatter = stripFrontmatter(latest);
					const latestParts = separateDuplicateTitleHeading(
						latestWithoutFrontmatter,
						metadata?.title ?? "",
					);
					if (
						latestParts.body !== expectedBody ||
						latestParts.hiddenPrefix !== expectedHiddenPrefix
					) {
						return null;
					}
					return extractFrontmatterBlock(latest) + latestParts.hiddenPrefix + newBody;
				});
				if (changed.status === "saved" || changed.status === "unchanged") {
					lastSavedBodyRef.current = { path, body: newBody };
				}
				return changed;
			},
			[articleContent.body, articleContent.hiddenPrefix, metadata?.title, saveRaw, selectedFile],
		);

		useImperativeHandle(ref, () => ({
			selectFile: (path: string, options) => {
				const abstractFile = app.vault.getAbstractFileByPath(path);
				if (abstractFile instanceof TFile) {
					setSelectedFile(abstractFile);
					setEditorView(null);
					setShouldFocusTitle(options?.focusTitle === true);
					setHeadingTarget((current) =>
						options?.headingLine === undefined
							? null
							: { line: options.headingLine, request: (current?.request ?? 0) + 1 },
					);
				}
			},
		}));

		const handleFileSelect = useCallback((file: TFile | null) => {
			setSelectedFile(file);
			setEditorView(null);
			setShouldFocusTitle(false);
			setHeadingTarget(null);
		}, []);

		const handleEditorView = useCallback((view: EditorView | null) => {
			setEditorView(view);
		}, []);

		const handleRename = useCallback(
			async (newTitle: string) => {
				if (!selectedFile) {
					return;
				}
				const dir = selectedFile.parent?.path ?? "";
				const newPath = dir
					? `${dir}/${newTitle}.${selectedFile.extension}`
					: `${newTitle}.${selectedFile.extension}`;
				try {
					await app.fileManager.renameFile(selectedFile, newPath);
					refreshContent();
				} catch (error) {
					notifyError(t("article.renameFailed"), error);
				}
			},
			[app.fileManager, selectedFile, refreshContent],
		);

		const updateProperty = useCallback(
			async (key: string, value: unknown, action: "set" | "delete" = "set") => {
				if (!selectedFile) {
					return;
				}
				try {
					await app.fileManager.processFrontMatter(selectedFile, (fm) => {
						const frontmatter = fm as Record<string, unknown>;
						if (action === "delete") delete frontmatter[key];
						else frontmatter[key] = value;
					});
					refreshContent();
				} catch (error) {
					notifyError(
						action === "delete"
							? t("article.propertyDeleteFailed")
							: t("article.propertyUpdateFailed"),
						error,
					);
				}
			},
			[app.fileManager, selectedFile, refreshContent],
		);
		const handlePropertyChange = useCallback(
			(key: string, value: unknown) => updateProperty(key, value),
			[updateProperty],
		);
		const handlePropertyDelete = useCallback(
			(key: string) => updateProperty(key, undefined, "delete"),
			[updateProperty],
		);

		const sourcePath = asString(metadata?.frontmatter["heptabase-source"]);
		const sourceHeading = asString(metadata?.frontmatter["heptabase-source-heading"]);
		const contextualBacklinks = sourcePath
			? knowledgeContext.backlinks.filter((reference) => reference.path !== sourcePath)
			: knowledgeContext.backlinks;

		return (
			<div className="article-viewer h-full flex flex-col">
				<FileSearchDropdown onSelect={handleFileSelect} />
				{selectedFile && metadata && (
					<>
						<ArticleHeader
							key={`header:${selectedFile.path}`}
							title={metadata.title}
							path={metadata.path}
							frontmatter={metadata.frontmatter}
							autoFocusTitle={shouldFocusTitle}
							onTitleFocused={() => setShouldFocusTitle(false)}
							onRename={(title) => void handleRename(title)}
							onPropertyChange={(key, value) => void handlePropertyChange(key, value)}
							onPropertyDelete={(key) => void handlePropertyDelete(key)}
							onPropertyAdd={(key, value) => void handlePropertyChange(key, value)}
						/>
						<ArticleEditor
							key={`editor:${selectedFile.path}`}
							content={articleContent.body}
							resourceKey={selectedFile.path}
							onSave={saveBody}
							onEditorView={handleEditorView}
						/>
						<SelectionDragHandle
							selectedText={selectedText}
							selectionRect={selectionRect}
							filePath={selectedFile.path}
						/>
						<ArticleInfo
							sourcePath={sourcePath}
							sourceHeading={sourceHeading}
							backlinks={contextualBacklinks}
							canvases={knowledgeContext.canvases}
						/>
					</>
				)}
				{!selectedFile && (
					<div role="status" className="p-3 text-hb-muted text-hb-ui-small">
						{t("article.select")}
					</div>
				)}
			</div>
		);
	},
);

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
