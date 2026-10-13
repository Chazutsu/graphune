import { useEmbeddableEditor } from "@/ui/hooks/use-embeddable-editor";
import type { EditorSaveResult } from "@/ui/hooks/use-embeddable-editor";
import type { EditorView } from "@codemirror/view";
import type React from "react";
import { useState } from "react";
import { t } from "@/i18n";

interface ArticleEditorProps {
	content: string;
	resourceKey?: string;
	onSave: (newContent: string) => EditorSaveResult | Promise<EditorSaveResult>;
	onEditorView?: (view: EditorView | null) => void;
}

type EditorRecoveryNoticeProps =
	| { status: "loading" }
	| { status: "error"; onRetry: () => void }
	| {
			status: "recovered";
			draft: { value: string; reason: "pending" | "conflict" | "failed" };
			onRestore: () => void;
			onDiscard: () => void;
	  };

export function EditorRecoveryNotice(props: EditorRecoveryNoticeProps): React.ReactElement {
	const [copied, setCopied] = useState(false);
	if (props.status === "loading") {
		return (
			<div className="article-editor-recovery is-loading" role="status" aria-live="polite">
				<div>
					<strong>{t("article.recoveryLoadingTitle")}</strong>
					<span>{t("article.recoveryLoading")}</span>
				</div>
			</div>
		);
	}
	if (props.status === "error") {
		return (
			<div className="article-editor-recovery is-error" role="alert">
				<div>
					<strong>{t("article.recoveryErrorTitle")}</strong>
					<span>{t("article.recoveryError")}</span>
				</div>
				<div className="article-editor-recovery__actions">
					<button type="button" onClick={props.onRetry} autoFocus>
						{t("article.recoveryRetry")}
					</button>
				</div>
			</div>
		);
	}
	return (
		<div
			className="article-editor-recovery is-recovered"
			role={props.draft.reason === "conflict" ? "alert" : "status"}
			aria-live={props.draft.reason === "conflict" ? "assertive" : "polite"}
		>
			<div>
				<strong>{t("article.recoveryTitle")}</strong>
				<span>
					{props.draft.reason === "conflict"
						? t("article.recoveryConflict")
						: t("article.recoveryAvailable")}
				</span>
			</div>
			<div className="article-editor-recovery__actions">
				<button type="button" className="mod-cta" onClick={props.onRestore} autoFocus>
					{t("article.recoveryRestore")}
				</button>
				<button
					type="button"
					onClick={async () => {
						await navigator.clipboard.writeText(props.draft.value);
						setCopied(true);
					}}
				>
					{copied ? t("article.recoveryCopied") : t("article.recoveryCopy")}
				</button>
				<button type="button" onClick={props.onDiscard}>
					{t("article.recoveryDiscard")}
				</button>
			</div>
		</div>
	);
}

export function ArticleEditor({
	content,
	resourceKey,
	onSave,
	onEditorView,
}: ArticleEditorProps): React.ReactElement {
	const {
		containerRef,
		recoveryStatus,
		recoveryDraft,
		restoreRecoveryDraft,
		discardRecoveryDraft,
		retryRecovery,
	} = useEmbeddableEditor({
		content,
		resourceKey,
		onSave,
		onEditorViewChange: onEditorView,
	});

	return (
		<div className="article-editor-shell flex-1 overflow-y-auto">
			{recoveryStatus === "loading" && <EditorRecoveryNotice status="loading" />}
			{recoveryStatus === "error" && (
				<EditorRecoveryNotice status="error" onRetry={retryRecovery} />
			)}
			{recoveryDraft && (
				<EditorRecoveryNotice
					status="recovered"
					draft={recoveryDraft}
					onRestore={restoreRecoveryDraft}
					onDiscard={discardRecoveryDraft}
				/>
			)}
			<div ref={containerRef} className="article-editor" />
		</div>
	);
}
