import type { TFile } from "obsidian";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./use-app";

const SEARCH_DEBOUNCE_MS = 160;

interface UseFileSearchReturn {
	query: string;
	setQuery: (q: string) => void;
	results: TFile[];
	searchSettled: boolean;
}

export function useFileSearch(): UseFileSearchReturn {
	const { app } = useApp();
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const normalizedQuery = query.trim();
	const searchSettled = normalizedQuery === "" || debouncedQuery === normalizedQuery;

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedQuery(normalizedQuery);
		}, SEARCH_DEBOUNCE_MS);
		return () => {
			window.clearTimeout(timer);
		};
	}, [normalizedQuery]);

	const results = useMemo(() => {
		if (normalizedQuery === "" || debouncedQuery === "") {
			return [];
		}
		const files = app.vault.getMarkdownFiles();
		const lowerQuery = debouncedQuery.toLowerCase();
		return files.filter((file) => file.path.toLowerCase().includes(lowerQuery));
	}, [app.vault, debouncedQuery, normalizedQuery]);

	return { query, setQuery, results, searchSettled };
}
