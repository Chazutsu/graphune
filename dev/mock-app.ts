import type { HeadingCache } from "obsidian";
import {
	createVirtualObsidian,
	VirtualFile as TFile,
	VirtualFolder as TFolder,
} from "virtual-obsidian";

export { TFile, TFolder };

export const normalizePath = (path: string): string => path.replaceAll(/\/{2,}/g, "/");

const SAMPLE_TIMESTAMP = Date.UTC(2025, 0, 15, 12);

const sampleFiles = [
	new TFile("Projects/Getting Started.md"),
	new TFile("Projects/Architecture Overview.md"),
	new TFile("Notes/Daily Note 2025-01-15.md"),
	new TFile("Notes/Meeting Notes.md"),
	new TFile("Ideas/Feature Roadmap.md"),
].map((file, index, files) => {
	const timestamp = SAMPLE_TIMESTAMP + (files.length - index) * 60_000;
	file.stat = { ...file.stat, ctime: timestamp, mtime: timestamp };
	return file;
});

const sampleHeadings: Record<string, HeadingCache[]> = {
	"Projects/Getting Started.md": [
		{
			heading: "Installation",
			level: 2,
			position: { start: { line: 2, col: 0, offset: 20 }, end: { line: 2, col: 16, offset: 36 } },
		},
		{
			heading: "Quick Start",
			level: 2,
			position: {
				start: { line: 10, col: 0, offset: 120 },
				end: { line: 10, col: 15, offset: 135 },
			},
		},
		{
			heading: "Configuration",
			level: 3,
			position: {
				start: { line: 20, col: 0, offset: 250 },
				end: { line: 20, col: 17, offset: 267 },
			},
		},
	],
	"Projects/Architecture Overview.md": [
		{
			heading: "System Design",
			level: 2,
			position: { start: { line: 2, col: 0, offset: 30 }, end: { line: 2, col: 17, offset: 47 } },
		},
		{
			heading: "Components",
			level: 2,
			position: {
				start: { line: 15, col: 0, offset: 200 },
				end: { line: 15, col: 14, offset: 214 },
			},
		},
		{
			heading: "Data Flow",
			level: 3,
			position: {
				start: { line: 30, col: 0, offset: 400 },
				end: { line: 30, col: 13, offset: 413 },
			},
		},
	],
	"Notes/Daily Note 2025-01-15.md": [
		{
			heading: "Tasks",
			level: 2,
			position: { start: { line: 2, col: 0, offset: 25 }, end: { line: 2, col: 9, offset: 34 } },
		},
		{
			heading: "Notes",
			level: 2,
			position: {
				start: { line: 10, col: 0, offset: 100 },
				end: { line: 10, col: 9, offset: 109 },
			},
		},
	],
	"Notes/Meeting Notes.md": [
		{
			heading: "Agenda",
			level: 2,
			position: { start: { line: 2, col: 0, offset: 20 }, end: { line: 2, col: 10, offset: 30 } },
		},
		{
			heading: "Action Items",
			level: 2,
			position: {
				start: { line: 15, col: 0, offset: 180 },
				end: { line: 15, col: 16, offset: 196 },
			},
		},
		{
			heading: "Follow-up",
			level: 3,
			position: {
				start: { line: 25, col: 0, offset: 300 },
				end: { line: 25, col: 13, offset: 313 },
			},
		},
	],
	"Ideas/Feature Roadmap.md": [
		{
			heading: "Q1 Goals",
			level: 2,
			position: { start: { line: 2, col: 0, offset: 25 }, end: { line: 2, col: 12, offset: 37 } },
		},
		{
			heading: "Q2 Goals",
			level: 2,
			position: {
				start: { line: 20, col: 0, offset: 300 },
				end: { line: 20, col: 12, offset: 312 },
			},
		},
		{
			heading: "Backlog",
			level: 2,
			position: {
				start: { line: 40, col: 0, offset: 600 },
				end: { line: 40, col: 10, offset: 610 },
			},
		},
	],
};

const sampleTags: Record<string, string[]> = {
	"Projects/Getting Started.md": ["clipping", "guide"],
	"Projects/Architecture Overview.md": ["kindle", "architecture"],
	"Notes/Daily Note 2025-01-15.md": ["journal"],
	"Notes/Meeting Notes.md": ["meeting", "project"],
	"Ideas/Feature Roadmap.md": ["idea", "roadmap"],
};

const sampleContent: Record<string, string> = {
	"First map.canvas": JSON.stringify({
		nodes: [
			{
				id: "node-1",
				type: "file",
				file: "Projects/Getting Started.md",
				x: 0,
				y: 0,
				width: 220,
				height: 100,
			},
		],
		edges: [],
	}),
	"Research map.canvas": JSON.stringify({
		nodes: [
			{
				id: "research-node-1",
				type: "file",
				file: "Projects/Getting Started.md",
				x: 0,
				y: 0,
				width: 220,
				height: 100,
			},
		],
		edges: [],
	}),
	"Projects/Getting Started.md":
		"# Getting Started\n\n## Installation\n\nInstall via community plugins.\n\n```bash\npnpm install\n```\n\n## Quick Start\n\nOpen a canvas and start dragging headings.\n\n### Configuration\n\nAdjust settings in the plugin settings tab.",
	"Projects/Architecture Overview.md":
		"# Architecture Overview\n\n## System Design\n\nThe plugin follows a modular architecture with clear separation of concerns.\n\n## Components\n\nEach component handles a specific part of the UI.\n\n### Data Flow\n\nData flows from Obsidian API through services to React components.",
	"Notes/Daily Note 2025-01-15.md":
		"# 2025-01-15\n\n## Tasks\n\n- [x] Review PR\n- [ ] Update docs\n\n## Notes\n\nDiscussed new feature requirements with the team.",
	"Notes/Meeting Notes.md":
		"# Meeting Notes\n\n## Agenda\n\n1. Project status\n2. Feature prioritization\n3. Timeline review\n\n## Action Items\n\n- Update roadmap\n- Schedule follow-up\n\n### Follow-up\n\nScheduled for next week.",
	"Ideas/Feature Roadmap.md":
		"# Feature Roadmap\n\n## Q1 Goals\n\n- Canvas integration\n- Heading explorer\n- Drag and drop\n\n## Q2 Goals\n\n- Edge management\n- Back links\n- Performance optimization\n\n## Backlog\n\n- Multi-canvas support\n- Custom themes\n- Export functionality",
};

