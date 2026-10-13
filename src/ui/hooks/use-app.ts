import type { PluginContextValue } from "@/ui/context";
import { PluginContext } from "@/ui/context";
import { useContext } from "react";

export function useApp(): PluginContextValue {
	const context = useContext(PluginContext);
	if (!context) {
		throw new Error("useApp must be used within PluginContext.Provider");
	}
	return context;
}
