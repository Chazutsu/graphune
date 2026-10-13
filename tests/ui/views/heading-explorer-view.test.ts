import { DEFAULT_SETTINGS } from "@/types/settings";
import { HeadingExplorerView, VIEW_TYPE_HEADING_EXPLORER } from "@/views/heading-explorer-view";
import React from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-dom/client", () => ({
	createRoot: vi.fn().mockReturnValue({
		render: vi.fn(),
		unmount: vi.fn(),
	}),
}));

vi.mock("react", () => ({
	default: {
		createElement: vi.fn(),
	},
	createElement: vi.fn(),
	createContext: vi.fn().mockReturnValue({}),
	forwardRef: vi.fn((render: unknown) => render),
	memo: vi.fn((component: unknown) => component),
}));

function createMockLeaf() {
	return {} as never;
}

function createMockApp() {
	return { vault: {}, workspace: {}, metadataCache: {} } as never;
}

function createView(): HeadingExplorerView {
	const view = new HeadingExplorerView(createMockLeaf(), createMockApp(), DEFAULT_SETTINGS);
	delete (view as Record<string, unknown>).onOpen;
	delete (view as Record<string, unknown>).onClose;
	return view;
}

describe("HeadingExplorerView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("has correct VIEW_TYPE constant", () => {
		expect(VIEW_TYPE_HEADING_EXPLORER).toBe("heading-explorer-view");
	});

	it("getViewType returns the VIEW_TYPE constant", () => {
		const view = createView();
		expect(view.getViewType()).toBe(VIEW_TYPE_HEADING_EXPLORER);
	});

	it("getDisplayText returns Heading Explorer", () => {
		const view = createView();
		expect(view.getDisplayText()).toBe("Heading Explorer");
	});

	it("getIcon returns layout-grid", () => {
		const view = createView();
		expect(view.getIcon()).toBe("layout-grid");
	});

	it("onOpen creates root and renders into content container", async () => {
		const mockRoot = { render: vi.fn(), unmount: vi.fn() };
		(createRoot as ReturnType<typeof vi.fn>).mockReturnValue(mockRoot);

		const view = createView();
		await view.onOpen();

		const contentContainer = view.containerEl.children[1];
		expect(createRoot).toHaveBeenCalledWith(contentContainer);
		expect(mockRoot.render).toHaveBeenCalledOnce();
	});

	it("updateContext re-renders an open view with the latest dependencies", async () => {
		const mockRoot = { render: vi.fn(), unmount: vi.fn() };
		(createRoot as ReturnType<typeof vi.fn>).mockReturnValue(mockRoot);
		const view = createView();
		await view.onOpen();
		const settings = { ...DEFAULT_SETTINGS, defaultNodeWidth: 650 };
		const canvasOperator = {} as never;
		const canvasObserver = {} as never;

		view.updateContext(settings, canvasOperator, canvasObserver);

		expect(mockRoot.render).toHaveBeenCalledTimes(2);
		const providerCall = (React.createElement as ReturnType<typeof vi.fn>).mock.calls.at(-1);
		expect(providerCall?.[1]?.value).toEqual({
			app: expect.anything(),
			settings,
			canvasOperator,
			canvasObserver,
		});
	});

	it("onClose unmounts root after onOpen", async () => {
		const mockRoot = { render: vi.fn(), unmount: vi.fn() };
		(createRoot as ReturnType<typeof vi.fn>).mockReturnValue(mockRoot);

		const view = createView();
		await view.onOpen();
		await view.onClose();

		expect(mockRoot.unmount).toHaveBeenCalledOnce();
	});

	it("onClose without prior onOpen does not throw", async () => {
		const view = createView();
		await expect(view.onClose()).resolves.toBeUndefined();
	});

	it("onOpen returns early when content container does not exist", async () => {
		const mockRoot = { render: vi.fn(), unmount: vi.fn() };
		(createRoot as ReturnType<typeof vi.fn>).mockReturnValue(mockRoot);

		const view = createView();
		while (view.containerEl.children.length > 1) {
			view.containerEl.removeChild(view.containerEl.lastChild!);
		}

		await view.onOpen();

		expect(createRoot).not.toHaveBeenCalled();
	});
});
