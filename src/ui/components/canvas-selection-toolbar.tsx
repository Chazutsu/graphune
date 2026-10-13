import type { CanvasOperator } from "@/services/canvas-operator";
import { t } from "@/i18n";
import type { CanvasNode, CanvasView } from "@/types/obsidian-canvas";
import { CanvasLayoutToolbar } from "@/ui/components/canvas-layout-toolbar";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface CanvasSelectionToolbarProps {
	canvasView: CanvasView;
	selectedNodes: CanvasNode[];
	canvasOperator: CanvasOperator;
	edgeColor?: string;
	edgeLabel?: string;
	onCanvasChange: () => void;
	onDistill?: () => void;
}

function getNodeElement(node: CanvasNode): HTMLElement | null {
	if (node.nodeEl ?? node.containerEl) return node.nodeEl ?? node.containerEl ?? null;
	return (
		Array.from(document.querySelectorAll<HTMLElement>(".canvas-node")).find(
			(element) => element.dataset.nodeId === node.id,
		) ?? null
	);
}

function getAnchor(nodes: CanvasNode[]): { left: number; top: number } | null {
	const rects = nodes
		.map(getNodeElement)
		.filter((element): element is HTMLElement => element !== null)
		.map((element) => element.getBoundingClientRect())
		.filter((rect) => rect.width > 0 && rect.height > 0);
	if (rects.length !== nodes.length || rects.length === 0) return null;

	const left = Math.min(...rects.map((rect) => rect.left));
	const right = Math.max(...rects.map((rect) => rect.right));
	const top = Math.min(...rects.map((rect) => rect.top));
	return { left: Math.max(8, Math.min(window.innerWidth - 8, (left + right) / 2)), top };
}

export function canFloatSelectionToolbar(nodes: CanvasNode[]): boolean {
	return getAnchor(nodes) !== null;
}

export function CanvasSelectionToolbar({
	canvasView,
	selectedNodes,
	canvasOperator,
	edgeColor,
	edgeLabel,
	onCanvasChange,
	onDistill,
}: CanvasSelectionToolbarProps): React.ReactElement | null {
	const [anchor, setAnchor] = useState(() => getAnchor(selectedNodes));

	useEffect(() => {
		const update = () => setAnchor(getAnchor(selectedNodes));
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		const timer = window.setInterval(update, 200);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
			window.clearInterval(timer);
		};
	}, [selectedNodes]);

	if (!anchor) return null;

	return createPortal(
		<div
			className="graphune-selection-toolbar heptabase-shell"
			style={{ left: anchor.left, top: anchor.top }}
			data-testid="canvas-selection-toolbar"
		>
			<CanvasLayoutToolbar
				canvasView={canvasView}
				selectedNodes={selectedNodes}
				canvasOperator={canvasOperator}
				edgeColor={edgeColor}
				edgeLabel={edgeLabel}
				onCanvasChange={onCanvasChange}
				mode="selection"
			/>
			{onDistill && (
				<button type="button" className="graphune-selection-toolbar__distill" onClick={onDistill}>
					{t("distill.action")}
				</button>
			)}
		</div>,
		document.body,
	);
}
