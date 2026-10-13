import { useInfiniteScroll } from "@/ui/hooks/use-infinite-scroll";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let observeCallback: IntersectionObserverCallback;
let mockObserve: ReturnType<typeof vi.fn>;
let mockDisconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
	mockObserve = vi.fn();
	mockDisconnect = vi.fn();

	class MockIntersectionObserver {
		constructor(cb: IntersectionObserverCallback) {
			observeCallback = cb;
		}
		observe = mockObserve;
		disconnect = mockDisconnect;
		unobserve = vi.fn();
	}

	vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("useInfiniteScroll", () => {
	const PAGE_SIZE = 20;

	it("returns first page of items initially", () => {
		const items = Array.from({ length: 50 }, (_, i) => i);
		const { result } = renderHook(() => useInfiniteScroll(items, PAGE_SIZE));
		expect(result.current.visibleItems).toHaveLength(PAGE_SIZE);
		expect(result.current.visibleItems).toEqual(items.slice(0, PAGE_SIZE));
	});

	it("returns all items when total is less than page size", () => {
		const items = Array.from({ length: 5 }, (_, i) => i);
		const { result } = renderHook(() => useInfiniteScroll(items, PAGE_SIZE));
		expect(result.current.visibleItems).toHaveLength(5);
		expect(result.current.hasMore).toBe(false);
	});

	it("hasMore is true when there are more items", () => {
		const items = Array.from({ length: 50 }, (_, i) => i);
		const { result } = renderHook(() => useInfiniteScroll(items, PAGE_SIZE));
		expect(result.current.hasMore).toBe(true);
	});

	it("loads more items when sentinel is intersecting", () => {
		const items = Array.from({ length: 50 }, (_, i) => i);
		const { result } = renderHook(() => useInfiniteScroll(items, PAGE_SIZE));

		const sentinel = document.createElement("div");
		act(() => {
			result.current.sentinelRef(sentinel);
		});

		act(() => {
			observeCallback(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);
		});

		expect(result.current.visibleItems).toHaveLength(PAGE_SIZE * 2);
	});

	it("does not exceed total items", () => {
		const items = Array.from({ length: 30 }, (_, i) => i);
		const { result } = renderHook(() => useInfiniteScroll(items, PAGE_SIZE));

		const sentinel = document.createElement("div");
		act(() => {
			result.current.sentinelRef(sentinel);
		});

		act(() => {
			observeCallback(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);
		});

		expect(result.current.visibleItems).toHaveLength(30);
		expect(result.current.hasMore).toBe(false);
	});

	it("resets page when items change", () => {
		const items1 = Array.from({ length: 50 }, (_, i) => i);
		const { result, rerender } = renderHook(({ items }) => useInfiniteScroll(items, PAGE_SIZE), {
			initialProps: { items: items1 },
		});

		const sentinel = document.createElement("div");
		act(() => {
			result.current.sentinelRef(sentinel);
		});

		act(() => {
			observeCallback(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);
		});
		expect(result.current.visibleItems).toHaveLength(40);

		const items2 = Array.from({ length: 50 }, (_, i) => i + 100);
		rerender({ items: items2 });
		expect(result.current.visibleItems).toHaveLength(PAGE_SIZE);
		expect(result.current.visibleItems[0]).toBe(100);
	});

	it("observes sentinel element via callback ref", () => {
		const items = Array.from({ length: 50 }, (_, i) => i);
		const { result } = renderHook(() => useInfiniteScroll(items, PAGE_SIZE));

		const sentinel = document.createElement("div");
		act(() => {
			result.current.sentinelRef(sentinel);
		});

		expect(mockObserve).toHaveBeenCalledWith(sentinel);
	});

	it("disconnects previous observer when sentinel ref is updated", () => {
		const items = Array.from({ length: 50 }, (_, i) => i);
		const { result } = renderHook(() => useInfiniteScroll(items, PAGE_SIZE));

		const sentinel1 = document.createElement("div");
		act(() => {
			result.current.sentinelRef(sentinel1);
		});

		const sentinel2 = document.createElement("div");
		act(() => {
			result.current.sentinelRef(sentinel2);
		});

		expect(mockDisconnect).toHaveBeenCalled();
	});
});
