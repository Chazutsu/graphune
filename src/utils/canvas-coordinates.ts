export interface CanvasPosition {
	x: number;
	y: number;
}

export function clientToCanvasPos(
	clientX: number,
	clientY: number,
	canvas: { tx: number; ty: number; tZoom: number },
	canvasEl: { getBoundingClientRect: () => DOMRect },
): CanvasPosition {
	const rect = canvasEl.getBoundingClientRect();
	const x = (clientX - rect.left - canvas.tx) / canvas.tZoom;
	const y = (clientY - rect.top - canvas.ty) / canvas.tZoom;
	return { x, y };
}
