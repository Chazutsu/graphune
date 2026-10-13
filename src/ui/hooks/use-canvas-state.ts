import { CanvasObserver } from "@/services/canvas-observer";
import type { CanvasNode, CanvasView } from "@/types/obsidian-canvas";
import { useApp } from "@/ui/hooks/use-app";
import { TFile } from "obsidian";
import type React from "react";
import {
	createContext,
	createElement,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

export interface ActiveCanvasState {
	canvasView: CanvasView | null;
	selectedNodes: CanvasNode[];
	inCanvasPaths: ReadonlySet<string>;
	selectedPaths: ReadonlySet<string>;
}

// Canvas does not expose a stable public selection event. Poll only the cheap mutable selection
// surface, and progressively back off while it is idle. Structural events still force a snapshot.
const MIN_POLL_INTERVAL = 250;
const MAX_POLL_INTERVAL = 2_000;
const EMPTY_STATE: ActiveCanvasState = {
	canvasView: null,
	selectedNodes: [],
	inCanvasPaths: new Set(),
	selectedPaths: new Set(),
};
const CanvasStateContext = createContext<ActiveCanvasState | null>(null);

export function CanvasStateProvider({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	const state = useCanvasState();
	return createElement(CanvasStateContext.Provider, { value: state }, children);
}

export function useActiveCanvasState(): ActiveCanvasState {
	const state = useContext(CanvasStateContext);
	if (!state) throw new Error("useActiveCanvasState must be used within CanvasStateProvider");
	return state;
}

export function useCanvasState(): ActiveCanvasState {
	const { app, canvasObserver: sharedCanvasObserver } = useApp();
	const observer = useMemo(
		() => sharedCanvasObserver ?? new CanvasObserver(app),
		[app, sharedCanvasObserver],
	);
	const [state, setState] = useState<ActiveCanvasState>(() => readState(observer));
	const previousViewRef = useRef(state.canvasView);
	const selectionSignatureRef = useRef(createSelectionSignature(state.canvasView));

	const poll = useCallback(
		(force = false): boolean => {
			const canvasView = observer.getActiveCanvasView();
			const selectionSignature = createSelectionSignature(canvasView);
			if (
				!force &&
				previousViewRef.current === canvasView &&
				selectionSignatureRef.current === selectionSignature
			) {
				return false;
			}
			const next = readState(observer, canvasView);
			previousViewRef.current = next.canvasView;
			selectionSignatureRef.current = selectionSignature;
			setState(next);
			return true;
		},
		[observer],
	);

	useEffect(() => {
		poll();
		let timeout: number | null = null;
		let delay = MIN_POLL_INTERVAL;
		const stopPolling = (): void => {
			if (timeout === null) return;
			window.clearTimeout(timeout);
			timeout = null;
		};
		const schedulePoll = (): void => {
			if (document.hidden || timeout !== null) return;
			timeout = window.setTimeout(() => {
				timeout = null;
				const changed = poll();
				delay = changed ? MIN_POLL_INTERVAL : Math.min(delay * 2, MAX_POLL_INTERVAL);
				schedulePoll();
			}, delay);
		};
		const refreshImmediately = (): void => {
			delay = MIN_POLL_INTERVAL;
			poll(true);
		};
		const handleInteraction = (): void => {
			delay = MIN_POLL_INTERVAL;
			poll();
		};
		const handleVisibilityChange = (): void => {
			if (document.hidden) stopPolling();
			else {
				refreshImmediately();
				schedulePoll();
			}
		};
		const activeLeafRef = app.workspace.on("active-leaf-change", refreshImmediately);
		const layoutRef = app.workspace.on("layout-change", refreshImmediately);
		const modifyRef = app.vault.on("modify", (file) => {
			if (file instanceof TFile && file.extension === "canvas") refreshImmediately();
		});
		document.addEventListener("visibilitychange", handleVisibilityChange);
		document.addEventListener("pointerup", handleInteraction);
		document.addEventListener("keyup", handleInteraction);
		schedulePoll();
		return () => {
			stopPolling();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			document.removeEventListener("pointerup", handleInteraction);
			document.removeEventListener("keyup", handleInteraction);
			app.workspace.offref(activeLeafRef);
			app.workspace.offref(layoutRef);
			app.vault.offref(modifyRef);
		};
	}, [app.vault, app.workspace, poll]);

	return state;
}

function readState(
	observer: CanvasObserver,
	canvasView = observer.getActiveCanvasView(),
): ActiveCanvasState {
	if (!canvasView) return EMPTY_STATE;

	const nodes = canvasView.canvas.getData().nodes ?? [];
	const filePathByNodeId = new Map(
		nodes
			.filter((node) => node.type === "file" && node.file)
			.map((node) => [node.id, node.file!] as const),
	);
	const selectedNodes = Array.from(canvasView.canvas.selection ?? []);
	return {
		canvasView,
		selectedNodes,
		inCanvasPaths: new Set(filePathByNodeId.values()),
		selectedPaths: new Set(
			selectedNodes
				.map((node) => node.file?.path ?? filePathByNodeId.get(node.id))
				.filter((path): path is string => Boolean(path)),
		),
	};
}

function createSelectionSignature(canvasView: CanvasView | null): string {
	if (!canvasView) return "";
	return Array.from(canvasView.canvas.selection ?? [])
		.map(
			(node) =>
				`${node.id}:${node.x}:${node.y}:${node.width}:${node.height}:${node.file?.path ?? ""}`,
		)
		.toSorted()
		.join("\u0000");
}
