import { sanitizeFilename } from "@/utils/sanitize-filename";
import { describe, expect, it } from "vitest";

describe("sanitizeFilename", () => {
	it("returns a normal filename as-is", () => {
		expect(sanitizeFilename("hello-world")).toBe("hello-world");
	});

	it("removes OS-forbidden characters", () => {
		expect(sanitizeFilename('file/name\\with:special*chars?"<>|end')).toBe(
			"filenamewithspecialcharsend",
		);
	});

	it("removes forward slashes", () => {
		expect(sanitizeFilename("path/to/file")).toBe("pathtofile");
	});

	it("removes backslashes", () => {
		expect(sanitizeFilename("path\\to\\file")).toBe("pathtofile");
	});

	it("removes colons", () => {
		expect(sanitizeFilename("file:name")).toBe("filename");
	});

	it("removes asterisks", () => {
		expect(sanitizeFilename("file*name")).toBe("filename");
	});

	it("removes question marks", () => {
		expect(sanitizeFilename("file?name")).toBe("filename");
	});

	it("removes double quotes", () => {
		expect(sanitizeFilename('file"name')).toBe("filename");
	});

	it("removes angle brackets", () => {
		expect(sanitizeFilename("file<name>")).toBe("filename");
	});

	it("removes pipes", () => {
		expect(sanitizeFilename("file|name")).toBe("filename");
	});

	it("trims leading and trailing whitespace", () => {
		expect(sanitizeFilename("  hello world  ")).toBe("hello world");
	});

	it("returns default name for empty string", () => {
		expect(sanitizeFilename("")).toBe("Untitled");
	});

	it("returns default name for forbidden characters only", () => {
		expect(sanitizeFilename('/:*?"<>|\\')).toBe("Untitled");
	});

	it("returns default name for whitespace only", () => {
		expect(sanitizeFilename("   ")).toBe("Untitled");
	});

	it("handles Japanese filenames correctly", () => {
		expect(sanitizeFilename("日本語のファイル名")).toBe("日本語のファイル名");
	});

	it("handles mixed Japanese and forbidden characters correctly", () => {
		expect(sanitizeFilename("テスト:ファイル/名前")).toBe("テストファイル名前");
	});

	it("normalizes consecutive spaces to one", () => {
		expect(sanitizeFilename("hello    world")).toBe("hello world");
	});

	it("normalizes consecutive spaces after removing forbidden characters", () => {
		expect(sanitizeFilename("hello / world")).toBe("hello world");
	});

	it("returns default name for dot-only filenames", () => {
		expect(sanitizeFilename(".")).toBe("Untitled");
	});

	it("returns default name for double-dot filenames", () => {
		expect(sanitizeFilename("..")).toBe("Untitled");
	});

	it("returns default name for triple-dot or more filenames", () => {
		expect(sanitizeFilename("...")).toBe("Untitled");
	});
});
