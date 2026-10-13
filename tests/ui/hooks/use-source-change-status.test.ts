import { SourceChangeDetector, type SourceChangeStatus } from "@/services/source-change-detector";
import { useSourceChangeStatus } from "@/ui/hooks/use-source-change-status";
import { act, renderHook, waitFor } from "@testing-library/react";
import { App, TFile } from "obsidian";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { createWrapper } from "../../helpers/create-wrapper";

describe("useSourceChangeStatus", () => {
	afterEach(() => vi.restoreAllMocks());

	it.each([
		["create", "source.md"],
		["delete", "source.md"],
		["rename", "renamed.md", "source.md"],
	] as const)(
		"refreshes when the tracked source receives a %s event",
		async (event, path, oldPath) => {
			const app = new App();
			const extracted = new TFile("extracted.md");
			const handlers = new Map<string, (...args: never[]) => void>();
			(app.vault.on as Mock).mockImplementation(
				(name: string, handler: (...args: never[]) => void) => {
					handlers.set(name, handler);
					return { id: name };
				},
			);
			(app.metadataCache.getFileCache as Mock).mockReturnValue({
				frontmatter: {
					"heptabase-source": "source.md",
					"heptabase-source-content-hash": "fingerprint",
				},
			});
			const statuses: SourceChangeStatus[] = ["unchanged", "changed"];
			vi.spyOn(SourceChangeDetector.prototype, "getStatus").mockImplementation(
				async () => statuses.shift() ?? "changed",
			);
			const { result } = renderHook(() => useSourceChangeStatus(extracted), {
				wrapper: createWrapper(app),
			});
			await waitFor(() => expect(result.current.status).toBe("unchanged"));

			act(() => {
				const changedFile = new TFile(path);
				if (event === "rename") handlers.get(event)?.(changedFile as never, oldPath as never);
				else handlers.get(event)?.(changedFile as never);
			});

			await waitFor(() => expect(result.current.status).toBe("changed"));
		},
	);

	it("ignores stale refreshes that resolve after a newer source event", async () => {
		const app = new App();
		const extracted = new TFile("extracted.md");
		let modifyHandler: ((file: TFile) => void) | undefined;
		(app.vault.on as Mock).mockImplementation((name: string, handler: (file: TFile) => void) => {
			if (name === "modify") modifyHandler = handler;
			return { id: name };
		});
		(app.metadataCache.getFileCache as Mock).mockReturnValue({
			frontmatter: {
				"heptabase-source": "source.md",
				"heptabase-source-content-hash": "fingerprint",
			},
		});
		let resolveInitial!: (status: SourceChangeStatus) => void;
		vi.spyOn(SourceChangeDetector.prototype, "getStatus")
			.mockReturnValueOnce(new Promise((resolve) => (resolveInitial = resolve)))
			.mockResolvedValueOnce("changed");
		const { result } = renderHook(() => useSourceChangeStatus(extracted), {
			wrapper: createWrapper(app),
		});

		act(() => modifyHandler?.(new TFile("source.md")));
		await waitFor(() => expect(result.current.status).toBe("changed"));
		resolveInitial("unchanged");
		await act(async () => {});

		expect(result.current.status).toBe("changed");
	});
});
