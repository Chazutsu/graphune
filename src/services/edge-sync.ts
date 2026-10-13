import { BacklinkWriter } from "@/services/backlink-writer";
import type { CanvasData, CanvasEdgeData, CanvasNodeData } from "@/types/obsidian-canvas";
import { TFile, type App } from "obsidian";

const CANVAS_READ_CONCURRENCY = 4;

export class EdgeSync {
	private app: App;
	private backlinkWriter: BacklinkWriter;
	private canvasSnapshots = new Map<string, CanvasSnapshot>();
	private connectionCanvases = new Map<string, Set<string>>();
	private indexComplete = false;
	private unreadableCanvasPaths = new Set<string>();
	private generation = 0;
	private modificationQueue: Promise<void> = Promise.resolve();
	private pendingDeletions: PendingCanvasDeletion[] = [];
	private pendingRepairs: PendingConnectionRepair[] = [];
	private persistState: (state: EdgeSyncPersistentState) => Promise<void> = async () => {};
	private nextRepairId = 0;
	private edgeSnapshot: Map<string, CanvasEdgeData> = new Map();
	private nodeSnapshot: Map<string, CanvasNodeData> = new Map();

	constructor(app: App) {
		this.app = app;
		this.backlinkWriter = new BacklinkWriter(app);
	}

	configurePersistentState(
		state: EdgeSyncPersistentState,
		persist: (state: EdgeSyncPersistentState) => Promise<void>,
	): void {
		this.pendingDeletions = structuredClone(state.pendingDeletions);
		this.pendingRepairs = structuredClone(state.pendingRepairs);
		this.persistState = persist;
	}

	pendingDeletionSnapshot(): PendingCanvasDeletion[] {
		return structuredClone(this.pendingDeletions);
	}

	pendingRepairSnapshot(): PendingConnectionRepair[] {
		return structuredClone(this.pendingRepairs);
	}

	async onCanvasCreated(file: TFile): Promise<void> {
		await this.onCanvasModified(file);
	}

	async onCanvasModified(file: TFile): Promise<void> {
		await this.enqueue((generation) => this.processCanvasModified(file, generation));
	}

	private async processCanvasModified(file: TFile, generation: number): Promise<void> {
		if (!file.path.endsWith(".canvas")) return;

		let canvasData: CanvasData | null = null;
		try {
			canvasData = parseCanvasData(await this.app.vault.read(file));
		} catch {
			this.markCanvasUnreadable(file.path);
			return;
		}
		if (!canvasData) {
			this.markCanvasUnreadable(file.path);
			return;
		}
		if (!this.isCurrent(generation)) return;
		const wasUnreadable = this.unreadableCanvasPaths.has(file.path);
		this.unreadableCanvasPaths.delete(file.path);

		const snapshot = this.canvasSnapshots.get(file.path) ?? EMPTY_SNAPSHOT;
		const currentNodes = new Map(canvasData.nodes.map((node) => [node.id, node]));
		const removedEdges = this.diffRemovedEdges(canvasData.edges, snapshot, currentNodes);
		if (removedEdges.length > 0 && !this.indexComplete) {
			await this.refreshVaultIndex(generation, false, { path: file.path, data: canvasData });
		}
		const canRemove = removedEdges.length === 0 || this.indexComplete;
		const remainingConnections =
			removedEdges.length > 0 && canRemove
				? await this.connectionsAfterUpdate(file, canvasData, generation)
				: new Set<string>();
		if (!this.isCurrent(generation)) return;
		if (canRemove) {
			for (const edge of removedEdges) {
				if (!this.isCurrent(generation)) return;
				await this.processRemovedEdge(
					edge,
					canvasData.edges,
					snapshot,
					currentNodes,
					file,
					canvasData,
					remainingConnections,
					generation,
				);
			}
		} else if (removedEdges.length > 0) {
			this.deferRemovedEdges(file.path, snapshot, removedEdges);
			await this.savePersistentState();
		}

		const newEdges = this.diffEdges(canvasData.edges, snapshot, currentNodes);
		for (const edge of newEdges) {
			if (!this.isCurrent(generation)) return;
			await this.processNewEdge(edge, canvasData, generation);
		}

		if (this.isCurrent(generation)) this.replaceSnapshot(file.path, createSnapshot(canvasData));
		if (
			this.isCurrent(generation) &&
			!this.indexComplete &&
			(wasUnreadable || this.pendingDeletions.length > 0)
		) {
			await this.refreshVaultIndex(generation, false, { path: file.path, data: canvasData });
		}
	}

