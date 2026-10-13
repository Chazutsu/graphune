export interface PreviewItem {
	title: string;
	filePath: string;
}

export interface PreviewRequest {
	items: PreviewItem[];
	contents: string[];
	onConfirm: (selectedIndices: number[]) => void;
	onCancel: () => void;
}

export type PreviewCallback = (request: PreviewRequest) => void;

export class PreviewBridge {
	private callback: PreviewCallback | null = null;

	onPreviewRequest(callback: PreviewCallback): () => void {
		this.callback = callback;
		return () => {
			this.callback = null;
		};
	}

	hasCallback(): boolean {
		return this.callback !== null;
	}

	requestPreview(
		items: PreviewItem[],
		contents: string[],
		onConfirm: (selectedIndices: number[]) => void,
		onCancel: () => void,
	): boolean {
		if (!this.callback) {
			return false;
		}

		this.callback({ items, contents, onConfirm, onCancel });
		return true;
	}
}
