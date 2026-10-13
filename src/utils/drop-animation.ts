export function showDropAnimation(
	container: HTMLElement,
	position: { x: number; y: number },
	count?: number,
): void {
	const el = container.createDiv();
	el.setAttribute("data-drop-animation", "");
	el.className = "heptabase-drop-animation";
	el.style.left = `${position.x}px`;
	el.style.top = `${position.y}px`;

	if (count !== undefined && count > 1) {
		el.textContent = String(count);
	}

	window.setTimeout(() => {
		el.remove();
	}, 300);
}
