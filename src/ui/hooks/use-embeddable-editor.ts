import {
	type EmbeddableEditorHandle,
	type EmbeddableEditorOptions,
	createEmbeddableEditor,
} from "@/services/embeddable-editor";
import { notifyError } from "@/utils/notify-error";
import { t } from "@/i18n";
import { EditorDraftJournal, type EditorDraftReason } from "@/services/editor-draft-journal";
import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./use-app";

interface UseEmbeddableEditorProps {
	content: string;
	resourceKey?: string;
	onSave: (newContent: string) => EditorSaveResult | Promise<EditorSaveResult>;
	onEditorViewChange?: (view: EditorView | null) => void;
	_containerOverride?: HTMLElement;
}

export type EditorSaveResult =
	| { status: "saved" }
	| { status: "unchanged" }
	| { status: "conflict" }
	| { status: "failed"; error: unknown };

const pendingDrafts = new Map<string, string>();
const journals = new WeakMap<object, EditorDraftJournal>();

export interface EditorRecoveryDraft {
	value: string;
	reason: EditorDraftReason;
}

interface UseEmbeddableEditorReturn {
	containerRef: React.RefObject<HTMLDivElement | null>;
	editorView: EditorView | null;
	recoveryStatus: "loading" | "idle" | "recovered" | "error";
	recoveryDraft: EditorRecoveryDraft | null;
	restoreRecoveryDraft: () => void;
	discardRecoveryDraft: () => void;
	retryRecovery: () => void;
}