	diffEdges(
		currentEdges: CanvasEdgeData[],
		snapshot?: CanvasSnapshot,
		currentNodes?: Map<string, CanvasNodeData>,
	): CanvasEdgeData[] {
		const previous = snapshot ?? { edges: this.edgeSnapshot, nodes: this.nodeSnapshot };
		return currentEdges.filter((edge) => {
			const previousEdge = previous.edges.get(edge.id);
			return (
				!previousEdge ||
				!sameConnection(previousEdge, previous.nodes, edge, currentNodes ?? previous.nodes)
			);
		});
	}

	diffRemovedEdges(
		currentEdges: CanvasEdgeData[],
		snapshot?: CanvasSnapshot,
		currentNodes?: Map<string, CanvasNodeData>,
	): CanvasEdgeData[] {
		const previous = snapshot ?? { edges: this.edgeSnapshot, nodes: this.nodeSnapshot };
		const currentById = new Map(currentEdges.map((edge) => [edge.id, edge]));
		const nodes = currentNodes ?? previous.nodes;
		const removed: CanvasEdgeData[] = [];
		for (const [id, edge] of previous.edges) {
			const currentEdge = currentById.get(id);
			if (!currentEdge || !sameConnection(edge, previous.nodes, currentEdge, nodes)) {
				removed.push(edge);
			}
		}
		return removed;
	}

	async processNewEdge(
		edge: CanvasEdgeData,
		canvasData: CanvasData,
		generation = this.generation,
	): Promise<void> {
		const connection = resolveConnection(
			edge,
			new Map(canvasData.nodes.map((node) => [node.id, node])),
		);
		if (!connection) return;

		const sourceFile = this.app.vault.getAbstractFileByPath(connection.from);
		const targetFile = this.app.vault.getAbstractFileByPath(connection.to);
		if (!(sourceFile instanceof TFile) || !(targetFile instanceof TFile)) return;

		await this.applyConnectionMutation(connection, "add", generation);
	}

	async processRemovedEdge(
		edge: CanvasEdgeData,
		currentEdges: CanvasEdgeData[],
		snapshot?: CanvasSnapshot,
		currentNodes?: Map<string, CanvasNodeData>,
		currentCanvasFile?: TFile,
		currentCanvasData?: CanvasData,
		remainingConnections?: Set<string>,
		generation = this.generation,
	): Promise<void> {
		const previous = snapshot ?? { edges: this.edgeSnapshot, nodes: this.nodeSnapshot };
		const connection = resolveConnection(edge, previous.nodes);
		if (!connection) return;

		const currentData =
			currentCanvasData ??
			({
				nodes: [...(currentNodes ?? previous.nodes).values()],
				edges: currentEdges,
			} satisfies CanvasData);
		const connectionIndex =
			remainingConnections ??
			(await this.buildConnectionIndex(currentCanvasFile, currentData, generation));
		if (!this.isCurrent(generation)) return;
		if (connectionIndex.has(connectionKey(connection))) return;

		const sourceFile = this.app.vault.getAbstractFileByPath(connection.from);
		const targetFile = this.app.vault.getAbstractFileByPath(connection.to);
		await this.applyConnectionMutation(connection, "remove", generation, sourceFile, targetFile);
	}

	private async applyConnectionMutation(
		connection: Connection,
		mode: "add" | "remove",
		generation: number,
		sourceCandidate = this.app.vault.getAbstractFileByPath(connection.from),
		targetCandidate = this.app.vault.getAbstractFileByPath(connection.to),
	): Promise<void> {
		if (!this.isCurrent(generation)) return;
		const repair: PendingConnectionRepair = {
			id: `${Date.now()}-${++this.nextRepairId}`,
			connection,
			mode,
			phase: "apply",
		};
		this.pendingRepairs.push(repair);
		await this.savePersistentState();
		const operations = this.connectionMutations(connection, mode, sourceCandidate, targetCandidate);

		const applied: ConnectionMutation[] = [];
		try {
			for (const operation of operations) {
				if (await operation.apply()) applied.push(operation);
			}
		} catch (error) {
			repair.phase = "rollback";
			await this.savePersistentState();
			await compensateMutations(applied, error);
			await this.completeRepair(repair);
			throw error;
		}
		if (this.isCurrent(generation)) {
			await this.completeRepair(repair);
			return;
		}
		repair.phase = "rollback";
		await this.savePersistentState();
		await compensateMutations(applied);
		await this.completeRepair(repair);
	}

