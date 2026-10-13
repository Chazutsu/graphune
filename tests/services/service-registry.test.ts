import { BacklinkWriter } from "@/services/backlink-writer";
import { CanvasObserver } from "@/services/canvas-observer";
import { CanvasOperator } from "@/services/canvas-operator";
import { EdgeSync } from "@/services/edge-sync";
import { FileCreator } from "@/services/file-creator";
import { QuickCardCreator } from "@/services/quick-card-creator";
import { createServices } from "@/services/service-registry";
import { DEFAULT_SETTINGS } from "@/types/settings";
import { App } from "obsidian";
import { describe, expect, it } from "vitest";

describe("createServices", () => {
	it("returns all service instances", () => {
		const app = new App();
		const services = createServices(app, DEFAULT_SETTINGS);

		expect(services.fileCreator).toBeInstanceOf(FileCreator);
		expect(services.canvasOperator).toBeInstanceOf(CanvasOperator);
		expect(services.canvasObserver).toBeInstanceOf(CanvasObserver);
		expect(services.backlinkWriter).toBeInstanceOf(BacklinkWriter);
		expect(services.quickCardCreator).toBeInstanceOf(QuickCardCreator);
		expect(services.edgeSync).toBeInstanceOf(EdgeSync);
	});

	it("creates new instances on each call", () => {
		const app = new App();
		const services1 = createServices(app, DEFAULT_SETTINGS);
		const services2 = createServices(app, DEFAULT_SETTINGS);

		expect(services1.canvasObserver).not.toBe(services2.canvasObserver);
		expect(services1.fileCreator).not.toBe(services2.fileCreator);
	});
});
