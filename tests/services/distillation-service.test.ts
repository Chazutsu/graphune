import { DistillationService, sourcesFromCanvasNodes } from "@/services/distillation-service";
import type { CanvasOperator } from "@/services/canvas-operator";
import type { FileCreator } from "@/services/file-creator";
import { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { createMockCanvasView } from "../helpers/create-mock-canvas-view";

describe("DistillationService", () => {
	it("creates, replaces selected materials, and marks source notes processed", async () => {
		const app = new App();
		const source = new TFile("Clippings/source.md");
		const created = new TFile("Knowledge/Distilled.md");
		app.vault.getAbstractFileByPath = vi.fn((path: string) =>
			path === source.path ? source : null,
		);
		let processed: Record<string, unknown> = {};
		app.fileManager.processFrontMatter = vi.fn(async (_file, callback) => callback(processed));
		const fileCreator = {
			createDistilledFile: vi.fn().mockResolvedValue(created),
			removeFile: vi.fn(),
		} as unknown as FileCreator;
		const commit = vi.fn();
		const canvasOperator = {
			replaceNodesWithFileTransaction: vi.fn().mockReturnValue({
				node: { id: "distilled" },
				commit,
				rollback: vi.fn(),
			}),
		} as unknown as CanvasOperator;
		const service = new DistillationService(app, fileCreator, canvasOperator);
		const canvasView = createMockCanvasView();

		const result = await service.distill(canvasView, ["a", "b"], {
			title: "Distilled",
			body: "Claim",
			sources: [
				{ path: source.path, label: "Source" },
				{ text: "Observation", label: "Daily" },
			],
			connection: { path: "Knowledge/Context.md", reason: "Builds on this model" },
		});

		expect(result).toBe(created);
		expect(canvasOperator.replaceNodesWithFileTransaction).toHaveBeenCalledWith(
			canvasView.canvas,
			["a", "b"],
			created,
		);
		expect(commit).toHaveBeenCalledOnce();
		expect(processed).toEqual({ "graphune-processed-by": [created.path] });
	});

	it("rolls back the created note when the Canvas selection became stale", async () => {
		const app = new App();
		const created = new TFile("Knowledge/Distilled.md");
		const fileCreator = {
			createDistilledFile: vi.fn().mockResolvedValue(created),
			removeFile: vi.fn(),
		} as unknown as FileCreator;
		const canvasOperator = {
			replaceNodesWithFileTransaction: vi.fn().mockReturnValue(null),
		} as unknown as CanvasOperator;
		const service = new DistillationService(app, fileCreator, canvasOperator);

		await expect(
			service.distill(createMockCanvasView(), ["a", "b"], {
				title: "Distilled",
				body: "Claim",
				sources: [
					{ text: "A", label: "A" },
					{ text: "B", label: "B" },
				],
				connection: { path: "Context.md", reason: "Because" },
			}),
		).rejects.toThrow("changed");
		expect(fileCreator.removeFile).toHaveBeenCalledWith(created);
	});

	it("rolls back Canvas, all touched source notes, and the created note on source failure", async () => {
		const app = new App();
		const sourceA = new TFile("Clippings/a.md");
		const sourceB = new TFile("Clippings/b.md");
		const created = new TFile("Knowledge/Distilled.md");
		app.vault.getAbstractFileByPath = vi.fn((path: string) =>
			path === sourceA.path ? sourceA : path === sourceB.path ? sourceB : null,
		);
		const states = new Map<TFile, Record<string, unknown>>([
			[sourceA, {}],
			[sourceB, {}],
		]);
		let rollingBack = false;
		app.fileManager.processFrontMatter = vi.fn(async (file, callback) => {
			callback(states.get(file as TFile) ?? {});
			if (!rollingBack && file === sourceB) {
				rollingBack = true;
				throw new Error("iCloud write failed");
			}
		});
		const removeFile = vi.fn();
		const fileCreator = {
			createDistilledFile: vi.fn().mockResolvedValue(created),
			removeFile,
		} as unknown as FileCreator;
		const rollback = vi.fn().mockReturnValue(true);
		const commit = vi.fn();
		const canvasOperator = {
			replaceNodesWithFileTransaction: vi.fn().mockReturnValue({
				node: { id: "distilled" },
				commit,
				rollback,
			}),
		} as unknown as CanvasOperator;
		const service = new DistillationService(app, fileCreator, canvasOperator);

		await expect(
			service.distill(createMockCanvasView(), ["a", "b"], {
				title: "Distilled",
				body: "Claim",
				sources: [
					{ path: sourceA.path, label: "A" },
					{ path: sourceB.path, label: "B" },
				],
				connection: { path: "Context.md", reason: "Because" },
			}),
		).rejects.toThrow("iCloud write failed");

		expect(commit).not.toHaveBeenCalled();
		expect(rollback).toHaveBeenCalledOnce();
		expect(states.get(sourceA)).toEqual({});
		expect(states.get(sourceB)).toEqual({});
		expect(removeFile).toHaveBeenCalledWith(created);
	});

	it("extracts only file and text materials from Canvas data", () => {
		expect(
			sourcesFromCanvasNodes([
				{
					id: "a",
					type: "file",
					file: "Book.md",
					subpath: "#Claim",
					x: 0,
					y: 0,
					width: 1,
					height: 1,
				},
				{ id: "b", type: "text", text: "Daily thought", x: 0, y: 0, width: 1, height: 1 },
				{ id: "c", type: "link", url: "https://example.com", x: 0, y: 0, width: 1, height: 1 },
			]),
		).toEqual([
			{ path: "Book.md", subpath: "#Claim", label: "Book" },
			{ text: "Daily thought", label: "Daily thought" },
		]);
	});
});
