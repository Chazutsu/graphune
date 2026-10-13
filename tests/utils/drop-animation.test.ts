import { showDropAnimation } from "@/utils/drop-animation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("showDropAnimation", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		vi.useFakeTimers();
	});

	afterEach(() => {
		container.remove();
		vi.useRealTimers();
	});

	it("creates animation element inside container", () => {
		showDropAnimation(container, { x: 100, y: 200 });
		const el = container.querySelector("[data-drop-animation]");
		expect(el).not.toBeNull();
	});

	it("positions animation at specified coordinates", () => {
		showDropAnimation(container, { x: 50, y: 75 });
		const el = container.querySelector("[data-drop-animation]") as HTMLElement;
		expect(el.style.left).toBe("50px");
		expect(el.style.top).toBe("75px");
	});

	it("removes animation element after 300ms", () => {
		showDropAnimation(container, { x: 0, y: 0 });
		expect(container.querySelector("[data-drop-animation]")).not.toBeNull();

		vi.advanceTimersByTime(300);
		expect(container.querySelector("[data-drop-animation]")).toBeNull();
	});

	it("shows count badge when count > 1", () => {
		showDropAnimation(container, { x: 0, y: 0 }, 5);
		const el = container.querySelector("[data-drop-animation]") as HTMLElement;
		expect(el.textContent).toContain("5");
	});

	it("does not show count badge when count is 1", () => {
		showDropAnimation(container, { x: 0, y: 0 }, 1);
		const el = container.querySelector("[data-drop-animation]") as HTMLElement;
		expect(el.textContent).toBe("");
	});
});
