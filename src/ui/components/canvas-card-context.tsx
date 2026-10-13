import { t } from "@/i18n";
import { CanvasOperator } from "@/services/canvas-operator";
import type {
	CanvasLocation,
	KnowledgeReference,
	RelatedCandidate,
	RelatedCandidateReason,
} from "@/services/knowledge-context";
import type { CanvasData, CanvasNode, CanvasNodeData, CanvasView } from "@/types/obsidian-canvas";
import { useApp } from "@/ui/hooks/use-app";
import { useKnowledgeContext } from "@/ui/hooks/use-knowledge-context";
import { notifyError } from "@/utils/notify-error";
import { TFile } from "obsidian";
import type React from "react";
import { useCallback, useMemo, useState } from "react";

interface CanvasCardContextProps {
	canvasView: CanvasView;
	selectedNodes: CanvasNode[];
	onOpenArticle?: (path: string) => void;
}

interface RelatedNode {
	id: string;
	label: string;
	kind: CanvasNodeData["type"];
}

export function CanvasCardContext({
	canvasView,
	selectedNodes,
	onOpenArticle,
}: CanvasCardContextProps): React.ReactElement | null {
	const { app, canvasObserver, canvasOperator: sharedCanvasOperator, settings } = useApp();
	const canvasOperator = useMemo(
		() => sharedCanvasOperator ?? new CanvasOperator(app, settings),
		[app, settings, sharedCanvasOperator],
	);
	const data = canvasView.canvas.getData();
	const selected = selectedNodes.length === 1 ? findNodeData(data, selectedNodes[0]!.id) : null;
	const abstractFile =
		selected?.type === "file" && selected.file
			? app.vault.getAbstractFileByPath(selected.file)
			: null;
	const file = abstractFile instanceof TFile ? abstractFile : null;
	const canvasFilePaths = new Set(
		data.nodes.filter((node) => node.type === "file" && node.file).map((node) => node.file!),
	);
	const context = useKnowledgeContext(file, canvasFilePaths);
	const [addedPathsByContext, setAddedPathsByContext] = useState<
		Readonly<Record<string, ReadonlySet<string>>>
	>({});
	const contextKey = `${canvasView.file.path}\u0000${file?.path ?? ""}`;
	const addedPaths = addedPathsByContext[contextKey] ?? new Set<string>();
	const connected = selected ? connectedNodes(data, selected.id) : [];
	const nearby = selected
		? nearbyNodes(data, selected.id, new Set(connected.map((node) => node.id)))
		: [];
	const otherCanvases = context.canvases.filter(
		(location) => location.path !== canvasView.file.path,
	);
	const relatedCandidates = context.relatedCandidates.filter(
		(candidate) => !addedPaths.has(candidate.path),
	);

	const focusNode = useCallback(
		(nodeId: string) => {
			const runtimeNode = canvasView.canvas.nodes?.get(nodeId);
			if (!runtimeNode) return;
			canvasView.canvas.selectOnly?.(runtimeNode);
			canvasView.canvas.zoomToSelection?.();
		},
		[canvasView],
	);
	const openCanvasLocation = useCallback(
		async (location: CanvasLocation) => {
			const canvasFile = app.vault.getAbstractFileByPath(location.path);
			if (!(canvasFile instanceof TFile)) return;
			await app.workspace.getLeaf(false).openFile(canvasFile);
			window.requestAnimationFrame(() => {
				const target = canvasObserver?.getActiveCanvasView();
				const runtimeNode = target?.canvas.nodes?.get(location.nodeId);
				if (!target || !runtimeNode) return;
				target.canvas.selectOnly?.(runtimeNode);
				target.canvas.zoomToSelection?.();
			});
		},
		[app.vault, app.workspace, canvasObserver],
	);
	const addRelatedCandidate = (candidate: RelatedCandidate) => {
		const candidateFile = app.vault.getAbstractFileByPath(candidate.path);
		if (!(candidateFile instanceof TFile) || !selected) return;
		try {
			const position = nextCandidatePosition(data, selected);
			const node = canvasOperator.addNodeToCanvas(canvasView.canvas, candidateFile, position);
			if (!node) throw new Error("Canvas node creation failed");
			const reason = formatCandidateReasons(candidate.reasons);
			if (
				!canvasOperator.addEdgeToCanvas(canvasView.canvas, {
					fromNode: selected.id,
					toNode: node.id,
					label: reason,
				})
			) {
				throw new Error("Canvas edge creation failed");
			}
			setAddedPathsByContext((current) => ({
				...current,
				[contextKey]: new Set([...(current[contextKey] ?? []), candidate.path]),
			}));
		} catch (error) {
			notifyError(t("context.addFailed"), error);
		}
	};

	if (!selected || !file) return null;

	return (
		<section className="canvas-context" aria-label={t("context.label")}>
			<header className="canvas-context__header">
				<div className="min-w-0">
					<span className="canvas-context__eyebrow">{t("context.selectedCard")}</span>
					<h2>{file.basename}</h2>
				</div>
				<span className="canvas-context__status">{t("context.onThisCanvas")}</span>
			</header>
			<button
				type="button"
				className="canvas-context__edit mod-cta"
				onClick={() => onOpenArticle?.(file.path)}
			>
				{t("context.openEditor")}
			</button>
			<ContextSection title={t("context.connected")} count={connected.length}>
				{connected.map((node) => (
					<NodeButton key={node.id} node={node} onClick={() => focusNode(node.id)} />
				))}
			</ContextSection>
			<ContextSection title={t("context.nearby")} count={nearby.length}>
				{nearby.map((node) => (
					<NodeButton key={node.id} node={node} onClick={() => focusNode(node.id)} />
				))}
			</ContextSection>
			<ContextSection
				title={t("context.relatedCandidates")}
				count={relatedCandidates.length}
				state={context.status}
			>
				{relatedCandidates.map((candidate) => (
					<RelatedCandidateRow
						key={candidate.path}
						candidate={candidate}
						onOpen={() => onOpenArticle?.(candidate.path)}
						onAdd={() => addRelatedCandidate(candidate)}
					/>
				))}
			</ContextSection>
			<ContextSection title={t("context.otherCanvases")} count={otherCanvases.length}>
				{otherCanvases.map((location) => (
					<ReferenceButton
						key={`${location.path}:${location.nodeId}`}
						label={location.label}
						detail={t("context.sameCard")}
						onClick={() => void openCanvasLocation(location)}
					/>
				))}
			</ContextSection>
			<ContextSection title={t("article.backlinks")} count={context.backlinks.length}>
				{context.backlinks.map((reference) => (
					<BacklinkButton
						key={reference.path}
						reference={reference}
						onOpenArticle={onOpenArticle}
					/>
				))}
			</ContextSection>
		</section>
	);
}

