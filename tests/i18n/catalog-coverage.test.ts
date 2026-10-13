import { getCatalog } from "@/i18n";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TARGET_FILES = [
	"../../src/handlers/drop-handler.ts",
	"../../src/handlers/canvas-event-handler.ts",
	"../../src/services/canvas-search.ts",
	"../../src/ui/components/canvas-search-panel.tsx",
	"../../src/ui/components/card-grid.tsx",
	"../../src/ui/components/article-viewer-panel.tsx",
	"../../src/ui/components/file-search-dropdown.tsx",
	"../../src/ui/components/article-header.tsx",
	"../../src/ui/components/search-bar.tsx",
] as const;

describe("translation catalog coverage", () => {
	it("keeps the English and Japanese catalogs structurally complete", () => {
		expect(Object.keys(getCatalog("ja")).toSorted()).toEqual(
			Object.keys(getCatalog("en")).toSorted(),
		);
	});

	it("does not duplicate cataloged English UI copy in migrated source files", () => {
		const englishMessages = Object.values(getCatalog("en")).filter(
			(message) => !message.includes("{") && message.length > 2,
		);
		for (const relativePath of TARGET_FILES) {
			const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
			expect(source, `${relativePath} has a literal Notice or error prefix`).not.toMatch(
				/(?:new Notice|notifyError)\(\s*[`"']/,
			);
			expect(source, `${relativePath} has a literal accessibility label`).not.toMatch(
				/(?:aria-label|placeholder|title)=["'][A-Za-z]/,
			);
			if (relativePath.endsWith(".tsx")) {
				expect(source, `${relativePath} has raw English JSX copy`).not.toMatch(
					/>\s*[A-Z][A-Za-z .+…-]+\s*</,
				);
			}
			for (const message of englishMessages) {
				expect(source, `${relativePath} contains untranslated UI copy: ${message}`).not.toContain(
					`"${message}"`,
				);
			}
		}
	});
});