export function useEmbeddableEditor({
	content,
	resourceKey = "__default__",
	onSave,
	onEditorViewChange,
	_containerOverride,
}: UseEmbeddableEditorProps): UseEmbeddableEditorReturn {
	const { app } = useApp();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const editorRef = useRef<EmbeddableEditorHandle | null>(null);
	const [editorView, setEditorView] = useState<EditorView | null>(null);
	const [recoveryState, setRecoveryState] = useState<{
		resourceKey: string;
		draft: EditorRecoveryDraft;
	} | null>(null);
	const [recoveryCheck, setRecoveryCheck] = useState<{
		resourceKey: string;
		status: "loading" | "idle" | "error";
		request: number;
	}>({ resourceKey, status: "loading", request: 0 });
	const recoveryDraft = recoveryState?.resourceKey === resourceKey ? recoveryState.draft : null;
	const recoveryStatus = recoveryDraft
		? "recovered"
		: recoveryCheck.resourceKey === resourceKey
			? recoveryCheck.status
			: "loading";
	const recoveryAttempt = recoveryCheck.request;
	const journal = useMemo(() => {
		const existing = journals.get(app);
		if (existing) return existing;
		const created = new EditorDraftJournal(app);
		journals.set(app, created);
		return created;
	}, [app]);
	const onSaveRef = useRef(onSave);
	const onEditorViewChangeRef = useRef(onEditorViewChange);
	const contentRef = useRef(content);
	const debounceTimerRef = useRef<number>(0);
	const dirtyValueRef = useRef<string | null>(null);
	const saveInFlightRef = useRef<Promise<void> | null>(null);
	const pendingSavesRef = useRef<
		Array<{
			value: string;
			resourceKey: string;
			save: (value: string) => EditorSaveResult | Promise<EditorSaveResult>;
		}>
	>([]);

	useEffect(() => {
		onSaveRef.current = onSave;
		onEditorViewChangeRef.current = onEditorViewChange;
		contentRef.current = content;
	}, [content, onEditorViewChange, onSave]);

	const getContainer = useCallback(() => {
		return _containerOverride ?? containerRef.current;
	}, [_containerOverride]);

	const runNextSave = useCallback(
		function drainSaveQueue() {
			if (saveInFlightRef.current) return;
			const next = pendingSavesRef.current.shift();
			if (!next) return;
			let result: EditorSaveResult | Promise<EditorSaveResult>;
			try {
				result = next.save(next.value);
			} catch (error) {
				pendingDrafts.set(next.resourceKey, next.value);
				void journal.write(next.resourceKey, next.value, "failed").catch(() => undefined);
				setRecoveryState({
					resourceKey: next.resourceKey,
					draft: { value: next.value, reason: "failed" },
				});
				notifyError(t("article.saveFailed"), error);
				drainSaveQueue();
				return;
			}
			const inFlight = Promise.resolve(result)
				.then((saveResult) => {
					if (
						saveResult === undefined ||
						saveResult.status === "saved" ||
						saveResult.status === "unchanged"
					) {
						if (pendingDrafts.get(next.resourceKey) === next.value) {
							pendingDrafts.delete(next.resourceKey);
						}
						void journal.remove(next.resourceKey, next.value).catch(() => undefined);
						setRecoveryState((state) =>
							state?.resourceKey === next.resourceKey && state.draft.value === next.value
								? null
								: state,
						);
						if (dirtyValueRef.current === next.value) dirtyValueRef.current = null;
						return;
					}
					pendingDrafts.set(next.resourceKey, next.value);
					const reason = saveResult.status === "conflict" ? "conflict" : "failed";
					void journal.write(next.resourceKey, next.value, reason).catch(() => undefined);
					setRecoveryState({ resourceKey: next.resourceKey, draft: { value: next.value, reason } });
					notifyError(
						saveResult.status === "conflict" ? t("article.saveConflict") : t("article.saveFailed"),
						saveResult.status === "failed" ? saveResult.error : new Error("Concurrent edit"),
					);
				})
				.catch((error) => {
					pendingDrafts.set(next.resourceKey, next.value);
					void journal.write(next.resourceKey, next.value, "failed").catch(() => undefined);
					setRecoveryState({
						resourceKey: next.resourceKey,
						draft: { value: next.value, reason: "failed" },
					});
					notifyError(t("article.saveFailed"), error);
				})
				.finally(() => {
					if (saveInFlightRef.current === inFlight) saveInFlightRef.current = null;
					drainSaveQueue();
				});
			saveInFlightRef.current = inFlight;
		},
		[journal],
	);

	const enqueueSave = useCallback(
		(value: string) => {
			const save = onSaveRef.current;
			pendingDrafts.set(resourceKey, value);
			void journal.write(resourceKey, value, "pending").catch(() => undefined);
			pendingSavesRef.current.push({ value, resourceKey, save });
			runNextSave();
		},
		[journal, resourceKey, runNextSave],
	);

	useEffect(() => {
		const container = getContainer();
		if (!container) {
			return;
		}
		dirtyValueRef.current = pendingDrafts.get(resourceKey) ?? null;

		const options: EmbeddableEditorOptions = {
			value: pendingDrafts.get(resourceKey) ?? contentRef.current,
			onBlur: (editor: EmbeddableEditorHandle) => {
				clearTimeout(debounceTimerRef.current);
				enqueueSave(editor.value);
			},
			onChange: (editor: EmbeddableEditorHandle) => {
				clearTimeout(debounceTimerRef.current);
				dirtyValueRef.current = editor.value;
				pendingDrafts.set(resourceKey, editor.value);
				void journal.writeCoalesced(resourceKey, editor.value, "pending").catch(() => undefined);
				debounceTimerRef.current = window.setTimeout(() => {
					enqueueSave(dirtyValueRef.current ?? editor.value);
				}, 300);
			},
		};

		const editor = createEmbeddableEditor(app, container, options);
		editorRef.current = editor;
		setEditorView(editor.cm);
		onEditorViewChangeRef.current?.(editor.cm);
		let cancelled = false;
		setRecoveryCheck({ resourceKey, status: "loading", request: recoveryAttempt });
		void journal
			.readWithStatus(resourceKey)
			.then((result) => {
				if (cancelled) return;
				if (result.status === "error") {
					setRecoveryCheck((state) => ({ ...state, resourceKey, status: "error" }));
					return;
				}
				const draft = result.draft;
				if (!draft || dirtyValueRef.current !== null) {
					setRecoveryCheck((state) => ({ ...state, resourceKey, status: "idle" }));
					return;
				}
				setRecoveryState({
					resourceKey,
					draft: { value: draft.value, reason: draft.reason },
				});
				setRecoveryCheck((state) => ({ ...state, resourceKey, status: "idle" }));
			})
			.catch(() => {
				if (!cancelled) {
					setRecoveryCheck((state) => ({ ...state, resourceKey, status: "error" }));
				}
			});

		return () => {
			cancelled = true;
			clearTimeout(debounceTimerRef.current);
			if (dirtyValueRef.current !== null) enqueueSave(dirtyValueRef.current);
			editor.destroy();
			editorRef.current = null;
			setEditorView(null);
			onEditorViewChangeRef.current?.(null);
		};
	}, [app, enqueueSave, getContainer, journal, recoveryAttempt, resourceKey]);

	useEffect(() => {
		if (
			editorRef.current &&
			!pendingDrafts.has(resourceKey) &&
			content !== editorRef.current.value
		) {
			editorRef.current.set(content);
		}
	}, [content, resourceKey]);

	const restoreRecoveryDraft = useCallback(() => {
		if (!recoveryDraft) return;
		pendingDrafts.set(resourceKey, recoveryDraft.value);
		dirtyValueRef.current = recoveryDraft.value;
		editorRef.current?.set(recoveryDraft.value);
		setRecoveryState((state) => (state?.resourceKey === resourceKey ? null : state));
		editorRef.current?.cm.focus?.();
	}, [recoveryDraft, resourceKey]);

	const discardRecoveryDraft = useCallback(() => {
		pendingDrafts.delete(resourceKey);
		dirtyValueRef.current = null;
		void journal.remove(resourceKey).catch(() => undefined);
		setRecoveryState((state) => (state?.resourceKey === resourceKey ? null : state));
		editorRef.current?.set(contentRef.current);
		editorRef.current?.cm.focus?.();
	}, [journal, resourceKey]);

	const retryRecovery = useCallback(() => {
		setRecoveryCheck((state) => ({ resourceKey, status: "loading", request: state.request + 1 }));
	}, [resourceKey]);

	return {
		containerRef,
		editorView,
		recoveryStatus,
		recoveryDraft,
		restoreRecoveryDraft,
		discardRecoveryDraft,
		retryRecovery,
	};
}
