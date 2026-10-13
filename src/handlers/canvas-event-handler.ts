import { t } from "@/i18n";
import type { CanvasObserver } from "@/services/canvas-observer";
import type { QuickCardCreator } from "@/services/quick-card-creator";
import type { GraphuneSettings } from "@/types/settings";
import { notifyError } from "@/utils/notify-error";
import { Notice, type TFile } from "obsidian";

export class CanvasEventHandler {
	constructor(
		private settings: GraphuneSettings,
		private canvasObserver: CanvasObserver,
		private quickCardCreator: QuickCardCreator,
		private onCardCreated?: (file: TFile) => void | Promise<void>,
	) {}

	async handleCanvasDblClick(evt: MouseEvent): Promise<void> {
		if (!evt.metaKey && !evt.ctrlKey) {
			return;
		}

		const target = evt.target as HTMLElement;
		if (!target.closest(".canvas-wrapper")) {
			return;
		}
		if (target.closest(".canvas-node")) {
			return;
		}

		const canvasView = this.canvasObserver.getActiveCanvasView();
		if (!canvasView) {
			return;
		}

		const pointerPosition = canvasView.canvas.posFromEvt(evt);
		const position = this.centerCardAt(pointerPosition);

		try {
			const { file } = await this.quickCardCreator.createCardAtPosition(
				canvasView.canvas,
				canvasView.file,
				position,
				this.settings.quickCardDefaultTitle,
			);
			await this.finishCardCreation(file);
		} catch (error) {
			notifyError(t("notice.createCardFailed"), error);
		}
	}

	async createNewCardInViewport(): Promise<void> {
		const canvasView = this.canvasObserver.getActiveCanvasView();
		if (!canvasView) {
			return;
		}

		try {
			const { file } = await this.quickCardCreator.createCardAtPosition(
				canvasView.canvas,
				canvasView.file,
				this.getViewportCenter(canvasView.canvas),
				this.settings.quickCardDefaultTitle,
			);
			await this.finishCardCreation(file);
		} catch (error) {
			notifyError(t("notice.createCardFailed"), error);
		}
	}

	private centerCardAt(position: { x: number; y: number }): { x: number; y: number } {
		return {
			x: position.x - this.settings.defaultNodeWidth / 2,
			y: position.y - this.settings.defaultNodeHeight / 2,
		};
	}

	private async finishCardCreation(file: TFile): Promise<void> {
		new Notice(t("notice.createdOnCanvas", { name: file.basename }));
		if (!this.onCardCreated) return;
		try {
			await this.onCardCreated(file);
		} catch (error) {
			notifyError(t("notice.editorOpenFailed"), error);
		}
	}

	private getViewportCenter(canvas: {
		posFromEvt: (event: MouseEvent) => { x: number; y: number };
	}): { x: number; y: number } {
		const wrapper =
			document.querySelector<HTMLElement>(".workspace-leaf.mod-active .canvas-wrapper") ??
			document.querySelector<HTMLElement>(".canvas-wrapper");
		if (!wrapper) return { x: 0, y: 0 };

		const rect = wrapper.getBoundingClientRect();
		const event = new MouseEvent("mousemove", {
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2,
		});
		return this.centerCardAt(canvas.posFromEvt(event));
	}
}
