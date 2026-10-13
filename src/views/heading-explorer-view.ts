import type { GraphuneSettings } from "@/types/settings";
import { subscribeLocaleChange, t } from "@/i18n";
import { CanvasOperator } from "@/services/canvas-operator";
import { CanvasObserver } from "@/services/canvas-observer";
import { SidebarContainer, type SidebarContainerHandle } from "@/ui/components/sidebar-container";
import type { PluginContextValue } from "@/ui/context";
import { PluginContext } from "@/ui/context";
import type { App } from "obsidian";
import { ItemView, type WorkspaceLeaf } from "obsidian";
import React from "react";
import { type Root, createRoot } from "react-dom/client";

export const VIEW_TYPE_HEADING_EXPLORER = "heading-explorer-view";

export class HeadingExplorerView extends ItemView {
	private root: Root | null = null;
	private sidebarHandle: SidebarContainerHandle | null = null;
	private unsubscribeLocale: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly appInstance: App,
		private settings: GraphuneSettings,
		private canvasOperator = new CanvasOperator(appInstance, settings),
		private canvasObserver = new CanvasObserver(appInstance),
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_HEADING_EXPLORER;
	}

	getDisplayText(): string {
		return t("view.headingExplorer");
	}

	getIcon(): string {
		return "layout-grid";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();

		this.root = createRoot(container);
		this.render();
		this.unsubscribeLocale?.();
		this.unsubscribeLocale = subscribeLocaleChange(() => this.render());
	}

	updateContext(
		settings: GraphuneSettings,
		canvasOperator: CanvasOperator,
		canvasObserver: CanvasObserver,
	): void {
		this.settings = settings;
		this.canvasOperator = canvasOperator;
		this.canvasObserver = canvasObserver;
		this.render();
	}

	openFile(filePath: string, options?: { focusTitle?: boolean }): void {
		this.sidebarHandle?.openFile(filePath, options);
	}

	async onClose(): Promise<void> {
		this.unsubscribeLocale?.();
		this.unsubscribeLocale = null;
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.sidebarHandle = null;
	}

	private render(): void {
		const contextValue: PluginContextValue = {
			app: this.appInstance,
			settings: this.settings,
			canvasOperator: this.canvasOperator,
			canvasObserver: this.canvasObserver,
		};
		this.root?.render(
			React.createElement(
				PluginContext.Provider,
				{ value: contextValue },
				React.createElement(SidebarContainer, {
					ref: (handle: SidebarContainerHandle | null) => {
						this.sidebarHandle = handle;
					},
				}),
			),
		);
	}
}
