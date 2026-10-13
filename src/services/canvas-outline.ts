import type { CanvasNodeData } from "@/types/obsidian-canvas";

export interface CanvasOutlineSection {
	id: string;
	label: string;
	color?: string;
	members: CanvasNodeData[];
}

export interface CanvasOutlineModel {
	sections: CanvasOutlineSection[];
	ungrouped: CanvasNodeData[];
}

export function buildCanvasOutline(nodes: readonly CanvasNodeData[]): CanvasOutlineModel {
	const content = nodes.filter((node) => node.type !== "group");
	const sections = nodes
		.filter((node) => node.type === "group")
		.toSorted(spatialOrder)
		.map((group) => ({
			id: group.id,
			label: group.label?.trim() || "",
			color: group.color,
			members: content.filter((node) => centerInside(node, group)).toSorted(spatialOrder),
		}));
	const grouped = new Set(sections.flatMap((section) => section.members.map((node) => node.id)));
	return {
		sections,
		ungrouped: content.filter((node) => !grouped.has(node.id)).toSorted(spatialOrder),
	};
}

export function canvasNodeLabel(node: CanvasNodeData): string {
	if (node.type === "file")
		return node.file?.split("/").pop()?.replace(/\.md$/u, "") || node.file || "";
	if (node.type === "text") return node.text?.trim().split("\n")[0] || "";
	if (node.type === "link") return node.url || "";
	return node.label?.trim() || "";
}

function centerInside(node: CanvasNodeData, group: CanvasNodeData): boolean {
	const x = node.x + node.width / 2;
	const y = node.y + node.height / 2;
	return x >= group.x && x <= group.x + group.width && y >= group.y && y <= group.y + group.height;
}

function spatialOrder(left: CanvasNodeData, right: CanvasNodeData): number {
	return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id);
}
