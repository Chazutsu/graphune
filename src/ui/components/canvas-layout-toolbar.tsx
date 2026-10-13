import type { CanvasLayoutAction, CanvasOperator } from "@/services/canvas-operator";
import { t } from "@/i18n";
import type { CanvasNode, CanvasView } from "@/types/obsidian-canvas";
import type React from "react";
import { useEffect, useState } from "react";

interface CanvasLayoutToolbarProps {
	canvasView: CanvasView;
	selectedNodes: CanvasNode[];
	canvasOperator: CanvasOperator;
	edgeColor?: string;
	edgeLabel?: string;
	onCanvasChange: () => void;
	mode?: "all" | "selection" | "history";
}

const getActions = (): {
	action: CanvasLayoutAction;
	label: string;
	accessibleLabel: string;
	minimum: number;
	icon: React.ReactNode;
}[] => [
	{
		action: "align-left",
		label: t("toolbar.left"),
		accessibleLabel: t("toolbar.alignLeft"),
		minimum: 2,
		icon: <LayoutGlyph direction="left" />,
	},
	{
		action: "align-top",
		label: t("toolbar.top"),
		accessibleLabel: t("toolbar.alignTop"),
		minimum: 2,
		icon: <LayoutGlyph direction="top" />,
	},
	{
		action: "distribute-horizontal",
		label: t("toolbar.across"),
		accessibleLabel: t("toolbar.distributeHorizontal"),
		minimum: 3,
		icon: <LayoutGlyph direction="horizontal" />,
	},
	{
		action: "distribute-vertical",
		label: t("toolbar.down"),
		accessibleLabel: t("toolbar.distributeVertical"),
		minimum: 3,
		icon: <LayoutGlyph direction="vertical" />,
	},
];

function getSelectionGuidance(count: number): string {
	if (count === 0) return t("toolbar.guidanceNone");
	if (count === 1) return t("toolbar.guidanceOne");
	if (count === 2) return t("toolbar.guidanceTwo");
	return t("toolbar.guidanceMany");
}

export function CanvasLayoutToolbar({
	canvasView,
	selectedNodes,
	canvasOperator,
	edgeColor,
	edgeLabel,
	onCanvasChange,
	mode = "all",
}: CanvasLayoutToolbarProps): React.ReactElement {
	const selectedIds = selectedNodes.map((node) => node.id);
	const [historyState, setHistoryState] = useState(() =>
		canvasOperator.getHistoryState(canvasView.canvas),
	);

	useEffect(() => {
		const update = () => setHistoryState(canvasOperator.getHistoryState(canvasView.canvas));
		update();
		return canvasOperator.onHistoryChange(canvasView.canvas, update);
	}, [canvasOperator, canvasView]);

	const runChange = (change: () => boolean): void => {
		if (change()) onCanvasChange();
	};

	return (
		<section
			className="canvas-layout-toolbar"
			data-has-selection={selectedNodes.length > 0}
			aria-label={t("toolbar.label")}
		>
			{mode !== "selection" && (
				<div className="canvas-layout-toolbar__status" aria-live="polite">
					<span className="sr-only">{t("toolbar.selected", { count: selectedNodes.length })}</span>
					<span className="canvas-layout-toolbar__count">{selectedNodes.length}</span>
					<span aria-hidden="true">
						{selectedNodes.length === 0 ? t("toolbar.selectCards") : t("toolbar.cardsSelected")}
					</span>
				</div>
			)}
			{mode !== "selection" && selectedNodes.length > 0 && (
				<p className="canvas-layout-toolbar__guidance" role="status">
					{getSelectionGuidance(selectedNodes.length)}
				</p>
			)}
			{mode !== "history" && selectedNodes.length > 0 && (
				<div className="canvas-layout-toolbar__actions">
					{getActions().map(({ action, label, accessibleLabel, minimum, icon }) => (
						<button
							type="button"
							key={action}
							className="canvas-layout-tool"
							disabled={selectedNodes.length < minimum}
							aria-label={accessibleLabel}
							title={
								selectedNodes.length < minimum
									? t("toolbar.selectMinimum", { count: minimum })
									: accessibleLabel
							}
							onClick={() => {
								runChange(() =>
									canvasOperator.arrangeNodes(canvasView.canvas, selectedIds, action),
								);
							}}
						>
							{icon}
							<span>{label}</span>
						</button>
					))}
				</div>
			)}
			<div className="canvas-layout-toolbar__actions canvas-layout-toolbar__actions--secondary">
				{mode !== "history" && selectedNodes.length > 0 && (
					<>
						<ToolButton
							label={t("toolbar.link")}
							accessibleLabel={t("command.connect")}
							disabled={selectedNodes.length !== 2}
							disabledHint={t("notice.selectTwo")}
							icon={<RelationGlyph kind="link" />}
							onClick={() =>
								runChange(() =>
									canvasOperator.addEdgeToCanvas(canvasView.canvas, {
										fromNode: selectedIds[0]!,
										toNode: selectedIds[1]!,
										color: edgeColor || undefined,
										label: edgeLabel || undefined,
									}),
								)
							}
						/>
						<ToolButton
							label={t("toolbar.group")}
							accessibleLabel={t("command.group")}
							disabled={false}
							disabledHint={t("notice.selectForGroup")}
							icon={<RelationGlyph kind="group" />}
							onClick={() =>
								runChange(() => canvasOperator.addGroupToCanvas(canvasView.canvas, selectedNodes))
							}
						/>
					</>
				)}
				{mode !== "selection" && (
					<ToolButton
						label={t("toolbar.undo")}
						accessibleLabel={t("command.undo")}
						disabled={!historyState.canUndo}
						disabledHint={t("notice.nothingUndo")}
						icon={<RelationGlyph kind="undo" />}
						onClick={() => runChange(() => canvasOperator.undo(canvasView.canvas))}
					/>
				)}
				{mode !== "selection" && (
					<ToolButton
						label={t("toolbar.redo")}
						accessibleLabel={t("command.redo")}
						disabled={!historyState.canRedo}
						disabledHint={t("notice.nothingRedo")}
						icon={<RelationGlyph kind="redo" />}
						onClick={() => runChange(() => canvasOperator.redo(canvasView.canvas))}
					/>
				)}
			</div>
		</section>
	);
}

interface ToolButtonProps {
	label: string;
	accessibleLabel: string;
	disabled: boolean;
	disabledHint: string;
	icon: React.ReactNode;
	onClick: () => void;
}

function ToolButton({
	label,
	accessibleLabel,
	disabled,
	disabledHint,
	icon,
	onClick,
}: ToolButtonProps): React.ReactElement {
	return (
		<button
			type="button"
			className="canvas-layout-tool"
			disabled={disabled}
			aria-label={accessibleLabel}
			title={disabled ? disabledHint : accessibleLabel}
			onClick={onClick}
		>
			{icon}
			<span>{label}</span>
		</button>
	);
}

function LayoutGlyph({
	direction,
}: {
	direction: "left" | "top" | "horizontal" | "vertical";
}): React.ReactElement {
	return (
		<span className={`canvas-layout-glyph canvas-layout-glyph--${direction}`} aria-hidden="true">
			<i />
			<i />
			<i />
		</span>
	);
}

function RelationGlyph({ kind }: { kind: "link" | "group" | "undo" | "redo" }): React.ReactElement {
	return (
		<span className={`canvas-relation-glyph canvas-relation-glyph--${kind}`} aria-hidden="true" />
	);
}