	private connectionMutations(
		connection: Connection,
		mode: "add" | "remove",
		sourceCandidate = this.app.vault.getAbstractFileByPath(connection.from),
		targetCandidate = this.app.vault.getAbstractFileByPath(connection.to),
	): ConnectionMutation[] {
		const operations: ConnectionMutation[] = [];
		const append = (file: TFile, targetPath: string, direction: "->" | "<-") => {
			const targets = [linkTarget(targetPath)];
			if (mode === "remove") {
				const legacy = this.uniqueLegacyTarget(targetPath);
				if (legacy) targets.push(legacy);
			}
			for (const target of targets) {
				operations.push({
					apply: () =>
						this.backlinkWriter[mode === "add" ? "addConnection" : "removeConnection"](
							file,
							target,
							direction,
						),
					compensate: () =>
						this.backlinkWriter[mode === "add" ? "removeConnection" : "addConnection"](
							file,
							target,
							direction,
						),
				});
			}
		};
		if (targetCandidate instanceof TFile) append(targetCandidate, connection.from, "<-");
		if (sourceCandidate instanceof TFile) append(sourceCandidate, connection.to, "->");
		return operations;
	}

	private uniqueLegacyTarget(path: string): string | null {
		const canonicalTarget = linkTarget(path);
		const basename = canonicalTarget.slice(canonicalTarget.lastIndexOf("/") + 1);
		if (basename === canonicalTarget) return null;

		const matches = this.app.vault.getMarkdownFiles().filter((file) => file.basename === basename);
		return matches.length === 1 && matches[0]?.path === path ? basename : null;
	}

	private async buildConnectionIndex(
		currentCanvasFile: TFile | undefined,
		currentCanvasData: CanvasData,
		generation = this.generation,
		excludedPath?: string,
	): Promise<Set<string>> {
		const connections = canvasConnections(currentCanvasData);
		const canvasFiles = this.app.vault
			.getFiles()
			.filter(
				(file) =>
					file.path.endsWith(".canvas") &&
					file.path !== currentCanvasFile?.path &&
					file.path !== excludedPath,
			);
		const indexed = await mapConcurrent(
			canvasFiles,
			CANVAS_READ_CONCURRENCY,
			async (canvasFile) => {
				if (!this.isCurrent(generation)) return null;
				const data = parseCanvasData(await this.app.vault.read(canvasFile));
				if (!this.isCurrent(generation)) return null;
				if (!data) throw new Error(`Cannot index Canvas file: ${canvasFile.path}`);
				return canvasConnections(data);
			},
			() => !this.isCurrent(generation),
		);
		if (!this.isCurrent(generation)) return connections;
		for (const indexedConnections of indexed) {
			if (!indexedConnections) continue;
			for (const connection of indexedConnections) connections.add(connection);
		}
		return connections;
	}

	private async connectionsAfterUpdate(
		currentCanvasFile: TFile,
		currentCanvasData: CanvasData,
		generation: number,
	): Promise<Set<string>> {
		if (!this.indexComplete) {
			return this.buildConnectionIndex(currentCanvasFile, currentCanvasData, generation);
		}
		const connections = canvasConnections(currentCanvasData);
		for (const [key, canvases] of this.connectionCanvases) {
			if ([...canvases].some((path) => path !== currentCanvasFile.path)) connections.add(key);
		}
		return connections;
	}

	async initializeFromVault(): Promise<void> {
		await this.enqueue(async (generation) => {
			await this.refreshVaultIndex(generation, true);
		});
	}

	async initializeFromCanvas(canvasFile: TFile): Promise<void> {
		await this.enqueue(async (generation) => {
			const canvasData = parseCanvasData(await this.app.vault.read(canvasFile));
			if (!canvasData || !this.isCurrent(generation)) return;

			this.setSnapshot(canvasData.edges, new Map(canvasData.nodes.map((node) => [node.id, node])));
			this.replaceSnapshot(canvasFile.path, createSnapshot(canvasData));
		});
	}