function ContextSection({
	title,
	count,
	state = "ready",
	children,
}: {
	title: string;
	count: number;
	state?: KnowledgeContextState;
	children: React.ReactNode;
}): React.ReactElement {
	const [isOpen, setIsOpen] = useState(true);
	return (
		<details
			className="canvas-context__section"
			open={isOpen}
			onToggle={(event) => setIsOpen(event.currentTarget.open)}
		>
			<summary>
				<span>{title}</span>
				<span>{count}</span>
			</summary>
			{state === "loading" ? (
				<p role="status">{t("context.loadingCandidates")}</p>
			) : state === "error" ? (
				<p role="alert">{t("context.candidatesError")}</p>
			) : count > 0 ? (
				<div className="canvas-context__items">{children}</div>
			) : (
				<p>{t("common.none")}</p>
			)}
		</details>
	);
}

type KnowledgeContextState = "loading" | "ready" | "error";

function RelatedCandidateRow({
	candidate,
	onOpen,
	onAdd,
}: {
	candidate: RelatedCandidate;
	onOpen: () => void;
	onAdd: () => void;
}): React.ReactElement {
	const reason = formatCandidateReasons(candidate.reasons);
	return (
		<div className="canvas-context__candidate">
			<button type="button" className="canvas-context__reference" onClick={onOpen}>
				<span>{candidate.label}</span>
				<small>{reason}</small>
			</button>
			<button
				type="button"
				className="canvas-context__candidate-add"
				aria-label={t("context.addCandidate", { title: candidate.label })}
				onClick={onAdd}
			>
				{t("context.add")}
			</button>
		</div>
	);
}

