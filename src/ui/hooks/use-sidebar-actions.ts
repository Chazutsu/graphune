import type { SidebarActionsValue } from "@/ui/context";
import { SidebarActionsContext } from "@/ui/context";
import { useContext } from "react";

export function useSidebarActions(): SidebarActionsValue {
	const context = useContext(SidebarActionsContext);
	if (!context) {
		throw new Error("useSidebarActions must be used within SidebarActionsContext.Provider");
	}
	return context;
}
