import { DEFAULT_SETTINGS, type GraphuneSettings } from "@/types/settings";
import { CanvasOperator } from "@/services/canvas-operator";
import { CanvasObserver } from "@/services/canvas-observer";
import {
	PluginContext,
	type PluginContextValue,
	SidebarActionsContext,
	type SidebarActionsValue,
} from "@/ui/context";
import { App } from "obsidian";
import type { ReactNode } from "react";
import React from "react";
import { vi } from "vitest";

export function createWrapper(
	app?: App,
	settings?: GraphuneSettings,
	sidebarActions?: SidebarActionsValue,
) {
	const resolvedApp = app ?? new App();
	const resolvedSettings = settings ?? DEFAULT_SETTINGS;
	const contextValue: PluginContextValue = {
		app: resolvedApp,
		settings: resolvedSettings,
		canvasOperator: new CanvasOperator(resolvedApp, resolvedSettings),
		canvasObserver: new CanvasObserver(resolvedApp),
	};
	const actionsValue: SidebarActionsValue = sidebarActions ?? {
		openInArticle: vi.fn(),
	};
	return function Wrapper({ children }: { children: ReactNode }) {
		return React.createElement(
			PluginContext.Provider,
			{ value: contextValue },
			React.createElement(SidebarActionsContext.Provider, { value: actionsValue }, children),
		);
	};
}
