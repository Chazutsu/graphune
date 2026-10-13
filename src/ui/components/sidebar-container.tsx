import type { SidebarTab } from "@/types/plugin";
import {
	ArticleViewerPanel,
	type ArticleViewerPanelHandle,
} from "@/ui/components/article-viewer-panel";
import { CanvasSearchPanel } from "@/ui/components/canvas-search-panel";
import { HeadingExplorer } from "@/ui/components/heading-explorer";
import { SidebarTabs } from "@/ui/components/sidebar-tabs";
import { SidebarActionsContext } from "@/ui/context";
import { CanvasStateProvider, useActiveCanvasState } from "@/ui/hooks/use-canvas-state";
import type React from "react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useId,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

interface SidebarContainerProps {
	children?: React.ReactNode;
}

export interface SidebarContainerHandle {
	openFile: (filePath: string, options?: { focusTitle?: boolean; headingLine?: number }) => void;
}

export const SidebarContainer = forwardRef<SidebarContainerHandle, SidebarContainerProps>(
	function SidebarContainerInner({ children }, ref): React.ReactElement {
		const [activeTab, setActiveTab] = useState<SidebarTab>("card-library");
		const panelRef = useRef<ArticleViewerPanelHandle>(null);
		const idPrefix = `heptabase-${useId().replaceAll(":", "")}`;

		const handleTabChange = useCallback((tab: SidebarTab) => {
			setActiveTab(tab);
		}, []);

		const openInArticle = useCallback(
			(filePath: string, options?: { focusTitle?: boolean; headingLine?: number }) => {
				setActiveTab("article-viewer");
				panelRef.current?.selectFile(filePath, options);
			},
			[],
		);

		useImperativeHandle(ref, () => ({ openFile: openInArticle }), [openInArticle]);

		return (
			<SidebarActionsContext.Provider value={{ openInArticle }}>
				<CanvasStateProvider>
					<CanvasSelectionTabBridge onSelectCard={() => setActiveTab("canvas-search")} />
					<div className="heptabase-shell h-full flex flex-col">
						<SidebarTabs idPrefix={idPrefix} activeTab={activeTab} onTabChange={handleTabChange} />
						<div className="heptabase-panels flex-1 min-h-0">
							<div
								id={`${idPrefix}-panel-card-library`}
								role="tabpanel"
								aria-labelledby={`${idPrefix}-tab-card-library`}
								aria-hidden={activeTab !== "card-library"}
								tabIndex={0}
								data-tab-panel="card-library"
								className={`heptabase-panel overflow-hidden ${activeTab === "card-library" ? "is-active" : ""}`}
							>
								<HeadingExplorer />
							</div>
							<div
								id={`${idPrefix}-panel-article-viewer`}
								role="tabpanel"
								aria-labelledby={`${idPrefix}-tab-article-viewer`}
								aria-hidden={activeTab !== "article-viewer"}
								tabIndex={0}
								data-tab-panel="article-viewer"
								className={`heptabase-panel overflow-hidden ${activeTab === "article-viewer" ? "is-active" : ""}`}
							>
								<ArticleViewerPanel ref={panelRef} />
							</div>
							<div
								id={`${idPrefix}-panel-canvas-search`}
								role="tabpanel"
								aria-labelledby={`${idPrefix}-tab-canvas-search`}
								aria-hidden={activeTab !== "canvas-search"}
								tabIndex={0}
								data-tab-panel="canvas-search"
								className={`heptabase-panel overflow-hidden ${activeTab === "canvas-search" ? "is-active" : ""}`}
							>
								<CanvasSearchPanel onOpenArticle={openInArticle} />
							</div>
						</div>
						{children}
					</div>
				</CanvasStateProvider>
			</SidebarActionsContext.Provider>
		);
	},
);

function CanvasSelectionTabBridge({ onSelectCard }: { onSelectCard: () => void }): null {
	const { selectedPaths } = useActiveCanvasState();
	const signature = Array.from(selectedPaths).toSorted().join("\u0000");
	const previousSignature = useRef("");

	useEffect(() => {
		if (signature && signature !== previousSignature.current) onSelectCard();
		previousSignature.current = signature;
	}, [onSelectCard, signature]);

	return null;
}
