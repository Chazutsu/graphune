import type { GraphuneSettings } from "@/types/settings";
import type { CanvasOperator } from "@/services/canvas-operator";
import type { CanvasObserver } from "@/services/canvas-observer";
import type { App } from "obsidian";
import { createContext } from "react";

export interface PluginContextValue {
	app: App;
	settings: GraphuneSettings;
	canvasOperator?: CanvasOperator;
	canvasObserver?: CanvasObserver;
}

export const PluginContext = createContext<PluginContextValue | null>(null);

export interface SidebarActionsValue {
	openInArticle: (
		filePath: string,
		options?: { focusTitle?: boolean; headingLine?: number },
	) => void;
}

export const SidebarActionsContext = createContext<SidebarActionsValue | null>(null);
