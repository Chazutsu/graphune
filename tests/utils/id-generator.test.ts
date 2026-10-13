import { generateId } from "@/utils/id-generator";
import { describe, expect, it } from "vitest";

describe("generateId", () => {
	it("returns a 16-character string", () => {
		const id = generateId();
		expect(id).toHaveLength(16);
	});

	it("contains only valid hexadecimal characters", () => {
		const id = generateId();
		expect(id).toMatch(/^[0-9a-f]{16}$/);
	});

	it("returns a different ID on each call", () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateId()));
		expect(ids.size).toBe(100);
	});
});