	async onCanvasDeleted(path: string): Promise<void> {
		await this.enqueue(async (generation) => {
			this.unreadableCanvasPaths.delete(path);
			const snapshot = this.canvasSnapshots.get(path);
			if (!snapshot) {
				if (!this.indexComplete) await this.refreshVaultIndex(generation);
				return;
			}
			const connections = snapshotConnections(snapshot);
			if (!this.isCurrent(generation)) return;
			if (connections.length === 0) {
				this.removeSnapshot(path);
				return;
			}
			this.mergePendingDeletion(path, snapshotFingerprint(snapshot), connections);
			await this.savePersistentState();
			if (!this.isCurrent(generation)) return;
			this.removeSnapshot(path);
			if (!this.indexComplete) await this.refreshVaultIndex(generation);
			await this.retryPendingDeletionCleanups(generation);
		});
	}

	async renameCanvas(oldPath: string, newPath: string): Promise<void> {
		await this.enqueue(async () => {
			if (this.unreadableCanvasPaths.delete(oldPath)) {
				this.unreadableCanvasPaths.add(newPath);
			}
			const snapshot = this.canvasSnapshots.get(oldPath);
			if (!snapshot) return;
			this.removeSnapshot(oldPath);
			this.replaceSnapshot(newPath, snapshot);
		});
	}

	setSnapshot(edges: CanvasEdgeData[], nodeMap: Map<string, CanvasNodeData>): void {
		this.edgeSnapshot = new Map(edges.map((edge) => [edge.id, edge]));
		this.nodeSnapshot = nodeMap;
	}

	reset(): void {
		this.generation += 1;
		this.canvasSnapshots = new Map();
		this.connectionCanvases = new Map();
		this.indexComplete = false;
		this.unreadableCanvasPaths = new Set();
		this.edgeSnapshot = new Map();
		this.nodeSnapshot = new Map();
	}

	private markCanvasUnreadable(path: string): void {
		this.unreadableCanvasPaths.add(path);
		this.indexComplete = false;
	}

	private deferRemovedEdges(
		canvasPath: string,
		snapshot: CanvasSnapshot,
		removedEdges: CanvasEdgeData[],
	): void {
		const connections = new Map<string, Connection>();
		for (const edge of removedEdges) {
			const connection = resolveConnection(edge, snapshot.nodes);
			if (connection) connections.set(connectionKey(connection), connection);
		}
		if (connections.size > 0) {
			this.mergePendingDeletion(canvasPath, snapshotFingerprint(snapshot), [
				...connections.values(),
			]);
		}
	}

	private async refreshVaultIndex(
		generation: number,
		acceptPartial = false,
		current?: { path: string; data: CanvasData },
	): Promise<boolean> {
		const snapshots = new Map<string, CanvasSnapshot>();
		const unreadable = new Set<string>();
		const canvasFiles = this.app.vault.getFiles().filter((file) => file.path.endsWith(".canvas"));
		const scanned = await mapConcurrent(
			canvasFiles,
			CANVAS_READ_CONCURRENCY,
			async (file): Promise<{ file: TFile; snapshot: CanvasSnapshot | null }> => {
				if (file.path === current?.path) {
					return { file, snapshot: createSnapshot(current.data) };
				}
				try {
					const data = parseCanvasData(await this.app.vault.read(file));
					return { file, snapshot: data ? createSnapshot(data) : null };
				} catch {
					return { file, snapshot: null };
				}
			},
			() => !this.isCurrent(generation),
		);
		if (!this.isCurrent(generation)) return false;
		for (const { file, snapshot } of scanned) {
			if (snapshot) snapshots.set(file.path, snapshot);
			else unreadable.add(file.path);
		}
		this.unreadableCanvasPaths = unreadable;
		this.indexComplete = unreadable.size === 0;
		if (this.indexComplete || acceptPartial) {
			for (const path of unreadable) {
				const previous = this.canvasSnapshots.get(path);
				if (previous) snapshots.set(path, previous);
			}
			this.canvasSnapshots = snapshots;
			this.rebuildConnectionIndex();
		}
		return this.indexComplete;
	}

	private mergePendingDeletion(
		canvasPath: string,
		fingerprint: string,
		connections: Connection[],
	): void {
		const existing = this.pendingDeletions.find((pending) => pending.canvasPath === canvasPath);
		if (!existing) {
			this.pendingDeletions.push({ canvasPath, fingerprint, connections });
			return;
		}
		existing.fingerprint = fingerprint;
		const byKey = new Map(
			existing.connections.map((connection) => [connectionKey(connection), connection]),
		);
		for (const connection of connections) byKey.set(connectionKey(connection), connection);
		existing.connections = [...byKey.values()];
	}

