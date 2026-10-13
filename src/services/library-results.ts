import type { SearchResult } from "@/types/plugin";

export type LibrarySort = "updated" | "title-asc" | "title-desc";

export interface LibraryResultOptions {
	tag: string;
	folder: string;
	sort: LibrarySort;
}

export function filterAndSortLibraryResults(
	results: SearchResult[],
	options: LibraryResultOptions,
): SearchResult[] {
	return results
		.filter(
			(result) =>
				(!options.tag || result.tags?.includes(options.tag)) &&
				(!options.folder || (result.folder ?? "/") === options.folder),
		)
		.toSorted((a, b) => {
			if (options.sort === "title-asc") return a.file.basename.localeCompare(b.file.basename);
			if (options.sort === "title-desc") return b.file.basename.localeCompare(a.file.basename);
			return (b.modifiedTime ?? 0) - (a.modifiedTime ?? 0);
		});
}
