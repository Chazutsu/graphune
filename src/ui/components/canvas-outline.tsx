import { t } from "@/i18n";
import { buildCanvasOutline, canvasNodeLabel } from "@/services/canvas-outline";
import type { CanvasNodeData } from "@/types/obsidian-canvas";
import type React from "react";

export function CanvasOutline({
	nodes,
	onFocus,
}: {
	nodes: CanvasNodeData[];
	onFocus: (nodeId: string) => void;
}): React.ReactElement | null {
	const outline = buildCanvasOutline(nodes);
	if (!outline.sections.length && !outline.ungrouped.length) return null;
	return (
		<details className="canvas-outline" open={outline.sections.length > 0 || nodes.length > 8}>
			<summary>
				<span>{t("canvasOutline.title")}</span>
				<small>
					{t("canvasOutline.summary", {
						sections: outline.sections.length,
						cards: nodes.length - outline.sections.length,
					})}
				</small>
			</summary>
			<div className="canvas-outline__body">
				{outline.sections.map((section) => (
					<section key={section.id} className="canvas-outline__section">
						<button type="button" onClick={() => onFocus(section.id)}>
							<i style={section.color ? { background: section.color } : undefined} />
							<strong>{section.label || t("canvasSearch.untitledGroup")}</strong>
							<small>{t("canvasOutline.memberCount", { count: section.members.length })}</small>
						</button>
						{section.members.length ? (
							<ol>
								{section.members.map((node) => (
									<OutlineNode key={node.id} node={node} onFocus={onFocus} />
								))}
							</ol>
						) : (
							<p>{t("canvasOutline.emptySection")}</p>
						)}
					</section>
				))}
				{outline.ungrouped.length ? (
					<section className="canvas-outline__section">
						<h3>{t("canvasOutline.ungrouped")}</h3>
						<ol>
							{outline.ungrouped.map((node) => (
								<OutlineNode key={node.id} node={node} onFocus={onFocus} />
							))}
						</ol>
					</section>
				) : null}
			</div>
		</details>
	);
}

function OutlineNode({
	node,
	onFocus,
}: {
	node: CanvasNodeData;
	onFocus: (id: string) => void;
}): React.ReactElement {
	const kind =
		node.type === "file"
			? t("canvasSearch.kindCard")
			: node.type === "text"
				? t("canvasSearch.kindText")
				: t("canvasSearch.kindLink");
	return (
		<li>
			<button type="button" onClick={() => onFocus(node.id)}>
				<span>{canvasNodeLabel(node) || t("canvasOutline.untitledCard")}</span>
				<small>{kind}</small>
			</button>
		</li>
	);
}
