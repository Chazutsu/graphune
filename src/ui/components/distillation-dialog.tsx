import { t } from "@/i18n";
import { CanvasOperator } from "@/services/canvas-operator";
import { DistillationService, sourcesFromCanvasNodes } from "@/services/distillation-service";
import { FileCreator } from "@/services/file-creator";
import {
	distillationDraftKey,
	getDistillationDraftStore,
	type DistillationFormDraft,
} from "@/services/distillation-draft-store";
import type { CanvasNodeData, CanvasView } from "@/types/obsidian-canvas";
import { useApp } from "@/ui/hooks/use-app";
import type { TFile } from "obsidian";
import type React from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

const EMPTY_DRAFT: DistillationFormDraft = { title: "", body: "", target: "", reason: "" };
const MAX_VISIBLE_CANDIDATES = 50;

interface NoteComboboxProps {
	candidates: TFile[];
	value: string;
	onChange: (path: string) => void;
}

function NoteCombobox({ candidates, value, onChange }: NoteComboboxProps): React.ReactElement {
	const listboxId = useId();
	const selected = candidates.find((file) => file.path === value);
	const [query, setQuery] = useState(() => selected?.basename ?? "");
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const results = useMemo(
		() =>
			(normalizedQuery
				? candidates.filter(
						(file) =>
							file.basename.toLocaleLowerCase().includes(normalizedQuery) ||
							file.path.toLocaleLowerCase().includes(normalizedQuery),
					)
				: candidates
			).slice(0, MAX_VISIBLE_CANDIDATES),
		[candidates, normalizedQuery],
	);

	useEffect(() => {
		const restored = candidates.find((file) => file.path === value);
		if (restored && document.activeElement !== inputRef.current) setQuery(restored.basename);
	}, [candidates, value]);

	const choose = (file: TFile) => {
		onChange(file.path);
		setQuery(file.basename);
		setOpen(false);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			setOpen(true);
			setActiveIndex((current) => {
				if (results.length === 0) return 0;
				return event.key === "ArrowDown"
					? Math.min(current + 1, results.length - 1)
					: Math.max(current - 1, 0);
			});
			return;
		}
		if (event.key === "Enter" && open && results[activeIndex]) {
			event.preventDefault();
			choose(results[activeIndex]);
			return;
		}
		if (event.key === "Escape" && open) {
			event.preventDefault();
			event.stopPropagation();
			setOpen(false);
			setQuery(selected?.basename ?? "");
			return;
		}
		if (event.key === "Tab") setOpen(false);
	};

	return (
		<div className="distillation-dialog__combobox">
			<input
				ref={inputRef}
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls={listboxId}
				aria-activedescendant={
					open && results[activeIndex] ? `${listboxId}-${activeIndex}` : undefined
				}
				value={query}
				placeholder={t("distill.contextPlaceholder")}
				onFocus={() => setOpen(true)}
				onChange={(event) => {
					setQuery(event.target.value);
					onChange("");
					setActiveIndex(0);
					setOpen(true);
				}}
				onKeyDown={handleKeyDown}
			/>
			{open && (
				<ul id={listboxId} role="listbox" aria-label={t("distill.contextResults")}>
					{results.length === 0 ? (
						<li className="distillation-dialog__empty">{t("distill.contextNoResults")}</li>
					) : (
						results.map((file, index) => (
							<li
								id={`${listboxId}-${index}`}
								key={file.path}
								role="option"
								aria-selected={file.path === value}
								data-active={index === activeIndex}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => choose(file)}
							>
								<strong>{file.basename}</strong>
								<span>{file.path}</span>
							</li>
						))
					)}
				</ul>
			)}
		</div>
	);
}

interface DistillationDialogProps {
	canvasView: CanvasView;
	selectedNodes: CanvasNodeData[];
	canvasOperator: CanvasOperator;
	onClose: () => void;
	onComplete: (path: string) => void;
}

