export class EditorView {
	private value: string;
	state: {
		doc: {
			toString: () => string;
			sliceString: (from?: number, to?: number) => string;
			readonly lines: number;
			line: (number: number) => { from: number; to: number; text: string };
		};
		selection: { main: { from: number; to: number; head: number } };
	};
	contentDOM = document.createElement("div");
	constructor(config: { doc?: string } = {}) {
		this.value = config.doc ?? "";
		const getValue = () => this.value;
		this.state = {
			doc: {
				toString: getValue,
				sliceString: (from = 0, to = getValue().length) => getValue().slice(from, to),
				get lines() {
					return getValue().split("\n").length;
				},
				line: (number) => {
					const values = getValue().split("\n");
					const index = Math.max(0, Math.min(number - 1, values.length - 1));
					const from = values.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0);
					const text = values[index] ?? "";
					return { from, to: from + text.length, text };
				},
			},
			selection: { main: { from: 0, to: 0, head: 0 } },
		};
	}
	dispatch(transaction: { selection?: { anchor: number } }) {
		if (transaction.selection) {
			const head = transaction.selection.anchor;
			this.state.selection.main = { from: head, to: head, head };
		}
	}
	focus() {
		this.contentDOM.focus();
	}
	coordsAtPos() {
		return { left: 0, right: 0, top: 0, bottom: 0 };
	}
	static updateListener = { of: () => ({}) };
	static scrollIntoView = () => ({});
}

export const keymap = {
	of: () => ({}),
};

export const placeholder = () => ({});