function formatCandidateReasons(reasons: readonly RelatedCandidateReason[]): string {
	return reasons
		.map((reason) => {
			switch (reason.type) {
				case "outlink":
					return t("context.reasonOutlink");
				case "backlink":
					return t("context.reasonBacklink");
				case "tag":
					return t("context.reasonTag", { value: reason.value });
				case "heading":
					return t("context.reasonHeading", { value: reason.value });
			}
		})
		.join(" · ");
}

function NodeButton({
	node,
	onClick,
}: {
	node: RelatedNode;
	onClick: () => void;
}): React.ReactElement {
	return <ReferenceButton label={node.label} detail={node.kind} onClick={onClick} />;
}

function BacklinkButton({
	reference,
	onOpenArticle,
}: {
	reference: KnowledgeReference;
	onOpenArticle?: (path: string) => void;
}): React.ReactElement {
	return (
		<ReferenceButton
			label={reference.label}
			detail={reference.path}
			onClick={() => onOpenArticle?.(reference.path)}
		/>
	);
}

function ReferenceButton({
	label,
	detail,
	onClick,
}: {
	label: string;
	detail: string;
	onClick: () => void;
}): React.ReactElement {
	return (
		<button type="button" className="canvas-context__reference" onClick={onClick}>
			<span>{label}</span>
			<small>{detail}</small>
		</button>
	);
}

function findNodeData(data: CanvasData, id: string): CanvasNodeData | null {
	return data.nodes.find((node) => node.id === id) ?? null;
}

function connectedNodes(data: CanvasData, selectedId: string): RelatedNode[] {
	const ids = new Set<string>();
	for (const edge of data.edges ?? []) {
		if (edge.fromNode === selectedId) ids.add(edge.toNode);
		if (edge.toNode === selectedId) ids.add(edge.fromNode);
	}
	return data.nodes.filter((node) => ids.has(node.id)).map(toRelatedNode);
}

function nearbyNodes(
	data: CanvasData,
	selectedId: string,
	excluded: ReadonlySet<string>,
): RelatedNode[] {
	const selected = findNodeData(data, selectedId);
	if (!selected) return [];
	const center = nodeCenter(selected);
	return data.nodes
		.filter((node) => node.id !== selectedId && !excluded.has(node.id))
		.map((node) => ({ node, distance: squaredDistance(center, nodeCenter(node)) }))
		.toSorted((left, right) => left.distance - right.distance)
		.slice(0, 3)
		.map(({ node }) => toRelatedNode(node));
}

function toRelatedNode(node: CanvasNodeData): RelatedNode {
	return {
		id: node.id,
		kind: node.type,
		label:
			node.label ||
			node.text?.split("\n", 1)[0] ||
			node.file?.split("/").pop()?.replace(/\.md$/, "") ||
			node.url ||
			t("common.untitled"),
	};
}

function nodeCenter(node: CanvasNodeData): { x: number; y: number } {
	return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function squaredDistance(left: { x: number; y: number }, right: { x: number; y: number }): number {
	return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function nextCandidatePosition(
	data: CanvasData,
	selected: CanvasNodeData,
): { x: number; y: number } {
	const x = selected.x + selected.width + 80;
	let y = selected.y;
	while (
		data.nodes.some(
			(node) =>
				Math.abs(node.x - x) < 40 &&
				Math.abs(node.y - y) < Math.max(node.height, selected.height) / 2,
		)
	) {
		y += 80;
	}
	return { x, y };
}
