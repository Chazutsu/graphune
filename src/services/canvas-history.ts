import type { Canvas, CanvasData, CanvasEdgeData, CanvasNodeData } from "@/types/obsidian-canvas";

interface CollectionPatch<T extends { id: string }> {
	changes: Array<{
		id: string;
		expected?: T;
		replacement?: T;
		previousId?: string;
		nextId?: string;
		targetIndex?: number;
	}>;
}

interface CanvasPatch {
	nodes: CollectionPatch<CanvasNodeData>;
	edges: CollectionPatch<CanvasEdgeData>;
}

interface HistoryEntry {
	undo: CanvasPatch;
	redo: CanvasPatch;
	size: number;
}

const MAX_HISTORY_ENTRIES = 100;
const MAX_HISTORY_BYTES = 4 * 1024 * 1024;

const clone = <T>(value: T): T => structuredClone(value);

export class CanvasHistory {
	private readonly undoStacks = new WeakMap<Canvas, HistoryEntry[]>();
	private readonly redoStacks = new WeakMap<Canvas, HistoryEntry[]>();
	private readonly listeners = new WeakMap<Canvas, Set<() => void>>();

	record(canvas: Canvas, before: CanvasData, after: CanvasData): void {
		const undo = createCanvasPatch(after, before);
		const redo = createCanvasPatch(before, after);
		if (isEmptyPatch(redo)) return;

		const entry = { undo, redo, size: JSON.stringify({ undo, redo }).length * 2 };
		const undoStack = this.undoStacks.get(canvas) ?? [];
		undoStack.push(entry);
		while (
			undoStack.length > 1 &&
			(undoStack.length > MAX_HISTORY_ENTRIES ||
				undoStack.reduce((total, candidate) => total + candidate.size, 0) > MAX_HISTORY_BYTES)
		) {
			undoStack.shift();
		}
		this.undoStacks.set(canvas, undoStack);
		this.redoStacks.delete(canvas);
		this.emit(canvas);
	}

	rollbackUncommitted(canvas: Canvas, before: CanvasData, after: CanvasData): boolean {
		return this.apply(canvas, createCanvasPatch(after, before));
	}

	undo(canvas: Canvas): boolean {
		const undoStack = this.undoStacks.get(canvas);
		const entry = undoStack?.pop();
		if (!entry) return false;
		this.apply(canvas, entry.undo);
		const redoStack = this.redoStacks.get(canvas) ?? [];
		redoStack.push(entry);
		this.redoStacks.set(canvas, redoStack);
		this.emit(canvas);
		return true;
	}

	redo(canvas: Canvas): boolean {
		const redoStack = this.redoStacks.get(canvas);
		const entry = redoStack?.pop();
		if (!entry) return false;
		this.apply(canvas, entry.redo);
		const undoStack = this.undoStacks.get(canvas) ?? [];
		undoStack.push(entry);
		this.undoStacks.set(canvas, undoStack);
		this.emit(canvas);
		return true;
	}

	getState(canvas: Canvas): { canUndo: boolean; canRedo: boolean } {
		return {
			canUndo: (this.undoStacks.get(canvas)?.length ?? 0) > 0,
			canRedo: (this.redoStacks.get(canvas)?.length ?? 0) > 0,
		};
	}

	subscribe(canvas: Canvas, listener: () => void): () => void {
		const listeners = this.listeners.get(canvas) ?? new Set();
		listeners.add(listener);
		this.listeners.set(canvas, listeners);
		return () => listeners.delete(listener);
	}

	private apply(canvas: Canvas, patch: CanvasPatch): boolean {
		const current = canvas.getData();
		const next = {
			nodes: applyCollectionPatch(current.nodes, patch.nodes),
			edges: applyCollectionPatch(current.edges, patch.edges),
		};
		if (isEqual(current, next)) return false;
		canvas.setData(next);
		canvas.requestSave();
		return true;
	}

	private emit(canvas: Canvas): void {
		for (const listener of this.listeners.get(canvas) ?? []) listener();
	}
}

function createCanvasPatch(source: CanvasData, target: CanvasData): CanvasPatch {
	return {
		nodes: createCollectionPatch(source.nodes, target.nodes),
		edges: createCollectionPatch(source.edges, target.edges),
	};
}

function createCollectionPatch<T extends { id: string }>(
	source: T[],
	target: T[],
): CollectionPatch<T> {
	const sourceById = new Map(source.map((item) => [item.id, item]));
	const targetById = new Map(target.map((item) => [item.id, item]));
	const ids = new Set([...sourceById.keys(), ...targetById.keys()]);
	return {
		changes: [...ids]
			.filter((id) => !isEqual(sourceById.get(id), targetById.get(id)))
			.map((id) => {
				const targetIndex = target.findIndex((item) => item.id === id);
				return {
					id,
					expected: cloneOptional(sourceById.get(id)),
					replacement: cloneOptional(targetById.get(id)),
					previousId: targetIndex >= 0 ? target[targetIndex - 1]?.id : undefined,
					nextId: targetIndex >= 0 ? target[targetIndex + 1]?.id : undefined,
					targetIndex: targetIndex >= 0 ? targetIndex : undefined,
				};
			}),
	};
}

function applyCollectionPatch<T extends { id: string }>(
	current: T[],
	patch: CollectionPatch<T>,
): T[] {
	const applicable = patch.changes.filter(({ id, expected }) => {
		const currentItem = current.find((item) => item.id === id);
		return isEqual(currentItem, expected);
	});
	const applicableById = new Map(applicable.map((change) => [change.id, change]));
	const result = current
		.filter((item) => {
			const change = applicableById.get(item.id);
			return !change || change.replacement !== undefined;
		})
		.map((item) => clone(applicableById.get(item.id)?.replacement ?? item));
	for (const { id, replacement, previousId, nextId, targetIndex } of applicable) {
		if (!replacement || result.some((item) => item.id === id)) continue;
		const nextIndex = nextId ? result.findIndex((candidate) => candidate.id === nextId) : -1;
		if (nextIndex >= 0) {
			result.splice(nextIndex, 0, clone(replacement));
			continue;
		}
		const previousIndex = previousId
			? result.findIndex((candidate) => candidate.id === previousId)
			: -1;
		result.splice(
			previousIndex >= 0
				? previousIndex + 1
				: Math.min(targetIndex ?? result.length, result.length),
			0,
			clone(replacement),
		);
	}
	return result;
}

function cloneOptional<T>(value: T | undefined): T | undefined {
	return value === undefined ? undefined : clone(value);
}

function isEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function isEmptyPatch(patch: CanvasPatch): boolean {
	return patch.nodes.changes.length === 0 && patch.edges.changes.length === 0;
}
