import { SidebarActionsContext } from "@/ui/context";
import { useSidebarActions } from "@/ui/hooks/use-sidebar-actions";
import { renderHook } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

describe("useSidebarActions", () => {
	it("returns context value when used within provider", () => {
		const value = { openInArticle: vi.fn() };
		const wrapper = ({ children }: { children: React.ReactNode }) =>
			React.createElement(SidebarActionsContext.Provider, { value }, children);

		const { result } = renderHook(() => useSidebarActions(), { wrapper });
		expect(result.current).toBe(value);
	});

	it("throws when used outside of provider", () => {
		expect(() => renderHook(() => useSidebarActions())).toThrow(
			"useSidebarActions must be used within SidebarActionsContext.Provider",
		);
	});
});
