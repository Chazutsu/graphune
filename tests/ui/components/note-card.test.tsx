import type { NoteDragData } from "@/types/plugin";
import type { ParsedHeading, TextSelectionDragData } from "@/types/plugin";
import { createContentFingerprint } from "@/services/content-fingerprint";
import { NoteCard } from "@/ui/components/note-card";
import type { SidebarActionsValue } from "@/ui/context";
import { fireEvent, render, screen } from "@testing-library/react";
import { App, Component, MarkdownRenderer, Menu, Notice, TFile } from "obsidian";
import React from "react";
import { type Mock, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

const expandTools = () =>
	fireEvent.click(screen.getByRole("button", { name: "Headings & Canvas" }));

describe("NoteCard", () => {
	const file = new TFile("my-note.md");
	const excerpt = "First line of content\nSecond line\nThird line";
	const wrapper = createWrapper();
	const headings: ParsedHeading[] = [
		{
			heading: "Setup",
			level: 2,
			position: {
				start: { line: 2, col: 0, offset: 0 },
				end: { line: 2, col: 8, offset: 8 },
			},
		},
	];
	it("renders the note name (basename)", () => {
		render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		expect(screen.getByText("my-note")).toBeDefined();
	});

	it("marks a card that is selected on the current Canvas", () => {
		const { container } = render(
			<NoteCard file={file} excerpt={excerpt} isInCanvas isCanvasSelected />,
			{ wrapper },
		);
		const card = container.querySelector(".heptabase-note-card");
		expect(card?.classList.contains("is-in-canvas")).toBe(true);
		expect(card?.classList.contains("is-canvas-selected")).toBe(true);
		expect(card?.getAttribute("aria-current")).toBe("true");
		expect(screen.getByLabelText("On current Canvas")).toBeDefined();
	});

	it("highlights a matching title fragment", () => {
		const { container } = render(<NoteCard file={file} excerpt={excerpt} query="note" />, {
			wrapper,
		});
		expect(container.querySelector("mark.heptabase-search-match")?.textContent).toBe("note");
	});

	it("does not repeat a first heading that matches the note title", () => {
		const duplicateHeading = { ...headings[0]!, heading: "my-note" };
		render(<NoteCard file={file} excerpt={excerpt} headings={[duplicateHeading]} />, { wrapper });
		expect(screen.queryByRole("button", { name: "my-note" })).toBeNull();
	});

	it("opens the article from the card title", () => {
		const openInArticle = vi.fn();
		render(<NoteCard file={file} excerpt={excerpt} />, {
			wrapper: createWrapper(undefined, undefined, { openInArticle }),
		});

		fireEvent.click(screen.getByRole("link", { name: "my-note" }));
		expect(openInArticle).toHaveBeenCalledWith("my-note.md");
	});

	it("shows a source update badge that opens the original note", async () => {
		const app = new App();
		const sourceFile = new TFile("source.md");
		const openInArticle = vi.fn();
		(app.metadataCache.getFileCache as Mock).mockImplementation((candidate: TFile) => {
			if (candidate.path === file.path) {
				return {
					frontmatter: {
						"heptabase-source": sourceFile.path,
						"heptabase-source-heading": "Source",
						"heptabase-source-content-hash": createContentFingerprint("## Source\nBefore"),
					},
				};
			}
			return {
				headings: [
					{
						heading: "Source",
						level: 2,
						position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0 } },
					},
				],
			};
		});
		(app.vault.getAbstractFileByPath as Mock).mockReturnValue(sourceFile);
		(app.vault.cachedRead as Mock).mockResolvedValue("## Source\nAfter");

		render(<NoteCard file={file} excerpt={excerpt} />, {
			wrapper: createWrapper(app, undefined, { openInArticle }),
		});

		fireEvent.click(await screen.findByRole("button", { name: "Source updated — open original" }));
		expect(openInArticle).toHaveBeenCalledWith("source.md");
	});

	it("opens the article from the main card surface", () => {
		const openInArticle = vi.fn();
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, {
			wrapper: createWrapper(undefined, undefined, { openInArticle }),
		});

		fireEvent.click(container.querySelector(".heptabase-note-card__excerpt")!);
		expect(openInArticle).toHaveBeenCalledWith("my-note.md");
	});

	it("uses one native link for the card main region", () => {
		const openInArticle = vi.fn();
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, {
			wrapper: createWrapper(undefined, undefined, { openInArticle }),
		});
		const main = screen.getByRole("link", { name: "my-note" });

		expect(main.classList.contains("heptabase-note-card__main")).toBe(true);
		expect(main.getAttribute("href")).toBe("#my-note.md");
		fireEvent.click(container.querySelector(".heptabase-note-card")!);
		expect(openInArticle).not.toHaveBeenCalled();
	});

	it("renders excerpt container when excerpt is provided", () => {
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		const excerptEl = container.querySelector(".card-fade");
		expect(excerptEl).not.toBeNull();
	});

	it("keeps secondary actions collapsed and limits visible tags", () => {
		const app = new App();
		(app.vault.cachedRead as Mock).mockReturnValue(new Promise(() => undefined));
		render(
			<NoteCard
				file={file}
				excerpt={excerpt}
				headings={headings}
				tags={["one", "two", "three", "four"]}
			/>,
			{ wrapper: createWrapper(app) },
		);

		expect(screen.getByRole("button", { name: "Add to Canvas" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "Setup" })).toBeNull();
		expect(screen.getByText("#one")).toBeDefined();
		expect(screen.getByText("#two")).toBeDefined();
		expect(screen.queryByText("#three")).toBeNull();
		expect(screen.getByText("+2")).toBeDefined();

		expandTools();
		expect(screen.getByRole("button", { name: "Add to Canvas" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Setup" })).toBeDefined();
	});

	it("calls MarkdownRenderer.render for excerpt", async () => {
		vi.mocked(MarkdownRenderer.render).mockClear();
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		await vi.waitFor(() => {
			expect(MarkdownRenderer.render).toHaveBeenCalledWith(
				expect.anything(),
				excerpt,
				expect.any(HTMLElement),
				file.path,
				expect.anything(),
			);
		});
		expect(container.querySelector(".card-fade")).not.toBeNull();
		expect(Component.lastInstance?.load).toHaveBeenCalledOnce();
	});

	it("unloads the markdown component when the card leaves the view", async () => {
		const { unmount } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		await vi.waitFor(() => expect(Component.lastInstance?.load).toHaveBeenCalledOnce());
		const component = Component.lastInstance;

		unmount();

		expect(component?.unload).toHaveBeenCalledOnce();
	});

	it("falls back to readable text when markdown rendering fails", async () => {
		vi.mocked(MarkdownRenderer.render).mockRejectedValueOnce(new Error("render failed"));
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });

		await vi.waitFor(() => {
			expect(container.querySelector(".card-fade")?.textContent).toBe(excerpt);
		});
	});

	it("does not let a stale markdown render replace a newer excerpt", async () => {
		let finishFirstRender: (() => void) | undefined;
		const firstRender = new Promise<void>((resolve) => {
			finishFirstRender = resolve;
		});
		vi.mocked(MarkdownRenderer.render)
			.mockImplementationOnce(async (_app, markdown, element) => {
				await firstRender;
				element.textContent = markdown;
			})
			.mockImplementationOnce(async (_app, markdown, element) => {
				element.textContent = markdown;
			});

		const { container, rerender } = render(<NoteCard file={file} excerpt="Older excerpt" />, {
			wrapper,
		});
		rerender(<NoteCard file={file} excerpt="Newest excerpt" />);

		await vi.waitFor(() => {
			expect(container.querySelector(".card-fade")?.textContent).toBe("Newest excerpt");
		});
		finishFirstRender?.();
		await firstRender;

		expect(container.querySelector(".card-fade")?.textContent).toBe("Newest excerpt");
	});

	it("does not render excerpt div when excerpt is empty", () => {
		const { container } = render(<NoteCard file={file} excerpt="" />, { wrapper });
		expect(container.querySelector(".card-fade")).toBeNull();
	});

	it("reserves excerpt space while initial content is hydrating", () => {
		const { container } = render(<NoteCard file={file} excerpt="" isHydrating />, {
			wrapper,
		});

		const loadingExcerpt = container.querySelector(".heptabase-note-card__excerpt.is-loading");
		expect(loadingExcerpt).not.toBeNull();
		expect(loadingExcerpt?.getAttribute("aria-hidden")).toBe("true");
	});

	it("has draggable attribute", () => {
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		const card = container.querySelector("[draggable]");
		expect(card?.getAttribute("draggable")).toBe("true");
		expect(card?.classList.contains("heptabase-note-card__drag-handle")).toBe(true);
		expect(card?.tagName).toBe("SPAN");
		expect(card?.getAttribute("aria-hidden")).toBe("true");
		expect(container.querySelector(".heptabase-note-card")?.hasAttribute("draggable")).toBe(false);
	});

	it("offers a separate button as the keyboard alternative to dragging", () => {
		const app = new App();
		const mockCanvas = {
			tx: 0,
			ty: 0,
			tZoom: 1,
			getData: vi.fn(() => ({ nodes: [], edges: [] })),
			setData: vi.fn(),
			requestSave: vi.fn(),
			createFileNode: vi.fn(() => ({ id: "handle-node" })),
		};
		(app.workspace.getLeavesOfType as Mock).mockReturnValue([{ view: { canvas: mockCanvas } }]);

		render(<NoteCard file={file} excerpt={excerpt} />, { wrapper: createWrapper(app) });
		const dragHandle = document.querySelector(".heptabase-note-card__drag-handle");
		expect(dragHandle).not.toBeNull();
		expect(dragHandle!.tagName).toBe("SPAN");
		fireEvent.click(screen.getByRole("button", { name: "Add to Canvas" }));

		expect(mockCanvas.createFileNode).toHaveBeenCalledWith(
			expect.objectContaining({ file, save: true }),
		);
	});

	it("sets NoteDragData on drag start", () => {
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		const card = container.querySelector("[draggable]");

		let capturedData: NoteDragData | null = null;
		const dataTransfer = {
			setData: (_type: string, data: string) => {
				capturedData = JSON.parse(data);
			},
			effectAllowed: "",
		};

		expect(card).not.toBeNull();
		if (card) {
			fireEvent.dragStart(card, { dataTransfer });
		}

		expect(capturedData).not.toBeNull();
		expect(capturedData!.type).toBe("note-drag");
		expect(capturedData!.filePath).toBe("my-note.md");
	});

	it("renders draggable heading items with extracted section data", async () => {
		const app = new App();
		(app.vault.cachedRead as Mock).mockResolvedValue(
			"# Note\n\n## Setup\n\nInstall it.\n\n## Next\n\nDone.",
		);
		const { container } = render(<NoteCard file={file} excerpt={excerpt} headings={headings} />, {
			wrapper: createWrapper(app),
		});
		expandTools();

		const heading = await screen.findByRole("button", { name: "Setup" });
		let capturedData: TextSelectionDragData | null = null;
		fireEvent.dragStart(heading.closest("[draggable]"), {
			dataTransfer: {
				setData: (_type: string, data: string) => {
					capturedData = JSON.parse(data);
				},
				setDragImage: () => {},
				effectAllowed: "",
			},
		});

		expect(container.querySelectorAll("[draggable]")).toHaveLength(2);
		expect(capturedData).toMatchObject({
			type: "text-selection-drag",
			filePath: "my-note.md",
			title: "Setup",
			selectedText: "## Setup\n\nInstall it.",
		});
	});

	it("exposes the source heading as a native keyboard button", async () => {
		const openInArticle = vi.fn();
		render(<NoteCard file={file} excerpt={excerpt} headings={headings} />, {
			wrapper: createWrapper(undefined, undefined, { openInArticle }),
		});
		expandTools();

		const heading = await screen.findByRole("button", { name: "Setup" });
		expect(heading.tagName).toBe("BUTTON");
		heading.focus();
		expect(document.activeElement).toBe(heading);
	});

	it("opens the source article when a heading is clicked", async () => {
		const openInArticle = vi.fn();
		render(<NoteCard file={file} excerpt={excerpt} headings={headings} />, {
			wrapper: createWrapper(undefined, undefined, { openInArticle }),
		});
		expandTools();

		const heading = await screen.findByRole("button", { name: "Setup" });
		fireEvent.click(heading);

		expect(openInArticle).toHaveBeenCalledWith("my-note.md", { headingLine: 2 });
	});

	it("progressively reveals long heading lists", () => {
		const app = new App();
		(app.vault.cachedRead as Mock).mockReturnValue(new Promise(() => undefined));
		const longHeadings = Array.from(
			{ length: 5 },
			(_, index): ParsedHeading => ({
				heading: `Section ${index + 1}`,
				level: 2,
				position: {
					start: { line: index + 1, col: 0, offset: index * 10 },
					end: { line: index + 1, col: 10, offset: index * 10 + 10 },
				},
			}),
		);

		render(<NoteCard file={file} excerpt={excerpt} headings={longHeadings} />, {
			wrapper: createWrapper(app),
		});
		expandTools();

		expect(screen.queryByText("Section 4")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "3 more" }));
		expect(screen.getByText("Section 4")).toBeDefined();
		expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe(
			"true",
		);
	});

	it("preserves heading level when content is not loaded yet", async () => {
		const app = new App();
		render(<NoteCard file={file} excerpt={excerpt} headings={headings} />, {
			wrapper: createWrapper(app),
		});
		expandTools();
		const heading = await screen.findByRole("button", { name: "Setup" });
		let capturedData: TextSelectionDragData | null = null;
		fireEvent.dragStart(heading.closest("[draggable]"), {
			dataTransfer: {
				setData: (_type: string, data: string) => {
					capturedData = JSON.parse(data);
				},
				setDragImage: () => {},
				effectAllowed: "",
			},
		});

		expect(capturedData?.selectedText).toBe("## Setup");
		fireEvent.dragEnd(heading.closest("[draggable]"));
	});

	it("applies opacity while dragging", () => {
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		const handle = container.querySelector("[draggable]");
		const card = container.querySelector(".heptabase-note-card");

		expect(handle).not.toBeNull();
		expect(card).not.toBeNull();
		if (handle && card) {
			fireEvent.dragStart(handle, {
				dataTransfer: { setData: () => {}, effectAllowed: "" },
			});
			expect(card.classList.contains("is-dragging")).toBe(true);

			fireEvent.dragEnd(handle);
			expect(card.classList.contains("is-dragging")).toBe(false);
		}
	});

	it("has card styling with border", () => {
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		const card = container.querySelector(".border");
		expect(card).not.toBeNull();
	});

	it("uses the emphasized two-line title surface", () => {
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		const title = container.querySelector(".heptabase-note-card__title");
		expect(title).not.toBeNull();
		expect(title!.classList.contains("font-medium")).toBe(true);
		expect(title!.classList.contains("truncate")).toBe(false);
	});

	it("uses subtle border with hover highlight", () => {
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		const card = container.querySelector(".heptabase-note-card");
		expect(card!.classList.contains("border-hb-border-subtle")).toBe(true);
		expect(card!.classList.contains("heptabase-note-card")).toBe(true);
	});

	it("uses the stable card interaction surface", () => {
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		const card = container.querySelector(".heptabase-note-card");
		expect(card!.classList.contains("heptabase-note-card")).toBe(true);
		expect(card!.classList.toString()).not.toContain("translate");
	});

	it("shows context menu on right click", () => {
		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, { wrapper });
		const card = container.querySelector("[draggable]")!;

		fireEvent.contextMenu(card);

		const menu = Menu.lastInstance!;
		expect(menu.addItem).toHaveBeenCalledTimes(2);
		expect(menu.showAtMouseEvent).toHaveBeenCalled();
	});

	it("adds file to canvas via context menu", () => {
		const app = new App();
		const canvasData = { nodes: [], edges: [] };
		const mockCanvas = {
			tx: 0,
			ty: 0,
			tZoom: 1,
			getData: vi.fn(() => canvasData),
			setData: vi.fn(),
			requestSave: vi.fn(),
			createFileNode: vi.fn(() => ({ id: "new-node" })),
		};
		(app.workspace.getLeavesOfType as Mock).mockReturnValue([{ view: { canvas: mockCanvas } }]);

		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, {
			wrapper: createWrapper(app),
		});
		const card = container.querySelector("[draggable]")!;

		fireEvent.contextMenu(card);

		const menu = Menu.lastInstance!;
		const canvasItem = menu.items[0];
		const onClickCb = (canvasItem.onClick as Mock).mock.calls[0][0];
		onClickCb();

		expect(mockCanvas.createFileNode).toHaveBeenCalledWith(
			expect.objectContaining({
				file,
				save: true,
			}),
		);
	});

	it("adds the note to canvas from the visible keyboard action", () => {
		const app = new App();
		const canvasData = { nodes: [], edges: [] };
		const mockCanvas = {
			tx: 0,
			ty: 0,
			tZoom: 1,
			getData: vi.fn(() => canvasData),
			setData: vi.fn(),
			requestSave: vi.fn(),
			createFileNode: vi.fn(() => ({ id: "keyboard-node" })),
		};
		(app.workspace.getLeavesOfType as Mock).mockReturnValue([{ view: { canvas: mockCanvas } }]);

		render(<NoteCard file={file} excerpt={excerpt} />, {
			wrapper: createWrapper(app),
		});
		fireEvent.click(screen.getByRole("button", { name: "Add to Canvas" }));

		expect(mockCanvas.createFileNode).toHaveBeenCalledWith(
			expect.objectContaining({ file, save: true }),
		);
	});

	it("adds a heading reference to canvas from its keyboard action", async () => {
		const app = new App();
		const canvasData = { nodes: [], edges: [] };
		const mockCanvas = {
			tx: 20,
			ty: -30,
			tZoom: 2,
			getData: vi.fn(() => canvasData),
			setData: vi.fn(),
			requestSave: vi.fn(),
		};
		(app.workspace.getLeavesOfType as Mock).mockReturnValue([{ view: { canvas: mockCanvas } }]);

		render(<NoteCard file={file} excerpt={excerpt} headings={headings} />, {
			wrapper: createWrapper(app),
		});
		expandTools();
		fireEvent.click(await screen.findByRole("button", { name: "Add heading Setup to Canvas" }));

		expect(mockCanvas.setData).toHaveBeenCalledWith(
			expect.objectContaining({
				nodes: [
					expect.objectContaining({
						type: "file",
						file: "my-note.md",
						subpath: "#Setup",
						x: -10,
						y: 15,
					}),
				],
			}),
		);
		expect(mockCanvas.requestSave).toHaveBeenCalledOnce();
	});

	it("shows notice when no canvas is open", () => {
		const app = new App();
		(app.workspace.getLeavesOfType as Mock).mockReturnValue([]);

		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, {
			wrapper: createWrapper(app),
		});
		const card = container.querySelector("[draggable]")!;

		fireEvent.contextMenu(card);

		const menu = Menu.lastInstance!;
		const canvasItem = menu.items[0];
		const onClickCb = (canvasItem.onClick as Mock).mock.calls[0][0];
		onClickCb();

		expect(Notice.lastInstance).not.toBeNull();
		expect(Notice.lastInstance!.message).toBe("No canvas is open");
	});

	it("calls openInArticle via context menu", () => {
		const openInArticle = vi.fn();
		const sidebarActions: SidebarActionsValue = { openInArticle };

		const { container } = render(<NoteCard file={file} excerpt={excerpt} />, {
			wrapper: createWrapper(undefined, undefined, sidebarActions),
		});
		const card = container.querySelector("[draggable]")!;

		fireEvent.contextMenu(card);

		const menu = Menu.lastInstance!;
		const articleItem = menu.items[1];
		const onClickCb = (articleItem.onClick as Mock).mock.calls[0][0];
		onClickCb();

		expect(openInArticle).toHaveBeenCalledWith("my-note.md");
	});
});
