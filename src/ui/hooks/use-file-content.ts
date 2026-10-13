import type { TFile } from "obsidian";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "./use-app";

interface UseFileContentReturn {
	content: string;
	isLoading: boolean;
	save: (update: string | ((current: string) => string | null)) => Promise<FileSaveResult>;
	refresh: () => void;
}

export type FileSaveResult =
	| { status: "saved" }
	| { status: "unchanged" }
	| { status: "conflict" }
	| { status: "failed"; error: unknown };

export function useFileContent(file: TFile | null): UseFileContentReturn {
	const { app } = useApp();
	const [snapshot, setSnapshot] = useState<{
		file: TFile | null;
		content: string;
		isLoading: boolean;
	}>({
		file: null,
		content: "",
		isLoading: false,
	});
	const mountedRef = useRef(true);
	const readRequestRef = useRef(0);

	useEffect(() => {
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (!file) {
			readRequestRef.current += 1;
			return;
		}

		let cancelled = false;
		const requestId = ++readRequestRef.current;
		app.vault
			.read(file)
			.then((text) => {
				if (!cancelled && requestId === readRequestRef.current) {
					setSnapshot({ file, content: text, isLoading: false });
				}
			})
			.catch(() => {
				if (!cancelled) setSnapshot({ file, content: "", isLoading: false });
			});

		return () => {
			cancelled = true;
		};
	}, [app.vault, file]);

	const save = useCallback(
		async (update: string | ((current: string) => string | null)) => {
			if (!file) {
				return { status: "failed", error: new Error("No file selected") } as const;
			}
			let changed = false;
			let conflicted = false;
			try {
				await app.vault.process(file, (current) => {
					const next = typeof update === "function" ? update(current) : update;
					if (next === null) {
						conflicted = true;
						return current;
					}
					if (next === current) return current;
					changed = true;
					return next;
				});
			} catch (error) {
				return { status: "failed", error } as const;
			}
			if (conflicted) return { status: "conflict" } as const;
			return changed ? ({ status: "saved" } as const) : ({ status: "unchanged" } as const);
		},
		[app.vault, file],
	);

	const refresh = useCallback(() => {
		if (!file) {
			return;
		}
		const requestId = ++readRequestRef.current;
		app.vault
			.read(file)
			.then((text) => {
				if (mountedRef.current && requestId === readRequestRef.current) {
					setSnapshot({ file, content: text, isLoading: false });
				}
			})
			.catch(() => undefined);
	}, [app.vault, file]);

	const isCurrentFile = snapshot.file === file;
	return {
		content: isCurrentFile ? snapshot.content : "",
		isLoading: file !== null && (!isCurrentFile || snapshot.isLoading),
		save,
		refresh,
	};
}
