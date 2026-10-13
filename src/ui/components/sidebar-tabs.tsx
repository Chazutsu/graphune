import type { SidebarTab } from "@/types/plugin";
import { t } from "@/i18n";
import type React from "react";
import { useCallback } from "react";

interface SidebarTabsProps {
	idPrefix?: string;
	activeTab: SidebarTab;
	onTabChange: (tab: SidebarTab) => void;
}

const getTabs = (): { id: SidebarTab; label: string }[] => [
	{ id: "card-library", label: t("tabs.library") },
	{ id: "article-viewer", label: t("tabs.article") },
	{ id: "canvas-search", label: t("tabs.canvas") },
];

export function SidebarTabs({
	idPrefix = "heptabase",
	activeTab,
	onTabChange,
}: SidebarTabsProps): React.ReactElement {
	const tabs = getTabs();
	const tabIds = tabs.map((tab) => tab.id);
	return (
		<div
			role="tablist"
			aria-label={t("tabs.label")}
			aria-orientation="horizontal"
			className="heptabase-tabs flex border-b border-hb-border shrink-0"
		>
			{tabs.map((tab) => (
				<TabButton
					key={tab.id}
					id={tab.id}
					idPrefix={idPrefix}
					label={tab.label}
					isActive={activeTab === tab.id}
					onClick={onTabChange}
					tabIds={tabIds}
				/>
			))}
		</div>
	);
}

interface TabButtonProps {
	id: SidebarTab;
	idPrefix: string;
	label: string;
	isActive: boolean;
	onClick: (tab: SidebarTab) => void;
	tabIds: SidebarTab[];
}

function TabButton({
	id,
	idPrefix,
	label,
	isActive,
	onClick,
	tabIds,
}: TabButtonProps): React.ReactElement {
	const handleClick = useCallback(() => {
		onClick(id);
	}, [id, onClick]);
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLButtonElement>) => {
			const currentIndex = tabIds.indexOf(id);
			const nextIndex =
				event.key === "ArrowRight"
					? (currentIndex + 1) % tabIds.length
					: event.key === "ArrowLeft"
						? (currentIndex - 1 + tabIds.length) % tabIds.length
						: event.key === "Home"
							? 0
							: event.key === "End"
								? tabIds.length - 1
								: -1;
			if (nextIndex < 0) return;
			const nextTab = tabIds[nextIndex];
			if (!nextTab) return;
			event.preventDefault();
			onClick(nextTab);
			event.currentTarget
				.closest<HTMLElement>("[role='tablist']")
				?.querySelector<HTMLElement>(`[data-tab-id='${nextTab}']`)
				?.focus();
		},
		[id, onClick, tabIds],
	);

	return (
		<button
			type="button"
			role="tab"
			id={`${idPrefix}-tab-${id}`}
			data-tab-id={id}
			aria-selected={isActive}
			aria-controls={`${idPrefix}-panel-${id}`}
			tabIndex={isActive ? 0 : -1}
			onKeyDown={handleKeyDown}
			className={`heptabase-tab flex-1 px-3 py-1.5 bg-transparent border-none border-b-2 cursor-pointer text-hb-ui-small text-hb-muted ${isActive ? "is-active text-hb-normal border-b-hb-accent" : "border-b-transparent"}`}
			onClick={handleClick}
		>
			{label}
		</button>
	);
}
