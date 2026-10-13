import { t, type MessageKey } from "@/i18n";
import type { CanvasObserver } from "@/services/canvas-observer";
import type { CanvasLayoutAction, CanvasOperator } from "@/services/canvas-operator";
import type { GraphuneSettings } from "@/types/settings";
import { Notice } from "obsidian";

export class CommandHandler {
	constructor(
		private settings: GraphuneSettings,
		private canvasObserver: CanvasObserver,
		private canvasOperator: CanvasOperator,
	) {}

	connectSelectedNodes(): void {
		const selectedNodes = this.canvasObserver.getSelectedNodes();
		if (selectedNodes.length !== 2) {
			new Notice(t("notice.selectTwo"));
			return;
		}
		if (selectedNodes[0]!.id === selectedNodes[1]!.id) {
			new Notice(t("notice.selectDifferent"));
			return;
		}

		const canvasView = this.canvasObserver.getActiveCanvasView();
		if (!canvasView) {
			return;
		}

		const added = this.canvasOperator.addEdgeToCanvas(canvasView.canvas, {
			fromNode: selectedNodes[0]!.id,
			toNode: selectedNodes[1]!.id,
			color: this.settings.defaultEdgeColor || undefined,
			label: this.settings.defaultEdgeLabel || undefined,
		});

		new Notice(added ? t("notice.connected") : t("notice.alreadyConnected"));
	}

	groupSelectedNodes(): void {
		const selectedNodes = this.canvasObserver.getSelectedNodes();
		if (selectedNodes.length === 0) {
			new Notice(t("notice.selectForGroup"));
			return;
		}

		const canvasView = this.canvasObserver.getActiveCanvasView();
		if (!canvasView) {
			return;
		}

		this.canvasOperator.addGroupToCanvas(canvasView.canvas, selectedNodes);
		new Notice(t("notice.grouped"));
	}

	alignSelectedNodesLeft(): void {
		this.arrangeSelectedNodes("align-left", 2, "notice.alignedLeft");
	}

	alignSelectedNodesTop(): void {
		this.arrangeSelectedNodes("align-top", 2, "notice.alignedTop");
	}

	distributeSelectedNodesHorizontally(): void {
		this.arrangeSelectedNodes("distribute-horizontal", 3, "notice.distributedHorizontal");
	}

	distributeSelectedNodesVertically(): void {
		this.arrangeSelectedNodes("distribute-vertical", 3, "notice.distributedVertical");
	}

	undoLastCanvasChange(): void {
		const canvasView = this.canvasObserver.getActiveCanvasView();
		if (!canvasView || !this.canvasOperator.undo(canvasView.canvas)) {
			new Notice(t("notice.nothingUndo"));
			return;
		}
		new Notice(t("notice.undone"));
	}

	redoLastCanvasChange(): void {
		const canvasView = this.canvasObserver.getActiveCanvasView();
		if (!canvasView || !this.canvasOperator.redo(canvasView.canvas)) {
			new Notice(t("notice.nothingRedo"));
			return;
		}
		new Notice(t("notice.redone"));
	}

	private arrangeSelectedNodes(
		action: CanvasLayoutAction,
		minimumNodes: number,
		successMessage: MessageKey,
	): void {
		const selectedNodes = this.canvasObserver.getSelectedNodes();
		if (selectedNodes.length < minimumNodes) {
			new Notice(t("notice.selectMinimum", { count: minimumNodes }));
			return;
		}

		const canvasView = this.canvasObserver.getActiveCanvasView();
		if (!canvasView) return;

		const changed = this.canvasOperator.arrangeNodes(
			canvasView.canvas,
			selectedNodes.map((node) => node.id),
			action,
		);
		new Notice(changed ? t(successMessage) : t("notice.alreadyArranged"));
	}
}
