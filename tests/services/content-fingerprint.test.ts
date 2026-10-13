import { createContentFingerprint } from "@/services/content-fingerprint";
import { describe, expect, it } from "vitest";

describe("createContentFingerprint", () => {
	it("normalizes line endings and surrounding whitespace", () => {
		expect(createContentFingerprint("\r\n# Source\r\nBody\r\n")).toBe(
			createContentFingerprint("# Source\nBody"),
		);
	});

	it("changes when section content changes", () => {
		expect(createContentFingerprint("# Source\nBefore")).not.toBe(
			createContentFingerprint("# Source\nAfter"),
		);
	});
});
