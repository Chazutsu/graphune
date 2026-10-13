import { SidebarContainer } from "@/ui/components/sidebar-container";
import { SidebarActionsContext } from "@/ui/context";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { App, TFile } from "obsidian";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";
import { createMockCanvasView } from "../../helpers/create-mock-canvas-view";

vi.mock("@/ui/components/heading-explorer", () => ({
	HeadingExplorer: () => <div data-testid="heading-explorer" />,
}));

function SidebarContextTypeConsumer() {
	const contextValue = React.useContext(SidebarActionsContext);
	return <span data-testid="sidebar-actions-context">{typeof contextValue.openInArticle}</span>;
}

function OpenArticleConsumer() {
	const contextValue = React.useContext(SidebarActionsContext);
	return (
		<button type="button" onClick={() => contextValue.openInArticle("notes/test.md")}>
			Open test article
		</button>
	);
}

describe("SidebarContainer", () => {
	let app: App;

	beforeEach(() => {
		app = new App();
	});

	it("renders sidebar tabs", () => {
		render(<SidebarContainer />, { wrapper: createWrapper(app) });
		expect(screen.getByText("Sources")).toBeDefined();
		expect(screen.getByText("Note")).toBeDefined();
		expect(screen.getByText("Workspace")).toBeDefined();
		expect(screen.getByRole("tablist", { name: "Heading Explorer views" })).toBeDefined();
		expect(screen.getByRole("tab", { name: "Sources" }).getAttribute("aria-selected")).toBe("true");
	});

	it("shares one Canvas polling loop across all mounted tabs", () => {
		const setTimeoutSpy = vi.spyOn(window, "setTimeout");
		render(<SidebarContainer />, { wrapper: createWrapper(app) });

		const canvasPolls = setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 250);
		expect(canvasPolls).toHaveLength(1);
		setTimeoutSpy.mockRestore();
	});

	it("gives each mounted sidebar unique ARIA ids and keeps keyboard focus local", () => {
		const first = render(<SidebarContainer />, { wrapper: createWrapper(app) });
		const second = render(<SidebarContainer />, { wrapper: createWrapper(app) });
		const firstTabs = first.container.querySelectorAll<HTMLElement>("[role='tab']");
		const secondTabs = second.container.querySelectorAll<HTMLElement>("[role='tab']");

		expect(firstTabs[0]?.id).not.toBe(secondTabs[0]?.id);
		expect(firstTabs[0]?.getAttribute("aria-controls")).not.toBe(
			secondTabs[0]?.getAttribute("aria-controls"),
		);

		firstTabs[0]?.focus();
		fireEvent.keyDown(firstTabs[0]!, { key: "ArrowRight" });

		expect(document.activeElement).toBe(firstTabs[1]);
		expect(document.activeElement).not.toBe(secondTabs[1]);
	});

	it("switches tabs with horizontal keyboard navigation", () => {
		const { container } = render(<SidebarContainer />, { wrapper: createWrapper(app) });
		fireEvent.keyDown(screen.getByRole("tab", { name: "Sources" }), { key: "ArrowRight" });

		const cardLibrary = container.querySelector("[data-tab-panel='card-library']") as HTMLElement;
		const article = container.querySelector("[data-tab-panel='article-viewer']") as HTMLElement;
		expect(cardLibrary.classList.contains("is-active")).toBe(false);
		expect(article.classList.contains("is-active")).toBe(true);
		expect(cardLibrary.getAttribute("aria-hidden")).toBe("true");
	});

	it("shows Card Library panel by default and hides Article panel", () => {
		const { container } = render(<SidebarContainer />, { wrapper: createWrapper(app) });
		const panels = container.querySelectorAll("[data-tab-panel]");
		expect(panels).toHaveLength(3);

		const cardLibrary = container.querySelector("[data-tab-panel='card-library']") as HTMLElement;
		const article = container.querySelector("[data-tab-panel='article-viewer']") as HTMLElement;
		expect(cardLibrary.classList.contains("is-active")).toBe(true);
		expect(article.classList.contains("is-active")).toBe(false);
	});

	it("switches to Canvas search panel", () => {
		const { container } = render(<SidebarContainer />, { wrapper: createWrapper(app) });

		fireEvent.click(screen.getByText("Workspace"));

		const canvas = container.querySelector("[data-tab-panel='canvas-search']") as HTMLElement;
		expect(canvas.classList.contains("is-active")).toBe(true);
		expect(screen.getByText("No Canvas is open")).toBeDefined();
	});

	it("reveals Canvas context when a different file card is selected", async () => {
		const file = new TFile("notes/Selected.md");
		const canvasView = createMockCanvasView([
			{ id: "selected", x: 0, y: 0, width: 200, height: 120, file },
		]);
		canvasView.canvas.getData = vi.fn().mockReturnValue({
			nodes: [
				{
					id: "selected",
					type: "file",
					file: file.path,
					x: 0,
					y: 0,
					width: 200,
					height: 120,
				},
			],
			edges: [],
		});
		app.workspace.getLeavesOfType = vi.fn().mockReturnValue([{ view: canvasView }]);
		app.vault.getAbstractFileByPath = vi.fn().mockReturnValue(file);
		app.vault.getFiles = vi.fn().mockReturnValue([file]);

		const { container } = render(<SidebarContainer />, { wrapper: createWrapper(app) });
		await act(async () => {
			await Promise.resolve();
		});

		const canvas = container.querySelector("[data-tab-panel='canvas-search']") as HTMLElement;
		expect(canvas.classList.contains("is-active")).toBe(true);
		expect(screen.getByLabelText("Selected card context")).toBeDefined();
	});

	it("switches to Article panel when Article tab is clicked", () => {
		const { container } = render(<SidebarContainer />, { wrapper: createWrapper(app) });

		fireEvent.click(screen.getByText("Note"));

		const cardLibrary = container.querySelector("[data-tab-panel='card-library']") as HTMLElement;
		const article = container.querySelector("[data-tab-panel='article-viewer']") as HTMLElement;
		expect(cardLibrary.classList.contains("is-active")).toBe(false);
		expect(article.classList.contains("is-active")).toBe(true);
	});

	it("switches back to Card Library when Card Library tab is clicked", () => {
		const { container } = render(<SidebarContainer />, { wrapper: createWrapper(app) });

		fireEvent.click(screen.getByText("Note"));
		fireEvent.click(screen.getByText("Sources"));

		const cardLibrary = container.querySelector("[data-tab-panel='card-library']") as HTMLElement;
		const article = container.querySelector("[data-tab-panel='article-viewer']") as HTMLElement;
		expect(cardLibrary.classList.contains("is-active")).toBe(true);
		expect(article.classList.contains("is-active")).toBe(false);
	});

	it("keeps both panels mounted across tab switches", () => {
		render(<SidebarContainer />, { wrapper: createWrapper(app) });

		expect(screen.getByTestId("heading-explorer")).toBeDefined();
		expect(screen.getByPlaceholderText("Search articles...")).toBeDefined();

		fireEvent.click(screen.getByText("Note"));
		expect(screen.getByTestId("heading-explorer")).toBeDefined();
		expect(screen.getByPlaceholderText("Search articles...")).toBeDefined();
	});

	it("applies flex column layout", () => {
		const { container } = render(<SidebarContainer />, { wrapper: createWrapper(app) });
		expect(container.querySelector(".h-full.flex.flex-col")).not.toBeNull();
	});

	it("provides SidebarActionsContext", () => {
		render(
			<SidebarContainer>
				<SidebarContextTypeConsumer />
			</SidebarContainer>,
			{ wrapper: createWrapper(app) },
		);

		expect(screen.getByTestId("sidebar-actions-context").textContent).toBe("function");
	});

	it("switches to article-viewer tab when openInArticle is called", () => {
		const { container } = render(
			<SidebarContainer>
				<OpenArticleConsumer />
			</SidebarContainer>,
			{ wrapper: createWrapper(app) },
		);

		fireEvent.click(screen.getByRole("button", { name: "Open test article" }));

		const article = container.querySelector("[data-tab-panel='article-viewer']") as HTMLElement;
		expect(article.classList.contains("is-active")).toBe(true);
	});
});