export function createMockApp() {
	const search = globalThis.location?.search ?? "";
	const hasCanvas = search.includes("canvas=");
	const selectedCount = search.includes("selected1")
		? 1
		: search.includes("selected3")
			? 3
			: search.includes("canvas=selected")
				? 2
				: 0;
	const selectedNodes = Array.from({ length: selectedCount }, (_, index) => ({
		id: `node-${index + 1}`,
		type: selectedCount === 1 && index === 0 ? ("file" as const) : ("text" as const),
		...(selectedCount === 1 && index === 0
			? { file: sampleFiles[0]!.path }
			: { text: `Idea ${index + 1}` }),
		x: index * 260,
		y: 0,
		width: 220,
		height: 100,
	}));
	const firstCanvasNodes = search.includes("canvas=empty")
		? []
		: selectedCount > 0
			? selectedNodes
			: [
					{
						id: "node-1",
						type: "file" as const,
						file: sampleFiles[0]!.path,
						x: 0,
						y: 0,
						width: 220,
						height: 100,
					},
				];
	const runtime = createVirtualObsidian({
		files: sampleFiles.map((file) => ({
			path: file.path,
			content: sampleContent[file.path] ?? "",
			headings: sampleHeadings[file.path],
			tags: sampleTags[file.path],
			ctime: file.stat.ctime,
			mtime: file.stat.mtime,
		})),
		canvases: [
			{
				path: "First map.canvas",
				nodes: firstCanvasNodes,
				edges: [],
				selectedNodeIds: selectedNodes.map((node) => node.id),
			},
			{
				path: "Research map.canvas",
				nodes: [
					{
						id: "research-node-1",
						type: "file",
						file: sampleFiles[0]!.path,
						x: 0,
						y: 0,
						width: 220,
						height: 100,
					},
				],
				edges: [],
			},
		],
		activeFile: sampleFiles[0]!.path,
		activeCanvas: hasCanvas ? "First map.canvas" : null,
	});
	document.documentElement.dataset.virtualObsidianEngine = runtime.engine;
	const getLeaf = runtime.app.workspace.getLeaf.bind(runtime.app.workspace);
	runtime.app.workspace.getLeaf = (createNew: boolean) => {
		const leaf = getLeaf(createNew);
		return {
			openFile: async (file?: TFile) => {
				await leaf.openFile(file);
				if (file) document.documentElement.dataset.openedFile = file.path;
			},
		};
	};
	return runtime.app;
}

export class MarkdownView {
	file: TFile | null = null;
}

export const VIEW_TYPE_CANVAS = "canvas";

export class Notice {
	message: string;

	constructor(message: string) {
		this.message = message;
		console.log(`[Notice] ${message}`);
	}
}

export class Component {
	load(): void {}
	unload(): void {}
}

export const MarkdownRenderer = {
	async render(
		_app: unknown,
		markdown: string,
		container: HTMLElement,
		_sourcePath: string,
		_component: Component,
	): Promise<void> {
		container.replaceChildren();
		for (const block of markdown.split(/\n{2,}/).filter(Boolean)) {
			const lines = block.split("\n");
			if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) {
				container.appendChild(renderMockList(lines, false));
			} else if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
				container.appendChild(renderMockList(lines, true));
			} else {
				const paragraph = document.createElement("p");
				paragraph.textContent = lines.join(" ");
				container.appendChild(paragraph);
			}
		}
	},
};

function renderMockList(lines: string[], ordered: boolean): HTMLOListElement | HTMLUListElement {
	const list = document.createElement(ordered ? "ol" : "ul");
	for (const line of lines) {
		const item = document.createElement("li");
		const content = line.replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, "");
		const task = content.match(/^\[([ xX])\]\s+(.*)$/);
		if (task) {
			list.classList.add("contains-task-list");
			item.classList.add("task-list-item");
			const checkbox = document.createElement("input");
			checkbox.className = "task-list-item-checkbox";
			checkbox.type = "checkbox";
			checkbox.checked = task[1]?.toLowerCase() === "x";
			checkbox.disabled = true;
			item.append(checkbox, document.createTextNode(task[2] ?? ""));
		} else {
			item.textContent = content;
		}
		list.appendChild(item);
	}
	return list;
}

class MockMenuItem {
	setTitle(_title: string): this {
		return this;
	}

	setIcon(_icon: string): this {
		return this;
	}

	onClick(_callback: () => void): this {
		return this;
	}
}

export class Menu {
	addItem(callback: (item: MockMenuItem) => void): this {
		callback(new MockMenuItem());
		return this;
	}

	showAtMouseEvent(_event: MouseEvent): void {}
}
