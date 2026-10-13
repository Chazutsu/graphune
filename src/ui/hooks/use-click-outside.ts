import type { RefObject } from "react";
import { useEffect } from "react";

export function useClickOutside(ref: RefObject<HTMLElement | null>, callback: () => void): void {
	useEffect(() => {
		const handleMouseDown = (e: MouseEvent) => {
			if (!ref.current) {
				return;
			}
			if (!ref.current.contains(e.target as Node)) {
				callback();
			}
		};

		document.addEventListener("mousedown", handleMouseDown);
		return () => {
			document.removeEventListener("mousedown", handleMouseDown);
		};
	}, [ref, callback]);
}
