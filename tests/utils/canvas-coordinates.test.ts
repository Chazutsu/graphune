import { type CanvasPosition, clientToCanvasPos } from "@/utils/canvas-coordinates";
import { describe, expect, it } from "vitest";

const makeCanvasEl = (rect: Partial<DOMRect> = {}) => ({
	getBoundingClientRect: () =>
		({
			left: 0,
			top: 0,
			right: 800,
			bottom: 600,
			width: 800,
			height: 600,
			x: 0,
			y: 0,
			toJSON: () => ({}),
			...rect,
		}) as DOMRect,
});

describe("clientToCanvasPos", () => {
	it("converts client coordinates to canvas coordinates at zoom 1 with no pan", () => {
		const canvas = { tx: 0, ty: 0, tZoom: 1 };
		const canvasEl = makeCanvasEl();

		const result = clientToCanvasPos(400, 300, canvas, canvasEl);

		expect(result).toEqual({ x: 400, y: 300 });
	});

	it("accounts for canvas element offset", () => {
		const canvas = { tx: 0, ty: 0, tZoom: 1 };
		const canvasEl = makeCanvasEl({ left: 100, top: 50 });

		const result = clientToCanvasPos(500, 350, canvas, canvasEl);

		expect(result).toEqual({ x: 400, y: 300 });
	});

	it("accounts for pan (translation) offsets", () => {
		const canvas = { tx: 200, ty: 100, tZoom: 1 };
		const canvasEl = makeCanvasEl();

		const result = clientToCanvasPos(400, 300, canvas, canvasEl);

		expect(result).toEqual({ x: 200, y: 200 });
	});

	it("accounts for zoom level of 2", () => {
		const canvas = { tx: 0, ty: 0, tZoom: 2 };
		const canvasEl = makeCanvasEl();

		const result = clientToCanvasPos(400, 300, canvas, canvasEl);

		expect(result).toEqual({ x: 200, y: 150 });
	});

	it("accounts for zoom level of 0.5", () => {
		const canvas = { tx: 0, ty: 0, tZoom: 0.5 };
		const canvasEl = makeCanvasEl();

		const result = clientToCanvasPos(400, 300, canvas, canvasEl);

		expect(result).toEqual({ x: 800, y: 600 });
	});

	it("combines offset, pan, and zoom correctly", () => {
		const canvas = { tx: 100, ty: 50, tZoom: 2 };
		const canvasEl = makeCanvasEl({ left: 50, top: 25 });

		const result = clientToCanvasPos(350, 275, canvas, canvasEl);

		// x = (350 - 50 - 100) / 2 = 200 / 2 = 100
		// y = (275 - 25 - 50) / 2 = 200 / 2 = 100
		expect(result).toEqual({ x: 100, y: 100 });
	});

	it("handles negative pan offsets", () => {
		const canvas = { tx: -200, ty: -100, tZoom: 1 };
		const canvasEl = makeCanvasEl();

		const result = clientToCanvasPos(400, 300, canvas, canvasEl);

		expect(result).toEqual({ x: 600, y: 400 });
	});

	it("handles click at canvas element origin with pan and zoom", () => {
		const canvas = { tx: 50, ty: 50, tZoom: 1.5 };
		const canvasEl = makeCanvasEl({ left: 100, top: 100 });

		const result = clientToCanvasPos(100, 100, canvas, canvasEl);

		// x = (100 - 100 - 50) / 1.5 = -50 / 1.5 = -33.333...
		// y = (100 - 100 - 50) / 1.5 = -50 / 1.5 = -33.333...
		expect(result.x).toBeCloseTo(-33.333, 2);
		expect(result.y).toBeCloseTo(-33.333, 2);
	});

	it("returns correct type shape", () => {
		const canvas = { tx: 0, ty: 0, tZoom: 1 };
		const canvasEl = makeCanvasEl();

		const result: CanvasPosition = clientToCanvasPos(0, 0, canvas, canvasEl);

		expect(typeof result.x).toBe("number");
		expect(typeof result.y).toBe("number");
	});
});
