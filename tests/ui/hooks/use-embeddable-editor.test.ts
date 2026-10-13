import type { EmbeddableEditorHandle, EmbeddableEditorOptions } from "@/services/embeddable-editor";
import { useEmbeddableEditor } from "@/ui/hooks/use-embeddable-editor";
import { act, renderHook, waitFor } from "@testing-library/react";
import { App } from "obsidian";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

vi.mock("@/services/embeddable-editor", () => ({
	createEmbeddableEditor: vi.fn(),
}));

import { createEmbeddableEditor } from "@/services/embeddable-editor";
import { editorDraftKey } from "@/services/editor-draft-journal";

function createMockEditor(): EmbeddableEditorHandle {
	return {
		value: "",
		set: vi.fn(),
		cm: {} as EmbeddableEditorHandle["cm"],
		destroy: vi.fn(),
	};
}

describe("useEmbeddableEditor", () => {
	let app: App;
	let mockEditor: EmbeddableEditorHandle;

	beforeEach(() => {
		app = new App();
		mockEditor = createMockEditor();
		(createEmbeddableEditor as Mock).mockReturnValue(mockEditor);
	});

	afterEach(async () => {
		await act(async () => {
			await Promise.resolve();
		});
		vi.restoreAllMocks();
	});

	it("creates editor when container ref is set and content is provided", () => {
		const container = document.createElement("div");

		const { result } = renderHook(
			() =>
				useEmbeddableEditor({
					content: "# Hello",
					onSave: vi.fn(),
				}),
			{ wrapper: createWrapper(app) },
		);

		// Simulate ref assignment
		(result.current.containerRef as { current: HTMLDivElement | null }).current = container;

		// Re-render to trigger effect
		const { result: result2 } = renderHook(
			() =>
				useEmbeddableEditor({
					content: "# Hello",
					onSave: vi.fn(),
				}),
			{ wrapper: createWrapper(app) },
		);

		expect(result2.current.containerRef).toBeDefined();
	});

	it("calls editor.set when content changes", async () => {
		const container = document.createElement("div");
		(createEmbeddableEditor as Mock).mockImplementation((_app: App, _container: HTMLElement) => {
			return mockEditor;
		});

		const { rerender, result } = renderHook(
			({ content }) =>
				useEmbeddableEditor({
					content,
					onSave: vi.fn(),
					_containerOverride: container,
				}),
			{
				wrapper: createWrapper(app),
				initialProps: { content: "# Hello" },
			},
		);

		await waitFor(() => expect(result.current.recoveryStatus).toBe("idle"));
		act(() => rerender({ content: "# Updated" }));

		expect(mockEditor.set).toHaveBeenCalledWith("# Updated");
	});

	it("calls editor.destroy on unmount", () => {
		const container = document.createElement("div");

		const { unmount } = renderHook(
			() =>
				useEmbeddableEditor({
					content: "# Hello",
					onSave: vi.fn(),
					_containerOverride: container,
				}),
			{ wrapper: createWrapper(app) },
		);

		unmount();

		expect(mockEditor.destroy).toHaveBeenCalled();
	});

	it("passes onBlur that calls onSave with editor value", async () => {
		const container = document.createElement("div");
		const onSave = vi.fn();
		let capturedOnBlur: ((editor: EmbeddableEditorHandle) => void) | undefined;

		(createEmbeddableEditor as Mock).mockImplementation(
			(
				_app: App,
				_container: HTMLElement,
				options: { onBlur?: (editor: EmbeddableEditorHandle) => void },
			) => {
				capturedOnBlur = options.onBlur;
				return mockEditor;
			},
		);

		renderHook(
			() =>
				useEmbeddableEditor({
					content: "# Hello",
					onSave,
					_containerOverride: container,
				}),
			{ wrapper: createWrapper(app) },
		);

		expect(capturedOnBlur).toBeDefined();
		const editorWithValue = { ...mockEditor, value: "# Saved content" };
		await act(async () => {
			capturedOnBlur!(editorWithValue);
			await Promise.resolve();
		});

		expect(onSave).toHaveBeenCalledWith("# Saved content");
	});

	it("returns editorView as null when no container", () => {
		const { result } = renderHook(
			() =>
				useEmbeddableEditor({
					content: "# Hello",
					onSave: vi.fn(),
				}),
			{ wrapper: createWrapper(app) },
		);

		expect(result.current.editorView).toBeNull();
	});

	it("calls onEditorViewChange with EditorView on init and null on unmount", () => {
		const container = document.createElement("div");
		const onEditorViewChange = vi.fn();

		const { unmount } = renderHook(
			() =>
				useEmbeddableEditor({
					content: "# Hello",
					onSave: vi.fn(),
					onEditorViewChange,
					_containerOverride: container,
				}),
			{ wrapper: createWrapper(app) },
		);

		expect(onEditorViewChange).toHaveBeenCalledWith(mockEditor.cm);

		unmount();

		expect(onEditorViewChange).toHaveBeenCalledWith(null);
	});

	describe("onChange auto-save", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("passes onChange callback to createEmbeddableEditor", async () => {
			const container = document.createElement("div");

			const { result } = renderHook(
				() =>
					useEmbeddableEditor({
						content: "# Hello",
						onSave: vi.fn(),
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);
			await act(async () => await vi.advanceTimersByTimeAsync(0));
			expect(result.current.recoveryStatus).toBe("idle");

			const options = (createEmbeddableEditor as Mock).mock.calls[0][2] as EmbeddableEditorOptions;
			expect(options.onChange).toBeDefined();
			expect(typeof options.onChange).toBe("function");
		});

		it("calls onSave after debounce delay when onChange fires", async () => {
			const container = document.createElement("div");
			const onSave = vi.fn();
			let capturedOnChange: ((editor: EmbeddableEditorHandle) => void) | undefined;

			(createEmbeddableEditor as Mock).mockImplementation(
				(_app: App, _container: HTMLElement, options: EmbeddableEditorOptions) => {
					capturedOnChange = options.onChange;
					return mockEditor;
				},
			);

			renderHook(
				() =>
					useEmbeddableEditor({
						content: "# Hello",
						onSave,
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);

			const editorWithValue = { ...mockEditor, value: "# Changed" };
			act(() => capturedOnChange!(editorWithValue));

			expect(onSave).not.toHaveBeenCalled();

			await act(async () => {
				vi.advanceTimersByTime(300);
				await Promise.resolve();
			});

			expect(onSave).toHaveBeenCalledWith("# Changed");
		});

		it("records a recovery draft before the 300ms autosave window elapses", async () => {
			const container = document.createElement("div");
			let capturedOnChange: ((editor: EmbeddableEditorHandle) => void) | undefined;
			(createEmbeddableEditor as Mock).mockImplementation(
				(_app: App, _container: HTMLElement, options: EmbeddableEditorOptions) => {
					capturedOnChange = options.onChange;
					return mockEditor;
				},
			);
			const onSave = vi.fn();
			renderHook(
				() =>
					useEmbeddableEditor({
						content: "# Hello",
						resourceKey: "crash-window.md",
						onSave,
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);

			await act(async () => {
				capturedOnChange!({ ...mockEditor, value: "# Survives crash" });
				await vi.advanceTimersByTimeAsync(0);
			});

			expect(onSave).not.toHaveBeenCalled();
			expect(app.vault.create).toHaveBeenCalledWith(
				".graphune/recovery/editor-drafts.json",
				expect.stringContaining("# Survives crash"),
			);
		});

		it("resets debounce timer when onChange fires again before delay", async () => {
			const container = document.createElement("div");
			const onSave = vi.fn();
			let capturedOnChange: ((editor: EmbeddableEditorHandle) => void) | undefined;

			(createEmbeddableEditor as Mock).mockImplementation(
				(_app: App, _container: HTMLElement, options: EmbeddableEditorOptions) => {
					capturedOnChange = options.onChange;
					return mockEditor;
				},
			);

			renderHook(
				() =>
					useEmbeddableEditor({
						content: "# Hello",
						onSave,
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);

			act(() => {
				capturedOnChange!({ ...mockEditor, value: "# First" });
				vi.advanceTimersByTime(200);
			});

			act(() => {
				capturedOnChange!({ ...mockEditor, value: "# Second" });
				vi.advanceTimersByTime(200);
			});

			expect(onSave).not.toHaveBeenCalled();

			await act(async () => {
				vi.advanceTimersByTime(100);
				await Promise.resolve();
			});

			expect(onSave).toHaveBeenCalledTimes(1);
			expect(onSave).toHaveBeenCalledWith("# Second");
		});

		it("flushes a pending edit on unmount before switching files", () => {
			const container = document.createElement("div");
			const onSave = vi.fn();
			let capturedOnChange: ((editor: EmbeddableEditorHandle) => void) | undefined;

			(createEmbeddableEditor as Mock).mockImplementation(
				(_app: App, _container: HTMLElement, options: EmbeddableEditorOptions) => {
					capturedOnChange = options.onChange;
					return mockEditor;
				},
			);

			const { unmount } = renderHook(
				() =>
					useEmbeddableEditor({
						content: "# Hello",
						onSave,
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);

			act(() => capturedOnChange!({ ...mockEditor, value: "# Pending" }));

			unmount();
			vi.advanceTimersByTime(300);

			expect(onSave).toHaveBeenCalledTimes(1);
			expect(onSave).toHaveBeenCalledWith("# Pending");
		});

		it("serializes saves so an older slow save cannot finish after a newer save", async () => {
			const container = document.createElement("div");
			let releaseFirst: (() => void) | undefined;
			const order: string[] = [];
			const onSave = vi.fn((value: string) => {
				if (value === "# First") {
					return new Promise<{ status: "saved" }>((resolve) => {
						releaseFirst = () => {
							order.push(value);
							resolve({ status: "saved" });
						};
					});
				}
				order.push(value);
			});
			let options: EmbeddableEditorOptions | undefined;
			(createEmbeddableEditor as Mock).mockImplementation(
				(_app: App, _container: HTMLElement, captured: EmbeddableEditorOptions) => {
					options = captured;
					return mockEditor;
				},
			);

			const { result } = renderHook(
				() => useEmbeddableEditor({ content: "# Initial", onSave, _containerOverride: container }),
				{ wrapper: createWrapper(app) },
			);
			await act(async () => await vi.advanceTimersByTimeAsync(0));
			expect(result.current.recoveryStatus).toBe("idle");
			await act(async () => {
				options!.onChange!({ ...mockEditor, value: "# First" });
				vi.advanceTimersByTime(300);
				await Promise.resolve();
				options!.onChange!({ ...mockEditor, value: "# Second" });
				vi.advanceTimersByTime(300);
				await Promise.resolve();
			});

			expect(onSave).toHaveBeenCalledTimes(1);
			releaseFirst!();
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
				await Promise.resolve();
				await Promise.resolve();
			});
			expect(order).toEqual(["# First", "# Second"]);
		});

		it("cancels the pending debounce save when blur saves immediately", async () => {
			const container = document.createElement("div");
			const onSave = vi.fn();
			let options: EmbeddableEditorOptions | undefined;
			(createEmbeddableEditor as Mock).mockImplementation(
				(_app: App, _container: HTMLElement, captured: EmbeddableEditorOptions) => {
					options = captured;
					return mockEditor;
				},
			);
			renderHook(
				() => useEmbeddableEditor({ content: "# Hello", onSave, _containerOverride: container }),
				{ wrapper: createWrapper(app) },
			);
			const changedEditor = { ...mockEditor, value: "# Changed" };

			await act(async () => {
				options!.onChange!(changedEditor);
				options!.onBlur!(changedEditor);
				vi.advanceTimersByTime(300);
				await Promise.resolve();
			});

			expect(onSave).toHaveBeenCalledTimes(1);
			expect(onSave).toHaveBeenCalledWith("# Changed");
		});

		it("restores a conflicted draft when the same file is reopened", async () => {
			const container = document.createElement("div");
			const editors: EmbeddableEditorOptions[] = [];
			(createEmbeddableEditor as Mock).mockImplementation(
				(_app: App, _container: HTMLElement, options: EmbeddableEditorOptions) => {
					editors.push(options);
					return createMockEditor();
				},
			);
			const onSave = vi.fn().mockResolvedValue({ status: "conflict" });
			const first = renderHook(
				() =>
					useEmbeddableEditor({
						content: "server",
						resourceKey: "conflict-note.md",
						onSave,
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);
			await act(async () => {
				editors[0]!.onChange!({ ...mockEditor, value: "local draft" });
				await vi.advanceTimersByTimeAsync(300);
			});
			first.unmount();
			await Promise.resolve();

			renderHook(
				() =>
					useEmbeddableEditor({
						content: "external edit",
						resourceKey: "conflict-note.md",
						onSave,
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);

			expect(editors.at(-1)?.value).toBe("local draft");
		});

		it("keeps a failed switch flush in the original file buffer", async () => {
			const container = document.createElement("div");
			const editors: EmbeddableEditorOptions[] = [];
			(createEmbeddableEditor as Mock).mockImplementation(
				(_app: App, _container: HTMLElement, options: EmbeddableEditorOptions) => {
					editors.push(options);
					return createMockEditor();
				},
			);
			const onSave = vi.fn().mockResolvedValue({ status: "failed", error: new Error("busy") });
			const { rerender, result } = renderHook(
				({ resourceKey, content }) =>
					useEmbeddableEditor({
						content,
						resourceKey,
						onSave,
						_containerOverride: container,
					}),
				{
					wrapper: createWrapper(app),
					initialProps: { resourceKey: "a.md", content: "A" },
				},
			);
			await act(async () => await vi.advanceTimersByTimeAsync(0));
			expect(result.current.recoveryStatus).toBe("idle");
			act(() => editors[0]!.onChange!({ ...mockEditor, value: "A unsaved" }));
			await act(async () => {
				rerender({ resourceKey: "b.md", content: "B" });
				await Promise.resolve();
			});
			await act(async () => {
				rerender({ resourceKey: "a.md", content: "A external" });
				await Promise.resolve();
			});

			expect(onSave).toHaveBeenCalledWith("A unsaved");
			expect(editors.at(-1)?.value).toBe("A unsaved");
		});

		it("retries a retained failed draft on the next blur", async () => {
			const container = document.createElement("div");
			let options: EmbeddableEditorOptions | undefined;
			(createEmbeddableEditor as Mock).mockImplementation(
				(_app: App, _container: HTMLElement, captured: EmbeddableEditorOptions) => {
					options = captured;
					return mockEditor;
				},
			);
			const onSave = vi
				.fn()
				.mockResolvedValueOnce({ status: "failed", error: new Error("busy") })
				.mockResolvedValueOnce({ status: "saved" });
			renderHook(
				() =>
					useEmbeddableEditor({
						content: "old",
						resourceKey: "retry-note.md",
						onSave,
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);
			const changed = { ...mockEditor, value: "retry me" };
			await act(async () => {
				options!.onChange!(changed);
				await vi.advanceTimersByTimeAsync(300);
				options!.onBlur!(changed);
				await Promise.resolve();
				await Promise.resolve();
			});

			expect(onSave).toHaveBeenCalledTimes(2);
		});

		it("offers a durable journal draft without replacing saved content and can discard it", async () => {
			const focus = vi.fn();
			mockEditor.cm = { focus } as unknown as EmbeddableEditorHandle["cm"];
			const container = document.createElement("div");
			const journalFile = new (await import("obsidian")).TFile(
				".graphune/recovery/editor-drafts.json",
			);
			(app.vault.getAbstractFileByPath as Mock).mockImplementation((path: string) =>
				path === journalFile.path ? journalFile : null,
			);
			(app.vault.cachedRead as Mock).mockResolvedValue(
				JSON.stringify({
					version: 1,
					drafts: {
						[editorDraftKey("reload-note.md")]: {
							resourceKey: "reload-note.md",
							value: "durable local draft",
							reason: "conflict",
							updatedAt: 1,
						},
					},
				}),
			);
			const { result } = renderHook(
				() =>
					useEmbeddableEditor({
						content: "external edit",
						resourceKey: "reload-note.md",
						onSave: vi.fn(),
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);

			await act(async () => await vi.advanceTimersByTimeAsync(0));

			expect(mockEditor.set).not.toHaveBeenCalledWith("durable local draft");
			await vi.waitFor(() =>
				expect(result.current.recoveryDraft).toMatchObject({
					value: "durable local draft",
					reason: "conflict",
				}),
			);
			expect(result.current.recoveryStatus).toBe("recovered");
			act(() => result.current.discardRecoveryDraft());
			expect(mockEditor.set).toHaveBeenLastCalledWith("external edit");
			expect(result.current.recoveryDraft).toBeNull();
			expect(focus).toHaveBeenCalledOnce();
		});

		it("applies a durable journal draft only after restore is chosen", async () => {
			const container = document.createElement("div");
			const focus = vi.fn();
			mockEditor.cm = { focus } as unknown as EmbeddableEditorHandle["cm"];
			const journalFile = new (await import("obsidian")).TFile(
				".graphune/recovery/editor-drafts.json",
			);
			(app.vault.getAbstractFileByPath as Mock).mockImplementation((path: string) =>
				path === journalFile.path ? journalFile : null,
			);
			(app.vault.cachedRead as Mock).mockResolvedValue(
				JSON.stringify({
					version: 1,
					drafts: {
						[editorDraftKey("restore-note.md")]: {
							resourceKey: "restore-note.md",
							value: "restore this draft",
							reason: "failed",
							updatedAt: 1,
						},
					},
				}),
			);
			const { result } = renderHook(
				() =>
					useEmbeddableEditor({
						content: "saved content",
						resourceKey: "restore-note.md",
						onSave: vi.fn(),
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);

			await act(async () => await vi.advanceTimersByTimeAsync(0));
			expect(result.current.recoveryStatus).toBe("recovered");
			expect(mockEditor.set).not.toHaveBeenCalledWith("restore this draft");
			act(() => result.current.restoreRecoveryDraft());
			expect(mockEditor.set).toHaveBeenCalledWith("restore this draft");
			expect(result.current.recoveryStatus).toBe("idle");
			expect(focus).toHaveBeenCalledOnce();
		});

		it("exposes a failed recovery check and retries it", async () => {
			const container = document.createElement("div");
			const journalFile = new (await import("obsidian")).TFile(
				".graphune/recovery/editor-drafts.json",
			);
			(app.vault.getAbstractFileByPath as Mock).mockReturnValue(journalFile);
			(app.vault.cachedRead as Mock)
				.mockRejectedValueOnce(new Error("iCloud read failed"))
				.mockResolvedValueOnce(JSON.stringify({ version: 1, drafts: {} }));
			const { result } = renderHook(
				() =>
					useEmbeddableEditor({
						content: "saved",
						resourceKey: "error-note.md",
						onSave: vi.fn(),
						_containerOverride: container,
					}),
				{ wrapper: createWrapper(app) },
			);

			await act(async () => await vi.advanceTimersByTimeAsync(0));
			expect(result.current.recoveryStatus).toBe("error");
			act(() => result.current.retryRecovery());
			expect(result.current.recoveryStatus).toBe("loading");
			await act(async () => await vi.advanceTimersByTimeAsync(0));
			expect(result.current.recoveryStatus).toBe("idle");
		});
	});
});
