import type { Canvas, CanvasData, CanvasEdgeData, CanvasNode } from "@/types/obsidian-canvas";
import type { EdgeOptions } from "@/types/plugin";
import type { GraphuneSettings } from "@/types/settings";
import { generateId } from "@/utils/id-generator";
import type { App, TFile } from "obsidian";
import { CanvasHistory } from "@/services/canvas-history";

export type CanvasLayoutAction =
	| "align-left"
	| "align-top"
	| "distribute-horizontal"
	| "distribute-vertical";

export type CanvasJsonMutationResult =
	| { status: "changed" }
	| {
			status: "unchanged";
			reason: "self-loop" | "missing-node" | "duplicate-node" | "duplicate-edge";
	  }
	| { status: "invalid"; reason: "invalid-json" | "invalid-shape" };

export interface CanvasReplacementTransaction {
	node: CanvasNode;
	commit(): void;
	rollback(): boolean;
}

export class CanvasOperator {
	constructor(
		private app: App,
		private settings: GraphuneSettings,
		private history = new CanvasHistory(),
	) {}

	addNodeToCanvas(
		canvas: Canvas,
		file: TFile,
		position: { x: number; y: number },
		subpath?: string,
	): CanvasNode | null {
		if (!subpath && typeof canvas.createFileNode === "function") {
			const before = cloneCanvasData(canvas.getData());
			const node = canvas.createFileNode({
				file,
				pos: position,
				size: {
					width: this.settings.defaultNodeWidth,
					height: this.settings.defaultNodeHeight,
				},
				save: true,
			});
			this.history.record(canvas, before, canvas.getData());
			return node;
		}

		const id = generateId();
		const newNode: {
			id: string;
			type: "file";
			file: string;
			x: number;
			y: number;
			width: number;
			height: number;
			subpath?: string;
		} = {
			id,
			type: "file" as const,
			file: file.path,
			x: position.x,
			y: position.y,
			width: this.settings.defaultNodeWidth,
			height: this.settings.defaultNodeHeight,
		};

		if (subpath) {
			newNode.subpath = subpath;
		}

		if (!this.mutateCanvas(canvas, (data) => data.nodes.push(newNode) > 0)) return null;

		return {
			id,
			x: position.x,
			y: position.y,
			width: this.settings.defaultNodeWidth,
			height: this.settings.defaultNodeHeight,
			file,
		};
	}

	addEdgeToCanvas(canvas: Canvas, options: EdgeOptions): boolean {
		if (options.fromNode === options.toNode) return false;
		return this.mutateCanvas(canvas, (data) => {
			if (
				!data.nodes.some((node) => node.id === options.fromNode) ||
				!data.nodes.some((node) => node.id === options.toNode) ||
				data.edges.some(
					(edge) => edge.fromNode === options.fromNode && edge.toNode === options.toNode,
				)
			) {
				return false;
			}
			data.edges.push(this.buildEdgeData(options));
			return true;
		});
	}

	async addEdgeViaJson(canvasFile: TFile, options: EdgeOptions): Promise<CanvasJsonMutationResult> {
		if (options.fromNode === options.toNode) {
			return { status: "unchanged", reason: "self-loop" };
		}

		let result: CanvasJsonMutationResult = { status: "invalid", reason: "invalid-json" };
		await this.app.vault.process(canvasFile, (raw) => {
			const parsed = parseCanvasData(raw);
			if (!parsed.ok) {
				result = { status: "invalid", reason: parsed.reason };
				return raw;
			}
			const data = parsed.data;
			if (
				!data.nodes.some((node) => node.id === options.fromNode) ||
				!data.nodes.some((node) => node.id === options.toNode)
			) {
				result = { status: "unchanged", reason: "missing-node" };
				return raw;
			}
			if (
				data.edges.some(
					(edge) => edge.fromNode === options.fromNode && edge.toNode === options.toNode,
				)
			) {
				result = { status: "unchanged", reason: "duplicate-edge" };
				return raw;
			}
			data.edges.push(this.buildEdgeData(options));
			result = { status: "changed" };
			return JSON.stringify(data, null, "\t");
		});
		return result;
	}

	private buildEdgeData(options: EdgeOptions): CanvasEdgeData {
		return {
			id: generateId(),
			fromNode: options.fromNode,
			fromSide: "right",
			toNode: options.toNode,
			toSide: "left",
			toEnd: "arrow",
			color: options.color,
			label: options.label,
		};
	}

