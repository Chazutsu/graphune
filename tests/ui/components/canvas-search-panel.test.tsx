import { CanvasSearchPanel } from "@/ui/components/canvas-search-panel";
import type { CanvasData, CanvasNode } from "@/types/obsidian-canvas";
import { CanvasStateProvider } from "@/ui/hooks/use-canvas-state";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { App, TFile } from "obsidian";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createMockCanvasView } from "../../helpers/create-mock-canvas-view";
import { createWrapper } from "../../helpers/create-wrapper";

function renderPanel(app: App): ReturnType<typeof render> {
	const Wrapper = createWrapper(app);
	return render(
		<Wrapper>
			<CanvasStateProvider>
				<CanvasSearchPanel />
			</CanvasStateProvider>
		</Wrapper>,
	);
}

describe("CanvasSearchPanel", () => {
	it("shows the selected card's connections, nearby cards, and placement status together", async () => {
		const app = new App();
		const selectedFile = new TFile("notes/Selected.md");
		const selectedNode: CanvasNode = {
			id: "selected",
			x: 0,
			y: 0,
			width: 200,
			height: 120,
			file: selectedFile,
		};
		const connectedRuntime: CanvasNode = {
			id: "connected",
			x: 260,
			y: 0,
			width: 200,
			height: 120,
		};
		const canvasView = createMockCanvasView([selectedNode]);
		canvasView.canvas.getData = vi.fn().mockReturnValue({
			nodes: [
				{ ...selectedNode, type: "file", file: selectedFile.path },
				{ ...connectedRuntime, type: "text", text: "Connected idea" },
				{ id: "nearby", type: "text", text: "Nearby idea", x: 30, y: 220, width: 200, height: 120 },
			],
			edges: [{ id: "edge", fromNode: "selected", toNode: "connected" }],
		});
		canvasView.canvas.nodes = new Map([[connectedRuntime.id, connectedRuntime]]);
		canvasView.canvas.selectOnly = vi.fn();
		canvasView.canvas.zoomToSelection = vi.fn();
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);
		app.vault.getAbstractFileByPath = vi.fn((path: string) =>
			path === selectedFile.path ? selectedFile : null,
		);
		app.vault.getFiles = vi.fn().mockReturnValue([selectedFile]);

		renderPanel(app);
		await act(async () => {
			await Promise.resolve();
		});

		const contextPanel = screen.getByLabelText("Selected card context");
		expect(within(contextPanel).getByRole("heading", { name: "Selected" })).toBeDefined();
		expect(within(contextPanel).getByText("On this Canvas")).toBeDefined();
		expect(within(contextPanel).getByText("Connected idea")).toBeDefined();
		expect(within(contextPanel).getByText("Nearby idea")).toBeDefined();

		fireEvent.click(within(contextPanel).getByText("Connected idea"));
		expect(canvasView.canvas.selectOnly).toHaveBeenCalledWith(connectedRuntime);
		expect(canvasView.canvas.zoomToSelection).toHaveBeenCalled();
		expect(screen.getByText("Backlinks")).toBeDefined();
	});

	it("arranges the current Canvas selection from the layout toolbar", () => {
		const app = new App();
		const selectedNodes: CanvasNode[] = [
			{ id: "a", x: 40, y: 20, width: 100, height: 80 },
			{ id: "b", x: 240, y: 100, width: 100, height: 80 },
		];
		const canvasView = createMockCanvasView(selectedNodes);
		let canvasData: CanvasData = {
			nodes: [
				{ ...selectedNodes[0], type: "text", text: "A" },
				{ ...selectedNodes[1], type: "text", text: "B" },
			],
			edges: [],
		};
		canvasView.canvas.getData = vi.fn(() => canvasData);
		canvasView.canvas.setData = vi.fn((next) => {
			canvasData = next;
		});
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

		renderPanel(app);
		fireEvent.click(screen.getByRole("button", { name: "Align left" }));

		const arranged = vi.mocked(canvasView.canvas.setData).mock.calls[0][0];
		expect(arranged.nodes.map((node) => node.x)).toEqual([40, 40]);
		expect(screen.getByText("2 selected")).toBeDefined();
		expect(
			screen.getByText(
				"Connect, align, and Section are available. Select one more card to distribute.",
			),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Distribute horizontally" }).hasAttribute("disabled"),
		).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: "Connect selected nodes" }));
		const connected = vi.mocked(canvasView.canvas.setData).mock.calls[1][0];
		expect(connected.edges).toHaveLength(1);

		const undoButton = screen.getByRole("button", { name: "Undo last Canvas change" });
		expect(undoButton.hasAttribute("disabled")).toBe(false);
		fireEvent.click(undoButton);
		expect(vi.mocked(canvasView.canvas.setData)).toHaveBeenCalledTimes(3);
		expect(
			screen.getByRole("button", { name: "Redo last Canvas change" }).hasAttribute("disabled"),
		).toBe(false);
	}, 10_000);

	it("distills two materials into a connected note and replaces them on Canvas", async () => {
		const app = new App();
		const sourceFile = new TFile("Clippings/Source.md");
		const contextFile = new TFile("Knowledge/Context.md");
		const distilledFile = new TFile("Distilled insight.md");
		const selectedNodes: CanvasNode[] = [
			{ id: "source", x: 0, y: 0, width: 200, height: 100, file: sourceFile },
			{ id: "observation", x: 240, y: 0, width: 200, height: 100 },
		];
		const canvasView = createMockCanvasView(selectedNodes);
		let canvasData: CanvasData = {
			nodes: [
				{ ...selectedNodes[0], type: "file", file: sourceFile.path, subpath: "#Evidence" },
				{ ...selectedNodes[1], type: "text", text: "Daily observation" },
			],
			edges: [],
		};
		canvasView.canvas.getData = vi.fn(() => canvasData);
		canvasView.canvas.setData = vi.fn((next) => {
			canvasData = next;
		});
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);
		app.vault.getMarkdownFiles = vi.fn().mockReturnValue([sourceFile, contextFile]);
		app.vault.getFiles = vi.fn().mockReturnValue([sourceFile, contextFile]);
		app.vault.getAbstractFileByPath = vi.fn((path: string) =>
			path === sourceFile.path ? sourceFile : null,
		);
		let noteCreated = false;
		app.vault.create = vi.fn((path: string) => {
			if (path === ".graphune/recovery/editor-drafts.json") {
				return noteCreated
					? Promise.reject(new Error("draft cleanup unavailable"))
					: Promise.resolve(new TFile(path));
			}
			noteCreated = true;
			return Promise.resolve(distilledFile);
		});

		renderPanel(app);
		fireEvent.click(screen.getByRole("button", { name: "Distill" }));
		const dialog = screen.getByRole("dialog", { name: "Create a connected note" });
		expect(within(dialog).getByText("Source")).toBeDefined();
		expect(within(dialog).getByText("Daily observation")).toBeDefined();
		fireEvent.change(within(dialog).getByLabelText("Note title"), {
			target: { value: "Distilled insight" },
		});
		fireEvent.change(within(dialog).getByLabelText("Claim in your own words"), {
			target: { value: "A claim that stands alone." },
		});
		fireEvent.change(within(dialog).getByLabelText("Existing context"), {
			target: { value: contextFile.path },
		});
		fireEvent.change(within(dialog).getByLabelText("Why are they related?"), {
			target: { value: "Extends the context model" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Create and replace materials" }));

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(app.vault.create).toHaveBeenCalled();
		expect(canvasData.nodes).toEqual([
			expect.objectContaining({ type: "file", file: distilledFile.path }),
		]);
		// Recovery cleanup failed, but the already-created note remains a successful operation.
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("freezes selected materials and restores an unfinished draft for the same selection", async () => {
		const app = new App();
		const contextFile = new TFile("Knowledge/Context.md");
		const firstSelection: CanvasNode[] = [
			{ id: "first", x: 0, y: 0, width: 200, height: 100 },
			{ id: "second", x: 240, y: 0, width: 200, height: 100 },
		];
		const replacementSelection: CanvasNode[] = [
			{ id: "third", x: 0, y: 160, width: 200, height: 100 },
			{ id: "fourth", x: 240, y: 160, width: 200, height: 100 },
		];
		const canvasView = createMockCanvasView(firstSelection);
		canvasView.canvas.getData = vi.fn().mockReturnValue({
			nodes: [
				{ ...firstSelection[0], type: "text", text: "Frozen source A" },
				{ ...firstSelection[1], type: "text", text: "Frozen source B" },
				{ ...replacementSelection[0], type: "text", text: "Later source C" },
				{ ...replacementSelection[1], type: "text", text: "Later source D" },
			],
			edges: [],
		});
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);
		app.vault.getMarkdownFiles = vi.fn().mockReturnValue([contextFile]);
		app.vault.getFiles = vi.fn().mockReturnValue([contextFile]);

		let journalFile: TFile | null = null;
		let journalRaw = "";
		app.vault.getAbstractFileByPath = vi.fn((path: string) =>
			path === ".graphune/recovery/editor-drafts.json" ? journalFile : null,
		);
		app.vault.create = vi.fn(async (path: string, value: string) => {
			const file = new TFile(path);
			if (path === ".graphune/recovery/editor-drafts.json") {
				journalFile = file;
				journalRaw = value;
			}
			return file;
		});
		app.vault.cachedRead = vi.fn(async () => journalRaw);
		app.vault.process = vi.fn(async (_file, transform) => {
			journalRaw = transform(journalRaw);
		});

		renderPanel(app);
		fireEvent.click(screen.getByRole("button", { name: "Distill" }));
		let dialog = screen.getByRole("dialog", { name: "Create a connected note" });
		expect(within(dialog).getByText("Frozen source A")).toBeDefined();

		canvasView.canvas.selection = new Set(replacementSelection);
		fireEvent.pointerUp(document);
		expect(within(dialog).getByText("Frozen source A")).toBeDefined();
		expect(within(dialog).queryByText("Later source C")).toBeNull();

		fireEvent.change(within(dialog).getByLabelText("Note title"), {
			target: { value: "Recovered title" },
		});
		fireEvent.change(within(dialog).getByLabelText("Claim in your own words"), {
			target: { value: "Recovered body" },
		});
		fireEvent.change(within(dialog).getByLabelText("Existing context"), {
			target: { value: contextFile.path },
		});
		fireEvent.change(within(dialog).getByLabelText("Why are they related?"), {
			target: { value: "Recovered reason" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

		canvasView.canvas.selection = new Set(firstSelection);
		fireEvent.pointerUp(document);
		fireEvent.click(screen.getByRole("button", { name: "Distill" }));
		dialog = await screen.findByRole("dialog", { name: "Create a connected note" });
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		expect((within(dialog).getByLabelText("Note title") as HTMLInputElement).value).toBe(
			"Recovered title",
		);
		expect(
			(within(dialog).getByLabelText("Claim in your own words") as HTMLTextAreaElement).value,
		).toBe("Recovered body");
		expect((within(dialog).getByLabelText("Existing context") as HTMLSelectElement).value).toBe(
			contextFile.path,
		);
		expect((within(dialog).getByLabelText("Why are they related?") as HTMLInputElement).value).toBe(
			"Recovered reason",
		);
	});

	it("moves selection actions next to Canvas cards when their elements are available", () => {
		const app = new App();
		const nodeEl = document.createElement("div");
		nodeEl.getBoundingClientRect = vi.fn().mockReturnValue({
			left: 100,
			right: 300,
			top: 120,
			bottom: 220,
			width: 200,
			height: 100,
			x: 100,
			y: 120,
			toJSON: () => ({}),
		});
		const selectedNode: CanvasNode = {
			id: "a",
			x: 0,
			y: 0,
			width: 200,
			height: 100,
			nodeEl,
		};
		const canvasView = createMockCanvasView([selectedNode]);
		canvasView.canvas.getData = vi.fn().mockReturnValue({
			nodes: [{ ...selectedNode, type: "text", text: "A" }],
			edges: [],
		});
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

		renderPanel(app);

		const floating = screen.getByTestId("canvas-selection-toolbar");
		expect(floating.style.left).toBe("200px");
		expect(within(floating).getByRole("button", { name: "Align left" })).toBeDefined();
		expect(
			within(floating).getByRole("button", { name: "Create a Section from selected nodes" }),
		).toBeDefined();
		const panel = document.querySelector(".canvas-panel");
		expect(within(panel as HTMLElement).queryByRole("button", { name: "Align left" })).toBeNull();
		expect(
			within(panel as HTMLElement).getByRole("button", { name: "Undo last Canvas change" }),
		).toBeDefined();
	});

	it("keeps selection actions in the sidebar when a Canvas node is not visibly laid out", () => {
		const app = new App();
		const selectedNode: CanvasNode = {
			id: "a",
			x: 0,
			y: 0,
			width: 200,
			height: 100,
			nodeEl: document.createElement("div"),
		};
		const canvasView = createMockCanvasView([selectedNode]);
		canvasView.canvas.getData = vi.fn().mockReturnValue({
			nodes: [{ ...selectedNode, type: "text", text: "A" }],
			edges: [],
		});
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

		renderPanel(app);

		expect(screen.queryByTestId("canvas-selection-toolbar")).toBeNull();
		expect(screen.getByRole("button", { name: "Align left" })).toBeDefined();
	});

	it("anchors selection actions to Obsidian's Canvas DOM when runtime nodes hide their element", () => {
		const app = new App();
		const canvasNode = document.createElement("div");
		canvasNode.className = "canvas-node";
		canvasNode.dataset.nodeId = "a";
		canvasNode.getBoundingClientRect = vi.fn().mockReturnValue({
			left: 80,
			right: 280,
			top: 140,
			bottom: 240,
			width: 200,
			height: 100,
			x: 80,
			y: 140,
			toJSON: () => ({}),
		});
		document.body.appendChild(canvasNode);
		const selectedNode: CanvasNode = { id: "a", x: 0, y: 0, width: 200, height: 100 };
		const canvasView = createMockCanvasView([selectedNode]);
		canvasView.canvas.getData = vi.fn().mockReturnValue({
			nodes: [{ ...selectedNode, type: "text", text: "A" }],
			edges: [],
		});
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

		renderPanel(app);

		expect(screen.getByTestId("canvas-selection-toolbar").style.left).toBe("180px");
		canvasNode.remove();
	});

	it("searches the active Canvas and focuses a selected result", () => {
		const app = new App();
		const canvasView = createMockCanvasView();
		const runtimeNode: CanvasNode = {
			id: "research-card",
			x: 0,
			y: 0,
			width: 400,
			height: 300,
		};
		canvasView.canvas.getData = vi.fn().mockReturnValue({
			nodes: [
				{
					id: runtimeNode.id,
					type: "file",
					file: "notes/Research question.md",
					x: 0,
					y: 0,
					width: 400,
					height: 300,
				},
			],
			edges: [],
		});
		canvasView.canvas.nodes = new Map([[runtimeNode.id, runtimeNode]]);
		canvasView.canvas.selectOnly = vi.fn();
		canvasView.canvas.zoomToSelection = vi.fn();
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

		renderPanel(app);

		fireEvent.change(screen.getByPlaceholderText("Search this Canvas..."), {
			target: { value: "research" },
		});
		const results = document.querySelector(".canvas-panel__results");
		expect(results).not.toBeNull();
		fireEvent.click(within(results as HTMLElement).getByText("Research question"));

		expect(canvasView.canvas.selectOnly).toHaveBeenCalledWith(runtimeNode);
		expect(canvasView.canvas.zoomToSelection).toHaveBeenCalled();
	});

	it("clears the Canvas search without disturbing the active Canvas", () => {
		const app = new App();
		const canvasView = createMockCanvasView();
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

		renderPanel(app);
		const searchInput = screen.getByPlaceholderText("Search this Canvas...");
		fireEvent.change(searchInput, { target: { value: "research" } });
		fireEvent.click(screen.getByRole("button", { name: "Clear Canvas search" }));

		expect((searchInput as HTMLInputElement).value).toBe("");
	});

	it("reveals the first-connection guide progressively from Canvas state", () => {
		const app = new App();
		const canvasView = createMockCanvasView();
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

		const { unmount } = renderPanel(app);
		expect(screen.getByLabelText("First connection guide")).toBeDefined();
		expect(screen.getAllByText("Find a heading in Library")).toHaveLength(2);
		const steps = screen.getByText("Show all 3 steps").closest("details");
		expect(steps?.hasAttribute("open")).toBe(false);

		fireEvent.click(screen.getByText("Show all 3 steps"));
		expect(steps?.hasAttribute("open")).toBe(true);
		expect(screen.getByText("Add the heading to Canvas")).toBeDefined();

		canvasView.canvas.getData = vi.fn().mockReturnValue({
			nodes: [{ id: "a", type: "text", text: "A", x: 0, y: 0, width: 200, height: 100 }],
			edges: [{ id: "edge", fromNode: "a", toNode: "b" }],
		});
		unmount();
		renderPanel(app);
		expect(screen.queryByLabelText("First connection guide")).toBeNull();
	});

	it("collapses selection-only tools until a card is selected", () => {
		const app = new App();
		const canvasView = createMockCanvasView();
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

		renderPanel(app);

		expect(screen.queryByRole("button", { name: "Align left" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Connect selected nodes" })).toBeNull();
		expect(screen.getByRole("button", { name: "Undo last Canvas change" })).toBeDefined();
	});

	it("guides the user when no Canvas is open", () => {
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);

		renderPanel(app);

		expect(screen.getByText("No Canvas is open")).toBeDefined();
		expect(
			screen.getByText("Open an existing Canvas to search and arrange its nodes."),
		).toBeDefined();
		const primaryAction = screen.getByRole("button", { name: "Open Canvas" });
		expect(primaryAction.hasAttribute("disabled")).toBe(true);
		expect(primaryAction.classList.contains("mod-cta")).toBe(true);
		expect(screen.getByRole("button", { name: "New Canvas" })).toBeDefined();
	});

	it("opens an existing Canvas from the empty context action", () => {
		const app = new App();
		const canvasFile = new TFile("maps/plan.canvas");
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
		app.vault.getFiles = vi.fn().mockReturnValue([canvasFile]);
		const openFile = vi.fn();
		app.workspace.getLeaf = vi.fn().mockReturnValue({ openFile });

		renderPanel(app);
		fireEvent.click(screen.getByRole("button", { name: "Open plan" }));

		expect(openFile).toHaveBeenCalledWith(canvasFile);
	});

	it("requires an explicit choice when multiple Canvases exist", () => {
		const app = new App();
		const alpha = new TFile("maps/Alpha.canvas");
		const beta = new TFile("maps/Beta.canvas");
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
		app.vault.getFiles = vi.fn().mockReturnValue([beta, alpha]);
		const openFile = vi.fn();
		app.workspace.getLeaf = vi.fn().mockReturnValue({ openFile });

		renderPanel(app);
		const openButton = screen.getByRole("button", { name: "Open Canvas" });
		expect(openButton.hasAttribute("disabled")).toBe(true);

		fireEvent.change(screen.getByLabelText("Canvas"), { target: { value: beta.path } });
		expect(openButton.hasAttribute("disabled")).toBe(false);
		fireEvent.click(openButton);

		expect(openFile).toHaveBeenCalledWith(beta);
	});

	it("creates a valid empty Canvas from the empty context action", async () => {
		const app = new App();
		const created = new TFile("Untitled Canvas.canvas");
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
		app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(null);
		app.vault.create = vi.fn().mockResolvedValue(created);
		const openFile = vi.fn();
		app.workspace.getLeaf = vi.fn().mockReturnValue({ openFile });

		renderPanel(app);
		fireEvent.click(screen.getByRole("button", { name: "New Canvas" }));

		await vi.waitFor(() => {
			expect(app.vault.create).toHaveBeenCalledWith(
				"Untitled Canvas.canvas",
				JSON.stringify({ nodes: [], edges: [] }),
			);
			expect(openFile).toHaveBeenCalledWith(created);
		});
	});

	it("distinguishes an empty Canvas from an unavailable Canvas", () => {
		const app = new App();
		const canvasView = createMockCanvasView();
		canvasView.canvas.getData = vi.fn().mockReturnValue({ nodes: [], edges: [] });
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

		renderPanel(app);
		expect(screen.getByText("This Canvas has no items yet.")).toBeDefined();
		expect(screen.queryByText("No Canvas is open")).toBeNull();
	});

	it("explains a zero-result search and offers to clear it", () => {
		const app = new App();
		const canvasView = createMockCanvasView();
		canvasView.canvas.getData = vi.fn().mockReturnValue({
			nodes: [{ id: "a", type: "text", text: "Alpha", x: 0, y: 0, width: 100, height: 100 }],
			edges: [],
		});
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);

		renderPanel(app);
		const input = screen.getByPlaceholderText("Search this Canvas...");
		fireEvent.change(input, { target: { value: "missing" } });
		expect(screen.getByText("No items match this search.")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
		expect((input as HTMLInputElement).value).toBe("");
		const results = document.querySelector(".canvas-panel__results");
		expect(results).not.toBeNull();
		expect(within(results as HTMLElement).getByText("Alpha")).toBeDefined();
	});
});
