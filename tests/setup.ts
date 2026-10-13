if (typeof HTMLElement !== "undefined") {
	HTMLElement.prototype.createEl = function (tag, options) {
		const element = document.createElement(tag);
		if (typeof options === "string") element.className = options;
		else if (options) {
			if (options.text !== undefined) element.textContent = options.text;
			if (options.cls !== undefined)
				element.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
			for (const [name, value] of Object.entries(options.attr ?? {}))
				element.setAttribute(name, value);
		}
		this.appendChild(element);
		return element;
	};
	HTMLElement.prototype.createDiv = function (options) {
		return this.createEl("div", options);
	};
	HTMLElement.prototype.createSpan = function (options) {
		return this.createEl("span", options);
	};
	HTMLElement.prototype.detach = function () {
		this.remove();
	};
	globalThis.createDiv = (options) => {
		const element = document.body.createDiv(options);
		element.detach();
		return element;
	};
	globalThis.createSpan = (options) => {
		const element = document.body.createSpan(options);
		element.detach();
		return element;
	};
}
