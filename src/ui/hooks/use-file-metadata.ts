import type { CachedMetadata, TFile } from "obsidian";
import { useCallback, useEffect, useReducer } from "react";
import { useApp } from "./use-app";

export interface FileMetadata {
	title: string;
	path: string;
	frontmatter: Record<string, unknown>;
}

export interface UseFileMetadataReturn {
	metadata: FileMetadata | null;
	refresh: () => void;
}

function extractFrontmatter(cache: CachedMetadata | null): Record<string, unknown> {
	if (!cache?.frontmatter) {
		return {};
	}
	const { position: _, ...rest } = cache.frontmatter;
	return rest;
}

function buildMetadata(file: TFile, cache: CachedMetadata | null): FileMetadata {
	return {
		title: file.basename,
		path: file.path,
		frontmatter: extractFrontmatter(cache),
	};
}

export function useFileMetadata(file: TFile | null): UseFileMetadataReturn {
	const { app } = useApp();
	const [revision, bump] = useReducer((n: number) => n + 1, 0);

	const metadata: FileMetadata | null =
		file === null ? null : buildMetadata(file, app.metadataCache.getFileCache(file));

	void revision;

	useEffect(() => {
		if (!file) {
			return;
		}

		const ref = app.metadataCache.on("changed", (changedFile: TFile) => {
			if (changedFile.path === file.path) {
				bump();
			}
		});

		return () => {
			app.metadataCache.offref(ref);
		};
	}, [app.metadataCache, file]);

	const refresh = useCallback(() => {
		bump();
	}, []);

	return { metadata, refresh };
}
