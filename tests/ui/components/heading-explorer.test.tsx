import { HeadingExplorer } from "@/ui/components/heading-explorer";
import type { PluginContextValue } from "@/ui/context";
import { PluginContext } from "@/ui/context";
import { CanvasStateProvider } from "@/ui/hooks/use-canvas-state";
import { render, screen } from "@testing-library/react";
import { App } from "obsidian";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/ui/hooks/use-note-search", () => ({
	useNoteSearch: vi.fn().mockReturnValue({
		query: "",
		results: [],
		isSearching: false,
		setQuery: vi.fn(),
	}),
}));

function renderWithContext() {
	const app = new App();
	app.vault.getMarkdownFiles = vi.fn().mockReturnValue([]);
	const contextValue: PluginContextValue = {
		app: app as never,
		settings: {
			extractedFilesFolder: "",
			defaultNodeWidth: 400,
			defaultNodeHeight: 300,
			fileNamePrefix: "",
			defaultEdgeColor: "",
			defaultEdgeLabel: "",
			enableEdgeSync: true,
			quickCardDefaultTitle: "Untitled",
			showPreviewBeforeCreate: false,
		},
	};
	return render(
		<PluginContext.Provider value={contextValue}>
			<CanvasStateProvider>
				<HeadingExplorer />
			</CanvasStateProvider>
		</PluginContext.Provider>,
	);
}

describe("HeadingExplorer", () => {
	it("renders the search bar", () => {
		renderWithContext();
		expect(screen.getByPlaceholderText("Search cards...")).toBeDefined();
	});

	it("renders a root container with panel layout classes", () => {
		const { container } = renderWithContext();
		expect(container.querySelector(".heptabase-library.p-2.h-full")).not.toBeNull();
	});

	it("does not render selection mode UI", () => {
		renderWithContext();
		expect(screen.queryByText("Select")).toBeNull();
		expect(screen.queryByText("Done")).toBeNull();
	});
});