	private async retryPendingDeletionCleanups(generation: number): Promise<void> {
		if (!this.indexComplete || !this.isCurrent(generation) || this.pendingDeletions.length === 0)
			return;
		await this.savePersistentState();
		if (!this.isCurrent(generation)) return;
		for (const pending of this.pendingDeletions.slice()) {
			const liveSnapshot = this.canvasSnapshots.get(pending.canvasPath);
			const liveConnections = liveSnapshot
				? new Set(snapshotConnections(liveSnapshot).map(connectionKey))
				: new Set<string>();
			for (const connection of pending.connections.slice()) {
				if (!this.isCurrent(generation)) return;
				if (liveConnections.has(connectionKey(connection))) {
					await this.completePendingDeletionConnection(pending, connection);
					continue;
				}
				const canvases = this.connectionCanvases.get(connectionKey(connection));
				if (!canvases?.size) await this.applyConnectionMutation(connection, "remove", generation);
				if (!this.isCurrent(generation)) return;
				await this.completePendingDeletionConnection(pending, connection);
			}
		}
	}

	private async completePendingDeletionConnection(
		pending: PendingCanvasDeletion,
		connection: Connection,
	): Promise<void> {
		const previous = this.pendingDeletionSnapshot();
		pending.connections = pending.connections.filter(
			(candidate) => connectionKey(candidate) !== connectionKey(connection),
		);
		if (pending.connections.length === 0) {
			this.pendingDeletions = this.pendingDeletions.filter((candidate) => candidate !== pending);
		}
		try {
			await this.savePersistentState();
		} catch (error) {
			this.pendingDeletions = previous;
			throw error;
		}
	}

	private async retryPendingRepairs(): Promise<void> {
		for (const repair of this.pendingRepairs.slice()) {
			const mode = repair.phase === "apply" ? repair.mode : inverseMode(repair.mode);
			for (const operation of this.connectionMutations(repair.connection, mode)) {
				await operation.apply();
			}
			await this.completeRepair(repair);
		}
	}

	private async completeRepair(repair: PendingConnectionRepair): Promise<void> {
		const index = this.pendingRepairs.findIndex((candidate) => candidate.id === repair.id);
		if (index < 0) return;
		this.pendingRepairs.splice(index, 1);
		try {
			await this.savePersistentState();
		} catch (error) {
			this.pendingRepairs.splice(index, 0, repair);
			throw error;
		}
	}

	private async savePersistentState(): Promise<void> {
		await this.persistState({
			pendingDeletions: this.pendingDeletionSnapshot(),
			pendingRepairs: this.pendingRepairSnapshot(),
		});
	}

	private replaceSnapshot(path: string, snapshot: CanvasSnapshot): void {
		this.removeSnapshot(path);
		this.canvasSnapshots.set(path, snapshot);
		for (const connection of snapshotConnections(snapshot)) {
			const key = connectionKey(connection);
			const canvases = this.connectionCanvases.get(key) ?? new Set<string>();
			canvases.add(path);
			this.connectionCanvases.set(key, canvases);
		}
	}

	private removeSnapshot(path: string): void {
		const snapshot = this.canvasSnapshots.get(path);
		if (!snapshot) return;
		for (const connection of snapshotConnections(snapshot)) {
			const key = connectionKey(connection);
			const canvases = this.connectionCanvases.get(key);
			canvases?.delete(path);
			if (canvases?.size === 0) this.connectionCanvases.delete(key);
		}
		this.canvasSnapshots.delete(path);
	}

	private rebuildConnectionIndex(): void {
		this.connectionCanvases = new Map();
		for (const [path, snapshot] of this.canvasSnapshots) {
			for (const connection of snapshotConnections(snapshot)) {
				const key = connectionKey(connection);
				const canvases = this.connectionCanvases.get(key) ?? new Set<string>();
				canvases.add(path);
				this.connectionCanvases.set(key, canvases);
			}
		}
	}

	private enqueue(operation: (generation: number) => Promise<void>): Promise<void> {
		const generation = this.generation;
		const current = this.modificationQueue
			.catch(() => undefined)
			.then(async () => {
				if (!this.isCurrent(generation)) return;
				await this.retryPendingRepairs();
				await operation(generation);
				await this.retryPendingDeletionCleanups(generation);
			});
		this.modificationQueue = current;
		return current;
	}

	private isCurrent(generation: number): boolean {
		return generation === this.generation;
	}
}

