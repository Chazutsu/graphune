import type { KnowledgeReference, CanvasLocation } from "@/services/knowledge-context";
import { useApp } from "@/ui/hooks/use-app";
import { TFile } from "obsidian";
import { t } from "@/i18n";
import type React from "react";
import { useCallback } from "react";

interface ArticleInfoProps {
	sourcePath?: string;
	sourceHeading?: string;
	backlinks: KnowledgeReference[];
	canvases: CanvasLocation[];
}

export function ArticleInfo({
	sourcePath,
	sourceHeading,
	backlinks,
	canvases,
}: ArticleInfoProps): React.ReactElement {
	const { app } = useApp();
	const openFile = useCallback(
		async (path: string) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) await app.workspace.getLeaf(false).openFile(file);
		},
		[app],
	);

	return (
		<aside className="article-context" aria-label={t("article.context")}>
			{sourcePath && (
				<InfoSection title={t("article.source")} count={1}>
					<ReferenceButton
						label={sourceHeading || basename(sourcePath)}
						detail={sourcePath}
						onClick={() => void openFile(sourcePath)}
					/>
				</InfoSection>
			)}
			<InfoSection title={t("article.backlinks")} count={backlinks.length}>
				{backlinks.map((reference) => (
					<ReferenceButton
						key={reference.path}
						label={reference.label}
						detail={reference.path}
						onClick={() => void openFile(reference.path)}
					/>
				))}
			</InfoSection>
			<InfoSection title={t("article.canvases")} count={canvases.length}>
				{canvases.map((location) => (
					<ReferenceButton
						key={`${location.path}:${location.nodeId}`}
						label={location.label}
						detail={t("article.openCanvas")}
						onClick={() => void openFile(location.path)}
					/>
				))}
			</InfoSection>
		</aside>
	);
}

function InfoSection({
	title,
	count,
	children,
}: {
	title: string;
	count: number;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<section className="article-context__section">
			<h3 className="article-context__heading">
				<span>{title}</span>
				<span className="article-context__count" aria-label={t("common.items", { count })}>
					{count}
				</span>
			</h3>
			{count > 0 ? (
				<div className="article-context__items">{children}</div>
			) : (
				<p className="article-context__empty">{t("common.none")}</p>
			)}
		</section>
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
		<button type="button" className="article-context__reference" onClick={onClick}>
			<span className="article-context__label">{label}</span>
			<span className="article-context__detail">{detail}</span>
		</button>
	);
}

function basename(path: string): string {
	return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}
