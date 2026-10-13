export function showDropAnimation(
	container: HTMLElement,
	position: { x: number; y: number },
	count?: number,
): void {
	const el = document.createElement("div");
	el.setAttribute("data-drop-animation", "");
	el.className = "heptabase-drop-animation";
	el.style.left = `${position.x}px`;
	el.style.top = `${position.y}px`;

	if (count !== undefined && count > 1) {
		el.textContent = String(count);
	}

	container.appendChild(el);

	setTimeout(() => {
		el.remove();
	}, 300);
}
