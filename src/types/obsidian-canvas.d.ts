import type { TFile } from "obsidian";

export interface CanvasNodeData {
	id: string;
	type: "file" | "text" | "link" | "group";
	file?: string;
	text?: string;
	url?: string;
	label?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	subpath?: string;
}

export type CanvasEdgeEnd = "none" | "arrow";

export interface CanvasEdgeData {
	id: string;
	fromNode: string;
	fromSide: "top" | "right" | "bottom" | "left";
	fromEnd?: CanvasEdgeEnd;
	toNode: string;
	toSide: "top" | "right" | "bottom" | "left";
	toEnd?: CanvasEdgeEnd;
	color?: string;
	label?: string;
}

export interface CanvasData {
	nodes: CanvasNodeData[];
	edges: CanvasEdgeData[];
}

export interface CanvasView {
	canvas: Canvas;
	file: TFile;
}

export interface Canvas {
	getData(): CanvasData;
	setData(data: CanvasData): void;
	requestSave(): void;
	createFileNode(options: {
		file: TFile;
		pos: { x: number; y: number };
		size?: { width: number; height: number };
		save?: boolean;
	}): CanvasNode;
	selection?: Set<CanvasNode>;
	nodes?: Map<string, CanvasNode>;
	selectOnly?(node: CanvasNode): void;
	zoomToSelection?(): void;
	posFromEvt(evt: MouseEvent | DragEvent): { x: number; y: number };
	tx: number;
	ty: number;
	tZoom: number;
}

export interface CanvasNode {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	file?: TFile;
	nodeEl?: HTMLElement;
	containerEl?: HTMLElement;
}
