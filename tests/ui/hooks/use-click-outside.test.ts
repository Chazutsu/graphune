import { useClickOutside } from "@/ui/hooks/use-click-outside";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("useClickOutside", () => {
	let container: HTMLDivElement;
	let outside: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		outside = document.createElement("div");
		document.body.appendChild(container);
		document.body.appendChild(outside);
	});

	afterEach(() => {
		document.body.removeChild(container);
		document.body.removeChild(outside);
	});

	it("calls callback when clicking outside the container", () => {
		const callback = vi.fn();
		const ref = { current: container };

		renderHook(() => useClickOutside(ref, callback));

		act(() => {
			outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});

		expect(callback).toHaveBeenCalledOnce();
	});

	it("does not call callback when clicking inside the container", () => {
		const callback = vi.fn();
		const ref = { current: container };

		renderHook(() => useClickOutside(ref, callback));

		act(() => {
			container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});

		expect(callback).not.toHaveBeenCalled();
	});

	it("does not call callback when ref is null", () => {
		const callback = vi.fn();
		const ref = { current: null };

		renderHook(() => useClickOutside(ref, callback));

		act(() => {
			outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});

		expect(callback).not.toHaveBeenCalled();
	});

	it("removes event listener on unmount", () => {
		const callback = vi.fn();
		const ref = { current: container };
		const removeSpy = vi.spyOn(document, "removeEventListener");

		const { unmount } = renderHook(() => useClickOutside(ref, callback));
		unmount();

		const mousedownRemoves = removeSpy.mock.calls.filter(
			(call: [string, ...unknown[]]) => call[0] === "mousedown",
		);
		expect(mousedownRemoves.length).toBeGreaterThan(0);

		removeSpy.mockRestore();
	});
});
