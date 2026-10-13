import { t } from "@/i18n";
import type { CanvasObserver } from "@/services/canvas-observer";
import type { CanvasOperator } from "@/services/canvas-operator";
import type { FileCreator } from "@/services/file-creator";
import type { PreviewBridge, PreviewItem } from "@/services/preview-bridge";
import type { DragData, NoteDragData, TextSelectionDragData } from "@/types/plugin";
import type { GraphuneSettings } from "@/types/settings";
import { notifyError } from "@/utils/notify-error";
import { Notice, TFile, type App } from "obsidian";

export class DropHandler {
	constructor(
		private app: App,
		private settings: GraphuneSettings,
		private canvasObserver: CanvasObserver,
		private canvasOperator: CanvasOperator,
		private fileCreator: FileCreator,
		private previewBridge?: PreviewBridge,
	) {}

	async handleCanvasDrop(evt: DragEvent): Promise<void> {
		const data = evt.dataTransfer?.getData("application/json");
		if (!data) {
			return;
		}

		let dragData: DragData;
		try {
			dragData = JSON.parse(data);
		} catch {
			return;
		}

		if (dragData.type === "note-drag") {
			await this.handleNoteDrop(evt, dragData);
		} else if (dragData.type === "text-selection-drag") {
			await this.handleTextSelectionDrop(evt, dragData);
		}
	}

	private async handleNoteDrop(evt: DragEvent, dragData: NoteDragData): Promise<void> {
		const canvasView = this.canvasObserver.getActiveCanvasView();
		if (!canvasView) {
			return;
		}

		try {
			const file = this.app.vault.getAbstractFileByPath(dragData.filePath);
			if (!(file instanceof TFile)) {
				new Notice(t("notice.sourceMissing"));
				return;
			}

			this.canvasOperator.addNodeToCanvas(
				canvasView.canvas,
				file,
				canvasView.canvas.posFromEvt(evt),
			);

			new Notice(t("notice.addedToCanvas", { name: file.basename }));
		} catch (error) {
			notifyError(t("notice.addNoteFailed"), error);
		}
	}

	private async handleTextSelectionDrop(
		evt: DragEvent,
		dragData: TextSelectionDragData,
	): Promise<void> {
		const canvasView = this.canvasObserver.getActiveCanvasView();
		if (!canvasView) {
			return;
		}

		try {
			const sourceFile = this.app.vault.getAbstractFileByPath(dragData.filePath);
			if (!(sourceFile instanceof TFile)) {
				new Notice(t("notice.sourceMissing"));
				return;
			}

			const position = canvasView.canvas.posFromEvt(evt);
			const title = this.deriveTitle(dragData);

			const createNode = async () => {
				const newFile = await this.fileCreator.createFile(
					title,
					dragData.selectedText,
					sourceFile,
					{
						sourceHeading: dragData.sourceHeading,
						canvasPath: canvasView.file.path,
					},
				);
				this.canvasOperator.addNodeToCanvas(canvasView.canvas, newFile, position);
				new Notice(t("notice.createdOnCanvas", { name: newFile.basename }));
			};

			if (this.settings.showPreviewBeforeCreate && this.previewBridge) {
				const previewItem: PreviewItem = {
					title,
					filePath: dragData.filePath,
				};
				this.previewBridge.requestPreview(
					[previewItem],
					[dragData.selectedText],
					async (selectedIndices: number[]) => {
						if (selectedIndices.length === 0) {
							return;
						}
						try {
							await createNode();
						} catch (error) {
							notifyError(t("notice.createNoteFailed"), error);
						}
					},
					() => {},
				);
				return;
			}

			await createNode();
		} catch (error) {
			notifyError(t("notice.createNoteFailed"), error);
		}
	}

	private deriveTitle(dragData: TextSelectionDragData): string {
		if (dragData.title) {
			return dragData.title;
		}
		const firstLine = dragData.selectedText.split("\n")[0] ?? t("common.untitled");
		if (firstLine.length <= 50) {
			return firstLine;
		}
		return firstLine.slice(0, 50);
	}
}
