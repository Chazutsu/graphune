import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const vaultPath = resolve(projectRoot, ".dev", "ux-audit-vault");
const obsidianDir = join(vaultPath, ".obsidian");

const files = new Map([
	["Inbox/Quick Capture.md", `---
tags: [inbox, capture]
status: unprocessed
---
# Quick Capture

## Why spatial notes matter

Ideas become useful when their relationships remain visible while thinking.

## Next action

Move this heading onto the Canvas and connect it to the research cluster.
`],
	["Research/Graph Thinking.md", `---
tags: [research/knowledge, visual-thinking]
status: active
---
# Graph Thinking

## Context before hierarchy

A spatial workspace keeps neighboring ideas in view before a rigid outline exists.

### Working hypothesis

Low-friction rearrangement is more important than adding more commands.

## Evidence

- Position carries meaning.
- Connections should be readable without opening each card.
- Interaction feedback must be immediate and quiet.
`],
	["Projects/Product Direction.md", `---
tags: [project/obsidian-heptabase, product]
status: in-progress
priority: high
---
# Product Direction

## Product principle

Smoothness and visual quality are product requirements, not finishing touches.

## UX acceptance criteria

- Search feedback appears without layout jumps.
- Narrow sidebars remain usable.
- Dense canvases preserve selection clarity.
- Keyboard focus is always visible.
`],
	["Archive/A deliberately long card title to test truncation and narrow layouts.md", `---
tags: [archive, edge-case]
status: done
---
# A deliberately long card title to test truncation and narrow layouts

This note verifies title wrapping, truncation, metadata density, and tooltip behavior.
`],
	["日本語/知識を空間で考える.md", `---
tags: [リサーチ/知識管理, 日本語]
status: active
---
# 知識を空間で考える

## 視線移動を減らす

カードの関係を保ったまま内容を読めると、思考の文脈が途切れにくい。

## 操作の手触り

ドラッグ、選択、検索の反応が一貫していることが重要である。
`],
	["UX監査チェックリスト.md", `# UX監査チェックリスト

## 見た目

- [ ] ライト・ダーク双方で階層とコントラストが自然
- [ ] 300px前後の右サイドバーで操作が破綻しない
- [ ] 長いタイトル、日本語、タグが不自然に切れない

## なめらかさ

- [ ] 検索中に結果とスクロール位置が跳ねない
- [ ] タブ切替、選択、ホバーの反応に遅延や過剰な動きがない
- [ ] Canvasへの追加、整列、接続、Undo/Redoが連続操作に耐える

## 状態

- [ ] 結果あり・ゼロ件・フィルタ適用中が明確
- [ ] キーボード操作時のフォーカスが常に見える
- [ ] 再起動後もレイアウトと選択対象が妥当に復元される
`],
]);

const canvas = {
	nodes: [
		{ id: "principle", type: "file", file: "Projects/Product Direction.md", x: 0, y: 0, width: 420, height: 320 },
		{ id: "research", type: "file", file: "Research/Graph Thinking.md", x: 500, y: -80, width: 400, height: 360 },
		{ id: "capture", type: "file", file: "Inbox/Quick Capture.md", x: 500, y: 340, width: 360, height: 260 },
		{ id: "japanese", type: "file", file: "日本語/知識を空間で考える.md", x: 940, y: 0, width: 380, height: 300 },
		{ id: "long-title", type: "file", file: "Archive/A deliberately long card title to test truncation and narrow layouts.md", x: 940, y: 360, width: 380, height: 240 },
		{ id: "prompt", type: "text", text: "監査起点\n\n右サイドバーから検索・追加し、選択・整列・接続を連続して試す。", x: -420, y: 80, width: 340, height: 200, color: "3" },
		{ id: "cluster", type: "group", label: "Research cluster", x: 460, y: -130, width: 900, height: 780, color: "5" },
		{ id: "reference", type: "link", url: "https://help.obsidian.md/plugins/canvas", x: 0, y: 400, width: 420, height: 220 },
	],
	edges: [
		{ id: "e-principle-research", fromNode: "principle", fromSide: "right", toNode: "research", toSide: "left", label: "informs" },
		{ id: "e-research-japanese", fromNode: "research", fromSide: "right", toNode: "japanese", toSide: "left" },
		{ id: "e-capture-long", fromNode: "capture", fromSide: "right", toNode: "long-title", toSide: "left" },
	],
};

const workspace = {
	main: { id: "ux-audit-main", type: "split", children: [{ id: "ux-audit-tabs", type: "tabs", children: [{ id: "ux-audit-canvas-leaf", type: "leaf", state: { type: "canvas", state: { file: "UX監査Canvas.canvas", viewState: { x: 430, y: 250, zoom: -1.25 } }, icon: "lucide-layout-dashboard", title: "UX監査Canvas" } }] }], direction: "vertical" },
	left: { id: "ux-audit-left", type: "split", children: [{ id: "ux-audit-left-tabs", type: "tabs", children: [{ id: "ux-audit-files", type: "leaf", state: { type: "file-explorer", state: { sortOrder: "alphabetical", autoReveal: false, showSearch: false, searchQuery: "" }, icon: "lucide-folder-closed", title: "Files" } }] }], direction: "horizontal", width: 280 },
	right: { id: "ux-audit-right", type: "split", children: [{ id: "ux-audit-right-tabs", type: "tabs", children: [{ id: "ux-audit-plugin", type: "leaf", state: { type: "heading-explorer-view", state: {}, icon: "layout-grid", title: "Heading Explorer" } }], currentTab: 0 }], direction: "horizontal", width: 380 },
	"left-ribbon": { hiddenItems: { "obsidian-heptabase:Heading Explorer": false } },
	active: "ux-audit-plugin",
	lastOpenFiles: ["UX監査Canvas.canvas", "UX監査チェックリスト.md", "Projects/Product Direction.md"],
};

for (const [relativePath, contents] of files) {
	const filePath = join(vaultPath, relativePath);
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, contents, "utf8");
}

mkdirSync(join(obsidianDir, "plugins"), { recursive: true });
writeFileSync(join(vaultPath, "UX監査Canvas.canvas"), `${JSON.stringify(canvas, null, "\t")}\n`, "utf8");
writeFileSync(join(obsidianDir, "community-plugins.json"), `${JSON.stringify(["obsidian-heptabase"], null, "\t")}\n`, "utf8");
writeFileSync(join(obsidianDir, "core-plugins.json"), `${JSON.stringify({ "file-explorer": true, search: true, canvas: true, outline: true, backlinks: true, "outgoing-link": true, "tag-pane": true, properties: true, bookmarks: true, "command-palette": true }, null, "\t")}\n`, "utf8");
writeFileSync(join(obsidianDir, "appearance.json"), "{}\n", "utf8");
writeFileSync(join(obsidianDir, "app.json"), "{}\n", "utf8");
writeFileSync(join(obsidianDir, "workspace.json"), `${JSON.stringify(workspace, null, "\t")}\n`, "utf8");

execFileSync(process.execPath, [join(projectRoot, "scripts", "setup-dev-link.mjs"), vaultPath], { cwd: projectRoot, stdio: "inherit" });

console.log(`\nUX audit vault ready: ${vaultPath}`);
console.log("Run pnpm open:device to open it in Obsidian.");
console.log("On first use, open the folder as a vault, trust this local vault, and enable the bundled plugin.");
