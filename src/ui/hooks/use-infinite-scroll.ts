import { useCallback, useMemo, useRef, useState } from "react";

interface UseInfiniteScrollReturn<T> {
	visibleItems: T[];
	hasMore: boolean;
	sentinelRef: (node: HTMLDivElement | null) => void;
}

export function useInfiniteScroll<T>(items: T[], pageSize: number): UseInfiniteScrollReturn<T> {
	const [page, setPage] = useState(1);
	const observerRef = useRef<IntersectionObserver | null>(null);

	const [prevItems, setPrevItems] = useState(items);
	if (items !== prevItems) {
		setPrevItems(items);
		setPage(1);
	}

	const visibleCount = Math.min(page * pageSize, items.length);
	const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
	const hasMore = visibleCount < items.length;

	const sentinelRef = useCallback(
		(node: HTMLDivElement | null) => {
			observerRef.current?.disconnect();
			if (!node || !hasMore) return;

			const observer = new IntersectionObserver((entries) => {
				if (entries[0]?.isIntersecting) {
					setPage((p) => p + 1);
				}
			});
			observerRef.current = observer;
			observer.observe(node);
		},
		[hasMore],
	);

	return { visibleItems, hasMore, sentinelRef };
}
