import { HeadingParser } from "@/services/heading-parser";
import type { SearchResult } from "@/types/plugin";
import { useApp } from "@/ui/hooks/use-app";
import { TFile } from "obsidian";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface NoteSearchState {
	query: string;
	results: SearchResult[];
	isSearching: boolean;
	isHydrating: boolean;
	failedCount: number;
	setQuery: (query: string) => void;
	retrySearch: () => void;
}

const SEARCH_DEBOUNCE_MS = 160;
const VAULT_REFRESH_DEBOUNCE_MS = 80;

export function useNoteSearch(): NoteSearchState {
	const { app } = useApp();
	const parser = useMemo(() => new HeadingParser(app), [app]);
	const [query, setQueryState] = useState("");
	const [results, setResults] = useState<SearchResult[]>(() => parser.list());
	const [isSearching, setIsSearching] = useState(false);
	const [isHydrating, setIsHydrating] = useState(false);
	const [failedCount, setFailedCount] = useState(0);
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const requestIdRef = useRef(0);
	const mountedRef = useRef(true);
	const queryRef = useRef("");

	const runSearch = useCallback(
		async (targetQuery: string, showProgress = true): Promise<void> => {
			const requestId = ++requestIdRef.current;
			if (showProgress) setIsSearching(true);
			try {
				const outcome = await parser.searchDetailed(targetQuery);
				if (!mountedRef.current || requestId !== requestIdRef.current) return;
				if (outcome.results.length > 0 || outcome.failedCount === 0) {
					setResults(outcome.results);
				}
				setFailedCount(outcome.failedCount);
			} catch {
				if (mountedRef.current && requestId === requestIdRef.current) setFailedCount(1);
			} finally {
				if (mountedRef.current && requestId === requestIdRef.current) {
					setIsSearching(false);
					setIsHydrating(false);
				}
			}
		},
		[parser],
	);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		const scheduleRefresh = (path?: string): void => {
			parser.invalidate(path);
			requestIdRef.current += 1;
			if (queryRef.current === "") {
				setResults(parser.list());
				setFailedCount(0);
			}
			if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
			refreshTimerRef.current = setTimeout(() => {
				refreshTimerRef.current = null;
				if (queryRef.current !== "") void runSearch(queryRef.current, false);
			}, VAULT_REFRESH_DEBOUNCE_MS);
		};
		const createRef = app.vault.on("create", (file) => {
			if (file instanceof TFile && file.extension === "md") scheduleRefresh(file.path);
		});
		const modifyRef = app.vault.on("modify", (file) => {
			if (file instanceof TFile && file.extension === "md") scheduleRefresh(file.path);
		});
		const deleteRef = app.vault.on("delete", (file) => {
			if (file instanceof TFile && file.extension === "md") scheduleRefresh(file.path);
		});
		const renameRef = app.vault.on("rename", (file, oldPath) => {
			if (!(file instanceof TFile) || file.extension !== "md") return;
			parser.invalidate(oldPath);
			scheduleRefresh(file.path);
		});
		return () => {
			app.vault.offref(createRef);
			app.vault.offref(modifyRef);
			app.vault.offref(deleteRef);
			app.vault.offref(renameRef);
		};
	}, [app.vault, parser, runSearch]);

	const setQuery = useCallback(
		(newQuery: string) => {
			setQueryState(newQuery);
			requestIdRef.current += 1;
			const normalizedQuery = newQuery.trim();
			queryRef.current = normalizedQuery;
			setIsSearching(true);
			if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);

			if (normalizedQuery === "") {
				requestIdRef.current += 1;
				setResults(parser.list());
				setFailedCount(0);
				setIsSearching(false);
				setIsHydrating(false);
				return;
			}

			searchTimerRef.current = setTimeout(() => {
				searchTimerRef.current = null;
				void runSearch(normalizedQuery);
			}, SEARCH_DEBOUNCE_MS);
		},
		[parser, runSearch],
	);

	const retrySearch = useCallback(() => {
		if (queryRef.current === "") {
			setResults(parser.list());
			setFailedCount(0);
			return;
		}
		void runSearch(queryRef.current);
	}, [parser, runSearch]);

	useEffect(() => {
		return () => {
			if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
			if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
		};
	}, []);

	return { query, results, isSearching, isHydrating, failedCount, setQuery, retrySearch };
}
