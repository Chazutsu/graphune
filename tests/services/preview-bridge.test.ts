import { PreviewBridge } from "@/services/preview-bridge";
import type { PreviewItem } from "@/services/preview-bridge";
import { describe, expect, it, vi } from "vitest";

describe("PreviewBridge", () => {
	const sampleItems: PreviewItem[] = [
		{
			title: "Section A",
			filePath: "notes/test.md",
		},
	];

	const sampleContents = ["## Section A\n\nContent here."];

	it("starts with no callback registered", () => {
		const bridge = new PreviewBridge();
		expect(bridge.hasCallback()).toBe(false);
	});

	it("registers a preview callback", () => {
		const bridge = new PreviewBridge();
		const callback = vi.fn();
		bridge.onPreviewRequest(callback);
		expect(bridge.hasCallback()).toBe(true);
	});

	it("unregisters callback with dispose", () => {
		const bridge = new PreviewBridge();
		const callback = vi.fn();
		const dispose = bridge.onPreviewRequest(callback);
		dispose();
		expect(bridge.hasCallback()).toBe(false);
	});

	it("requestPreview calls the registered callback", () => {
		const bridge = new PreviewBridge();
		const callback = vi.fn();
		bridge.onPreviewRequest(callback);

		const onConfirm = vi.fn();
		const onCancel = vi.fn();
		bridge.requestPreview(sampleItems, sampleContents, onConfirm, onCancel);

		expect(callback).toHaveBeenCalledWith({
			items: sampleItems,
			contents: sampleContents,
			onConfirm,
			onCancel,
		});
	});

	it("requestPreview returns false when no callback registered", () => {
		const bridge = new PreviewBridge();
		const result = bridge.requestPreview(sampleItems, sampleContents, vi.fn(), vi.fn());
		expect(result).toBe(false);
	});

	it("requestPreview returns true when callback is registered", () => {
		const bridge = new PreviewBridge();
		bridge.onPreviewRequest(vi.fn());
		const result = bridge.requestPreview(sampleItems, sampleContents, vi.fn(), vi.fn());
		expect(result).toBe(true);
	});
});