async function mapConcurrent<T, R>(
	items: readonly T[],
	limit: number,
	map: (item: T) => Promise<R>,
	shouldStop: () => boolean = () => false,
): Promise<R[]> {
	const results: R[] = [];
	let nextIndex = 0;
	const worker = async (): Promise<void> => {
		while (!shouldStop()) {
			const index = nextIndex++;
			const item = items[index];
			if (item === undefined) return;
			results[index] = await map(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => worker()));
	return results;
}

interface CanvasSnapshot {
	edges: Map<string, CanvasEdgeData>;
	nodes: Map<string, CanvasNodeData>;
}

export interface Connection {
	from: string;
	to: string;
}

export interface PendingCanvasDeletion {
	canvasPath: string;
	fingerprint: string;
	connections: Connection[];
}

export interface PendingConnectionRepair {
	id: string;
	connection: Connection;
	mode: "add" | "remove";
	phase: "apply" | "rollback";
}

export interface EdgeSyncPersistentState {
	pendingDeletions: PendingCanvasDeletion[];
	pendingRepairs: PendingConnectionRepair[];
}

interface ConnectionMutation {
	apply: () => Promise<boolean>;
	compensate: () => Promise<boolean>;
}

const EMPTY_SNAPSHOT: CanvasSnapshot = { edges: new Map(), nodes: new Map() };

function createSnapshot(data: CanvasData): CanvasSnapshot {
	return {
		edges: new Map(data.edges.map((edge) => [edge.id, edge])),
		nodes: new Map(data.nodes.map((node) => [node.id, node])),
	};
}

function parseCanvasData(raw: string): CanvasData | null {
	try {
		const data = JSON.parse(raw) as CanvasData;
		return Array.isArray(data?.edges) && Array.isArray(data?.nodes) ? data : null;
	} catch {
		return null;
	}
}

function resolveConnection(
	edge: CanvasEdgeData,
	nodes: Map<string, CanvasNodeData>,
): Connection | null {
	const from = nodes.get(edge.fromNode)?.file;
	const to = nodes.get(edge.toNode)?.file;
	return from && to ? { from, to } : null;
}

function sameConnection(
	previousEdge: CanvasEdgeData,
	previousNodes: Map<string, CanvasNodeData>,
	currentEdge: CanvasEdgeData,
	currentNodes: Map<string, CanvasNodeData>,
): boolean {
	const previous = resolveConnection(previousEdge, previousNodes);
	const current = resolveConnection(currentEdge, currentNodes);
	if (previous || current) {
		return previous?.from === current?.from && previous?.to === current?.to;
	}
	return (
		previousEdge.fromNode === currentEdge.fromNode && previousEdge.toNode === currentEdge.toNode
	);
}

function canvasConnections(data: CanvasData): Set<string> {
	const nodes = new Map(data.nodes.map((node) => [node.id, node]));
	const connections = new Set<string>();
	for (const edge of data.edges) {
		const candidate = resolveConnection(edge, nodes);
		if (candidate) connections.add(connectionKey(candidate));
	}
	return connections;
}

function snapshotConnections(snapshot: CanvasSnapshot): Connection[] {
	const connections = new Map<string, Connection>();
	for (const edge of snapshot.edges.values()) {
		const connection = resolveConnection(edge, snapshot.nodes);
		if (connection) connections.set(connectionKey(connection), connection);
	}
	return [...connections.values()];
}

function snapshotFingerprint(snapshot: CanvasSnapshot): string {
	return JSON.stringify({
		edges: [...snapshot.edges.values()].toSorted((left, right) => left.id.localeCompare(right.id)),
		nodes: [...snapshot.nodes.values()].toSorted((left, right) => left.id.localeCompare(right.id)),
	});
}

function inverseMode(mode: "add" | "remove"): "add" | "remove" {
	return mode === "add" ? "remove" : "add";
}

async function compensateMutations(
	mutations: ConnectionMutation[],
	cause?: unknown,
): Promise<void> {
	const failures: unknown[] = [];
	for (const mutation of mutations.toReversed()) {
		try {
			await mutation.compensate();
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length) {
		throw new AggregateError(
			cause === undefined ? failures : [cause, ...failures],
			"Edge backlink compensation failed",
		);
	}
}

function connectionKey(connection: Connection): string {
	return JSON.stringify([connection.from, connection.to]);
}

function linkTarget(path: string): string {
	return path.replace(/\.md$/i, "");
}