	addGroupToCanvas(canvas: Canvas, nodes: CanvasNode[], label?: string): boolean {
		if (nodes.length === 0) return false;

		const padding = 20;
		const bounds = this.computeBoundingBox(nodes);

		return this.mutateCanvas(canvas, (data) => {
			data.nodes.push({
				id: generateId(),
				type: "group",
				label: label ?? "Section",
				x: bounds.x - padding,
				y: bounds.y - padding,
				width: bounds.width + padding * 2,
				height: bounds.height + padding * 2,
			});
			return true;
		});
	}

	replaceNodesWithFile(canvas: Canvas, nodeIds: string[], file: TFile): CanvasNode | null {
		const transaction = this.replaceNodesWithFileTransaction(canvas, nodeIds, file);
		transaction?.commit();
		return transaction?.node ?? null;
	}

	replaceNodesWithFileTransaction(
		canvas: Canvas,
		nodeIds: string[],
		file: TFile,
	): CanvasReplacementTransaction | null {
		if (nodeIds.length < 2) return null;
		const selectedIds = new Set(nodeIds);
		let created: CanvasNode | null = null;
		const current = canvas.getData();
		if (!Array.isArray(current.nodes) || !Array.isArray(current.edges)) return null;
		const before = cloneCanvasData(current);
		const data = cloneCanvasData(current);
		const changed = (() => {
			const selected = data.nodes.filter((node) => selectedIds.has(node.id));
			if (selected.length !== selectedIds.size) return false;
			const bounds = this.computeBoundingBox(selected);
			const id = generateId();
			const node = {
				id,
				type: "file" as const,
				file: file.path,
				x: bounds.x + (bounds.width - this.settings.defaultNodeWidth) / 2,
				y: bounds.y + (bounds.height - this.settings.defaultNodeHeight) / 2,
				width: this.settings.defaultNodeWidth,
				height: this.settings.defaultNodeHeight,
			};
			data.nodes = [...data.nodes.filter((candidate) => !selectedIds.has(candidate.id)), node];
			const rewired = data.edges.flatMap((edge) => {
				const fromSelected = selectedIds.has(edge.fromNode);
				const toSelected = selectedIds.has(edge.toNode);
				if (fromSelected && toSelected) return [];
				if (!fromSelected && !toSelected) return [edge];
				return [
					{
						...edge,
						id: generateId(),
						fromNode: fromSelected ? id : edge.fromNode,
						toNode: toSelected ? id : edge.toNode,
					},
				];
			});
			const seen = new Set<string>();
			data.edges = rewired.filter((edge) => {
				const key = `${edge.fromNode}:${edge.toNode}:${edge.label ?? ""}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
			created = { ...node, file };
			return true;
		})();
		if (!changed || !created) return null;
		canvas.setData(data);
		canvas.requestSave();
		let settled = false;
		return {
			node: created,
			commit: () => {
				if (settled) return;
				settled = true;
				this.history.record(canvas, before, data);
			},
			rollback: () => {
				if (settled) return false;
				settled = true;
				return this.history.rollbackUncommitted(canvas, before, data);
			},
		};
	}

	arrangeNodes(canvas: Canvas, nodeIds: string[], action: CanvasLayoutAction): boolean {
		const minimumNodes = action.startsWith("align") ? 2 : 3;
		const selectedIds = new Set(nodeIds);
		return this.mutateCanvas(canvas, (data, before) => {
			const nodes = data.nodes.filter((node) => selectedIds.has(node.id));
			if (nodes.length < minimumNodes) return false;

			switch (action) {
				case "align-left": {
					const left = Math.min(...nodes.map((node) => node.x));
					for (const node of nodes) node.x = left;
					break;
				}
				case "align-top": {
					const top = Math.min(...nodes.map((node) => node.y));
					for (const node of nodes) node.y = top;
					break;
				}
				case "distribute-horizontal":
					this.distributeNodes(nodes, "x", "width");
					break;
				case "distribute-vertical":
					this.distributeNodes(nodes, "y", "height");
					break;
			}

			return !nodes.every((node) => {
				const previous = before.nodes.find((candidate) => candidate.id === node.id);
				return previous?.x === node.x && previous.y === node.y;
			});
		});
	}

	private mutateCanvas(
		canvas: Canvas,
		mutation: (data: CanvasData, before: CanvasData) => boolean,
	): boolean {
		const current = canvas.getData();
		if (!Array.isArray(current.nodes) || !Array.isArray(current.edges)) return false;
		const before = cloneCanvasData(current);
		const data = cloneCanvasData(current);
		if (!mutation(data, before)) return false;
		canvas.setData(data);
		canvas.requestSave();
		this.history.record(canvas, before, data);
		return true;
	}

	undo(canvas: Canvas): boolean {
		return this.history.undo(canvas);
	}

	redo(canvas: Canvas): boolean {
		return this.history.redo(canvas);
	}

	getHistoryState(canvas: Canvas): { canUndo: boolean; canRedo: boolean } {
		return this.history.getState(canvas);
	}

	onHistoryChange(canvas: Canvas, listener: () => void): () => void {
		return this.history.subscribe(canvas, listener);
	}

	private computeBoundingBox(
		nodes: Array<{ x: number; y: number; width: number; height: number }>,
	): {
		x: number;
		y: number;
		width: number;
		height: number;
	} {
		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		for (const node of nodes) {
			minX = Math.min(minX, node.x);
			minY = Math.min(minY, node.y);
			maxX = Math.max(maxX, node.x + node.width);
			maxY = Math.max(maxY, node.y + node.height);
		}

		return {
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY,
		};
	}

	private distributeNodes(
		nodes: CanvasData["nodes"],
		positionKey: "x" | "y",
		sizeKey: "width" | "height",
	): void {
		const sorted = nodes.toSorted(
			(a, b) => a[positionKey] - b[positionKey] || a.id.localeCompare(b.id),
		);
		const first = sorted[0]!;
		const last = sorted.at(-1)!;
		const start = first[positionKey];
		const end = last[positionKey] + last[sizeKey];
		const totalSize = sorted.reduce((sum, node) => sum + node[sizeKey], 0);
		const gap = (end - start - totalSize) / (sorted.length - 1);

		let cursor = start;
		for (const node of sorted) {
			node[positionKey] = cursor;
			cursor += node[sizeKey] + gap;
		}
	}

	async addNodeViaJson(
		canvasFile: TFile,
		file: TFile,
		position: { x: number; y: number },
		subpath?: string,
	): Promise<CanvasJsonMutationResult> {
		const newNode: {
			id: string;
			type: "file";
			file: string;
			x: number;
			y: number;
			width: number;
			height: number;
			subpath?: string;
		} = {
			id: generateId(),
			type: "file",
			file: file.path,
			x: position.x,
			y: position.y,
			width: this.settings.defaultNodeWidth,
			height: this.settings.defaultNodeHeight,
		};

		if (subpath) {
			newNode.subpath = subpath;
		}

		let result: CanvasJsonMutationResult = { status: "invalid", reason: "invalid-json" };
		await this.app.vault.process(canvasFile, (raw) => {
			const parsed = parseCanvasData(raw);
			if (!parsed.ok) {
				result = { status: "invalid", reason: parsed.reason };
				return raw;
			}
			const data = parsed.data;
			if (
				data.nodes.some(
					(node) =>
						node.type === "file" &&
						node.file === file.path &&
						node.subpath === subpath &&
						node.x === position.x &&
						node.y === position.y,
				)
			) {
				result = { status: "unchanged", reason: "duplicate-node" };
				return raw;
			}
			data.nodes.push(newNode);
			result = { status: "changed" };
			return JSON.stringify(data, null, "\t");
		});
		return result;
	}
}

function parseCanvasData(
	raw: string,
): { ok: true; data: CanvasData } | { ok: false; reason: "invalid-json" | "invalid-shape" } {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return { ok: false, reason: "invalid-json" };
	}
	if (
		typeof data !== "object" ||
		data === null ||
		!Array.isArray((data as Partial<CanvasData>).nodes) ||
		!Array.isArray((data as Partial<CanvasData>).edges)
	) {
		return { ok: false, reason: "invalid-shape" };
	}
	return { ok: true, data: data as CanvasData };
}

function cloneCanvasData(data: CanvasData): CanvasData {
	return structuredClone(data);
}
