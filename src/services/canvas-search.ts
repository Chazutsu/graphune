import { t } from "@/i18n";
import type { Canvas, CanvasNodeData } from "@/types/obsidian-canvas";

export type CanvasSearchResultKind = "file" | "text" | "group" | "link";

export interface CanvasSearchResult {
	id: string;
	kind: CanvasSearchResultKind;
	label: string;
	detail: string;
	searchText: string;
}

export class CanvasSearch {
	search(nodes: CanvasNodeData[], query: string): CanvasSearchResult[] {
		const normalizedQuery = query.trim().toLocaleLowerCase();

		return nodes
			.map((node) => this.toResult(node))
			.filter((result): result is CanvasSearchResult => result !== null)
			.filter((result) => {
				if (!normalizedQuery) return true;
				return result.searchText.toLocaleLowerCase().includes(normalizedQuery);
			})
			.toSorted((a, b) => a.label.localeCompare(b.label));
	}

	focus(canvas: Canvas, nodeId: string): boolean {
		const node = canvas.nodes?.get(nodeId);
		if (!node || !canvas.selectOnly) return false;

		canvas.selectOnly(node);
		canvas.zoomToSelection?.();
		return true;
	}

	private toResult(node: CanvasNodeData): CanvasSearchResult | null {
		switch (node.type) {
			case "file":
				if (!node.file) return null;
				return {
					id: node.id,
					kind: "file",
					label: basename(node.file),
					detail: node.file,
					searchText: `${basename(node.file)}\n${node.file}`,
				};
			case "text": {
				const text = node.text?.trim();
				if (!text) return null;
				return {
					id: node.id,
					kind: "text",
					label: firstLine(text),
					detail: t("canvasSearch.textCard"),
					searchText: text,
				};
			}
			case "group":
				return {
					id: node.id,
					kind: "group",
					label: node.label?.trim() || t("canvasSearch.untitledGroup"),
					detail: t("canvasSearch.kindGroup"),
					searchText: node.label?.trim() || t("canvasSearch.untitledGroup"),
				};
			case "link":
				if (!node.url) return null;
				return {
					id: node.id,
					kind: "link",
					label: node.url,
					detail: t("canvasSearch.kindLink"),
					searchText: node.url,
				};
		}

		return null;
	}
}

function basename(path: string): string {
	return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

function firstLine(text: string): string {
	const line = text.split("\n")[0] ?? text;
	return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}
