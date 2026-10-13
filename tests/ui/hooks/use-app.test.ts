import type { PluginContextValue } from "@/ui/context";
import { PluginContext } from "@/ui/context";
import { useApp } from "@/ui/hooks/use-app";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import React, { Component } from "react";
import { describe, expect, it, vi } from "vitest";

class ErrorBoundary extends Component<
	{ children: ReactNode; onError: (error: Error) => void },
	{ hasError: boolean }
> {
	constructor(props: { children: ReactNode; onError: (error: Error) => void }) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(): { hasError: boolean } {
		return { hasError: true };
	}

	componentDidCatch(error: Error): void {
		this.props.onError(error);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return null;
		}
		return this.props.children;
	}
}

describe("useApp", () => {
	it("returns the value from PluginContext", () => {
		const mockContext: PluginContextValue = {
			app: { vault: {}, workspace: {}, metadataCache: {} } as never,
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
		const wrapper = ({ children }: { children: ReactNode }) =>
			React.createElement(PluginContext.Provider, { value: mockContext }, children);

		const { result } = renderHook(() => useApp(), { wrapper });
		expect(result.current).toBe(mockContext);
	});

	it("throws an error when Context is not provided", () => {
		const errorSpy = vi.fn();
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const wrapper = ({ children }: { children: ReactNode }) =>
			React.createElement(ErrorBoundary, { onError: errorSpy }, children);

		renderHook(() => useApp(), { wrapper });

		expect(errorSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "useApp must be used within PluginContext.Provider",
			}),
		);

		consoleErrorSpy.mockRestore();
	});
});
