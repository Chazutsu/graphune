import { CanvasCardContext } from "@/ui/components/canvas-card-context";
import { useKnowledgeContext } from "@/ui/hooks/use-knowledge-context";
import type { CanvasData, CanvasView } from "@/types/obsidian-canvas";
import { fireEvent, render, screen } from "@testing-library/react";
import { App, TFile } from "obsidian";
import React from "react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

vi.mock("@/ui/hooks/use-knowledge-context", () => ({ useKnowledgeContext: vi.fn() }));

describe("CanvasCardContext", () => {
	beforeEach(() => {
		vi.mocked(useKnowledgeContext).mockReturnValue({
			backlinks: [],
			canvases: [],
			canvasStatus: "fresh",
			relatedCandidates: [
				{
					path: "candidate.md",
					label: "candidate",
					score: 115,
					reasons: [{ type: "outlink" }, { type: "tag", value: "design" }],
				},
			],
			status: "ready",
		});
	});

	it("shows the reason and adds the candidate with that reason on the edge", () => {
		const app = new App();
		const selectedFile = new TFile("selected.md");
		const candidateFile = new TFile("candidate.md");
		(app.vault.getAbstractFileByPath as Mock).mockImplementation((path: string) =>
			path === selectedFile.path
				? selectedFile
				: path === candidateFile.path
					? candidateFile
					: null,
		);
		let data: CanvasData = {
			nodes: [
				{
					id: "selected",
					type: "file",
					file: selectedFile.path,
					x: 0,
					y: 0,
					width: 300,
					height: 180,
				},
			],
			edges: [],
		};
		const canvas = {
			getData: vi.fn(() => data),
			setData: vi.fn((next: CanvasData) => {
				data = next;
			}),
			requestSave: vi.fn(),
			createFileNode: vi.fn(({ file, pos }: { file: TFile; pos: { x: number; y: number } }) => {
				const node = { id: "candidate-node", ...pos, width: 300, height: 180, file };
				data.nodes.push({
					id: node.id,
					type: "file",
					file: file.path,
					x: pos.x,
					y: pos.y,
					width: node.width,
					height: node.height,
				});
				return node;
			}),
		} as unknown as CanvasView["canvas"];
		const canvasView = { canvas, file: new TFile("board.canvas") };

		render(
			<CanvasCardContext
				canvasView={canvasView}
				selectedNodes={[{ id: "selected", x: 0, y: 0, width: 300, height: 180 }]}
			/>,
			{ wrapper: createWrapper(app) },
		);

		expect(screen.getByText("Linked from this card · Shared tag: design")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Add candidate to this Canvas" }));

		expect(data.nodes.some((node) => node.file === candidateFile.path)).toBe(true);
		expect(data.edges).toHaveLength(1);
		expect(data.edges[0]).toMatchObject({
			fromNode: "selected",
			toNode: "candidate-node",
			label: "Linked from this card · Shared tag: design",
		});
		expect(screen.queryByRole("button", { name: "Add candidate to this Canvas" })).toBeNull();
	});

	it.each([
		["loading", "Finding related cards…"],
		["error", "Related cards could not be loaded."],
	] as const)("shows the %s state explicitly", (status, message) => {
		vi.mocked(useKnowledgeContext).mockReturnValue({
			backlinks: [],
			canvases: [],
			canvasStatus: "fresh",
			relatedCandidates: [],
			status,
		});
		const app = new App();
		const file = new TFile("selected.md");
		(app.vault.getAbstractFileByPath as Mock).mockReturnValue(file);
		const data: CanvasData = {
			nodes: [
				{ id: "selected", type: "file", file: file.path, x: 0, y: 0, width: 300, height: 180 },
			],
			edges: [],
		};
		const canvasView = {
			file: new TFile("board.canvas"),
			canvas: { getData: () => data },
		} as CanvasView;

		render(
			<CanvasCardContext
				canvasView={canvasView}
				selectedNodes={[{ id: "selected", x: 0, y: 0, width: 300, height: 180 }]}
			/>,
			{ wrapper: createWrapper(app) },
		);

		expect(screen.getByText(message)).toBeDefined();
	});
});
