import type { App } from "obsidian";
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { initializeVirtualObsidian } from "virtual-obsidian";

import { DEFAULT_SETTINGS } from "@/types/settings";
import { CanvasOperator } from "@/services/canvas-operator";
import { EditorRecoveryNotice } from "@/ui/components/article-editor";
import { PluginContext } from "@/ui/context";
import { SidebarContainer } from "@/ui/components/sidebar-container";

import { createMockApp } from "./mock-app";
import "../styles.css";

class DevErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
	state = { error: null as Error | null };

	static getDerivedStateFromError(error: Error): { error: Error } {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("Development preview failed", error, info);
	}

	render(): ReactNode {
		if (this.state.error) {
			return (
				<pre className="p-3 whitespace-pre-wrap text-hb-ui-small">
					{this.state.error.stack ?? this.state.error.message}
				</pre>
			);
		}
		return this.props.children;
	}
}

async function main(): Promise<void> {
	await initializeVirtualObsidian("/virtual-obsidian-core.wasm");
	const mockApp = createMockApp() as unknown as App;
	const recoveryFixture = new URLSearchParams(location.search).get("recovery");
	const canvasOperator = new CanvasOperator(mockApp, DEFAULT_SETTINGS);
	const root = document.getElementById("root");
	if (!root) throw new Error("Root element not found");
	createRoot(root).render(
		<PluginContext.Provider value={{ app: mockApp, settings: DEFAULT_SETTINGS, canvasOperator }}>
			<DevErrorBoundary>
				{recoveryFixture ? (
					<div className="heptabase-shell h-full flex flex-col">
						{recoveryFixture === "loading" && <EditorRecoveryNotice status="loading" />}
						{recoveryFixture === "error" && (
							<EditorRecoveryNotice status="error" onRetry={() => undefined} />
						)}
						{recoveryFixture === "recovered" && (
							<EditorRecoveryNotice
								status="recovered"
								draft={{
									value: "# Recovered draft\n\nThis sentence was not saved before Obsidian closed.",
									reason: "conflict",
								}}
								onRestore={() => undefined}
								onDiscard={() => undefined}
							/>
						)}
						<div className="article-editor">
							<h1>Saved note</h1>
							<p>This content is safely stored in the vault.</p>
						</div>
					</div>
				) : (
					<SidebarContainer />
				)}
			</DevErrorBoundary>
		</PluginContext.Provider>,
	);
}

void main();
