import type { DragData } from "@/types/plugin";
import { useDragData } from "@/ui/hooks/use-drag-data";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockGetData = (): DragData => ({
	type: "note-drag",
	filePath: "test.md",
});

describe("useDragData", () => {
	it("returns isDragging as false initially", () => {
		const { result } = renderHook(() => useDragData(mockGetData));
		expect(result.current.isDragging).toBe(false);
	});

	it("sets isDragging to true on dragStart", () => {
		const { result } = renderHook(() => useDragData(mockGetData));

		const mockEvent = {
			dataTransfer: {
				setData: vi.fn(),
				setDragImage: vi.fn(),
				effectAllowed: "",
			},
		} as unknown as React.DragEvent;

		act(() => {
			result.current.handleDragStart(mockEvent);
		});

		expect(result.current.isDragging).toBe(true);
		expect(mockEvent.dataTransfer.setData).toHaveBeenCalledWith(
			"application/json",
			JSON.stringify({ type: "note-drag", filePath: "test.md" }),
		);
		expect(mockEvent.dataTransfer.effectAllowed).toBe("copy");
	});

	it("sets isDragging to false on dragEnd", () => {
		const { result } = renderHook(() => useDragData(mockGetData));

		const mockEvent = {
			dataTransfer: {
				setData: vi.fn(),
				setDragImage: vi.fn(),
				effectAllowed: "",
			},
		} as unknown as React.DragEvent;

		act(() => {
			result.current.handleDragStart(mockEvent);
		});
		expect(result.current.isDragging).toBe(true);

		act(() => {
			result.current.handleDragEnd();
		});
		expect(result.current.isDragging).toBe(false);
	});

	it("creates ghost element with label when visualOptions provided", () => {
		const { result } = renderHook(() => useDragData(mockGetData, { label: "Test Label" }));

		const mockEvent = {
			dataTransfer: {
				setData: vi.fn(),
				setDragImage: vi.fn(),
				effectAllowed: "",
			},
		} as unknown as React.DragEvent;

		act(() => {
			result.current.handleDragStart(mockEvent);
		});

		expect(mockEvent.dataTransfer.setDragImage).toHaveBeenCalled();
		const ghostEl = (mockEvent.dataTransfer.setDragImage as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as HTMLElement;
		expect(ghostEl.textContent).toContain("Test Label");
	});

	it("shows badge count in ghost when badgeCount provided", () => {
		const { result } = renderHook(() =>
			useDragData(mockGetData, { label: "Items", badgeCount: 3 }),
		);

		const mockEvent = {
			dataTransfer: {
				setData: vi.fn(),
				setDragImage: vi.fn(),
				effectAllowed: "",
			},
		} as unknown as React.DragEvent;

		act(() => {
			result.current.handleDragStart(mockEvent);
		});

		const ghostEl = (mockEvent.dataTransfer.setDragImage as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as HTMLElement;
		expect(ghostEl.textContent).toContain("3");
	});

	it("cleans up ghost element on dragEnd", () => {
		const { result } = renderHook(() => useDragData(mockGetData, { label: "Test" }));

		const mockEvent = {
			dataTransfer: {
				setData: vi.fn(),
				setDragImage: vi.fn(),
				effectAllowed: "",
			},
		} as unknown as React.DragEvent;

		act(() => {
			result.current.handleDragStart(mockEvent);
		});

		const ghostEl = (mockEvent.dataTransfer.setDragImage as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as HTMLElement;
		expect(document.body.contains(ghostEl)).toBe(true);

		act(() => {
			result.current.handleDragEnd();
		});

		expect(document.body.contains(ghostEl)).toBe(false);
	});
});
