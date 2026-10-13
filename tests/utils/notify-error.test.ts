import { notifyError } from "@/utils/notify-error";
import * as obsidian from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("notifyError", () => {
	let noticeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		noticeSpy = vi.spyOn(obsidian, "Notice");
	});

	afterEach(() => {
		noticeSpy.mockRestore();
	});

	it("creates Notice with error message for Error instances", () => {
		notifyError("Failed to save", new Error("disk full"));
		expect(noticeSpy).toHaveBeenCalledWith("Failed to save: disk full");
	});

	it("creates Notice with 'Unknown error' for non-Error values", () => {
		notifyError("Operation failed", "string error");
		expect(noticeSpy).toHaveBeenCalledWith("Operation failed: Unknown error");
	});

	it("creates Notice with 'Unknown error' for null", () => {
		notifyError("Crash", null);
		expect(noticeSpy).toHaveBeenCalledWith("Crash: Unknown error");
	});
});