export function DistillationDialog({
	canvasView,
	selectedNodes,
	canvasOperator,
	onClose,
	onComplete,
}: DistillationDialogProps): React.ReactElement {
	const { app, settings } = useApp();
	const sources = useMemo(() => sourcesFromCanvasNodes(selectedNodes), [selectedNodes]);
	const sourcePaths = useMemo(
		() => new Set(sources.flatMap((source) => (source.path ? [source.path] : []))),
		[sources],
	);
	const candidates = useMemo(
		() =>
			app.vault
				.getMarkdownFiles()
				.filter((file) => !sourcePaths.has(file.path))
				.toSorted((left, right) => left.basename.localeCompare(right.basename)),
		[app.vault, sourcePaths],
	);
	const service = useMemo(
		() => new DistillationService(app, new FileCreator(app, settings), canvasOperator),
		[app, canvasOperator, settings],
	);
	const draftStore = useMemo(() => getDistillationDraftStore(app), [app]);
	const resourceKey = useMemo(
		() =>
			distillationDraftKey(
				canvasView.file.path,
				selectedNodes.map((node) => node.id),
			),
		[canvasView.file.path, selectedNodes],
	);
	const touched = useRef(false);
	const [draft, setDraft] = useState<DistillationFormDraft>(EMPTY_DRAFT);
	const draftRef = useRef(draft);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	const updateDraft = useCallback(
		(patch: Partial<DistillationFormDraft>) => {
			touched.current = true;
			const next = { ...draftRef.current, ...patch };
			draftRef.current = next;
			setDraft(next);
			void draftStore.save(resourceKey, next).catch(() => undefined);
		},
		[draftStore, resourceKey],
	);

	useEffect(() => {
		let cancelled = false;
		void draftStore
			.read(resourceKey)
			.then((recoveredDraft) => {
				if (cancelled || touched.current || !recoveredDraft) return;
				draftRef.current = recoveredDraft;
				setDraft(recoveredDraft);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [draftStore, resourceKey]);

	useEffect(() => {
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || saving) return;
			event.preventDefault();
			onClose();
		};
		window.addEventListener("keydown", closeOnEscape);
		return () => window.removeEventListener("keydown", closeOnEscape);
	}, [onClose, saving]);

	const submit = async (event: React.SubmitEvent) => {
		event.preventDefault();
		setError("");
		setSaving(true);
		try {
			const submittedDraft = draftRef.current;
			const file = await service.distill(
				canvasView,
				selectedNodes.map((node) => node.id),
				{
					title: submittedDraft.title,
					body: submittedDraft.body,
					sources,
					connection: { path: submittedDraft.target, reason: submittedDraft.reason },
				},
			);
			try {
				await draftStore.clear(resourceKey, submittedDraft);
			} catch {
				// Draft cleanup is best-effort and must not turn a created note into a failure.
			}
			onComplete(file.path);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : t("distill.failed"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="distillation-dialog__backdrop">
			<section
				className="distillation-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="distillation-dialog-title"
			>
				<header>
					<div>
						<span>{t("distill.step")}</span>
						<h2 id="distillation-dialog-title">{t("distill.title")}</h2>
					</div>
					<button type="button" aria-label={t("distill.close")} onClick={onClose} disabled={saving}>
						×
					</button>
				</header>
				<div className="distillation-dialog__sources" aria-label={t("distill.sources")}>
					{sources.map((source, index) => (
						<span key={`${source.path ?? "text"}:${source.subpath ?? index}`}>{source.label}</span>
					))}
				</div>
				<form onSubmit={(event) => void submit(event)}>
					<label>
						<span>{t("distill.noteTitle")}</span>
						<input
							autoFocus
							value={draft.title}
							onChange={(event) => updateDraft({ title: event.target.value })}
						/>
					</label>
					<label>
						<span>{t("distill.body")}</span>
						<textarea
							rows={7}
							value={draft.body}
							onChange={(event) => updateDraft({ body: event.target.value })}
							placeholder={t("distill.bodyPlaceholder")}
						/>
					</label>
					<div className="distillation-dialog__connection">
						<label>
							<span>{t("distill.context")}</span>
							<NoteCombobox
								candidates={candidates}
								value={draft.target}
								onChange={(target) => updateDraft({ target })}
							/>
						</label>
						<label>
							<span>{t("distill.reason")}</span>
							<input
								value={draft.reason}
								onChange={(event) => updateDraft({ reason: event.target.value })}
							/>
						</label>
					</div>
					{error && (
						<p className="distillation-dialog__error" role="alert">
							{error}
						</p>
					)}
					<footer>
						<button type="button" onClick={onClose} disabled={saving}>
							{t("distill.cancel")}
						</button>
						<button
							type="submit"
							className="mod-cta"
							disabled={
								saving ||
								!draft.title.trim() ||
								!draft.body.trim() ||
								!draft.target ||
								!draft.reason.trim()
							}
						>
							{saving ? t("distill.saving") : t("distill.create")}
						</button>
					</footer>
				</form>
			</section>
		</div>
	);
}
