import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(process.cwd(), "src");
const tokenCss = fs.readFileSync(path.join(sourceRoot, "design-system/tokens.css"), "utf8");
const stylesCss = fs.readFileSync(path.join(sourceRoot, "styles.css"), "utf8");

describe("Heptabase design system contract", () => {
	it("owns product tokens in a dedicated layer", () => {
		expect(tokenCss).toContain("--hb-paper:");
		expect(tokenCss).toContain("--hb-motion-fast:");
		expect(stylesCss).toContain('@import "./design-system/tokens.css"');
	});

	it("keeps automatic Tailwind scanning disabled", () => {
		expect(stylesCss).toContain("source(none)");
		expect(stylesCss).toContain('@source "./**/*.{ts,tsx}"');
	});

	it("routes Obsidian theme values through product tokens", () => {
		expect(stylesCss).not.toMatch(/var\(--(?:background|text|interactive|metadata|inline-title)-/u);
		expect(stylesCss).not.toContain("--color-ob-");
		expect(stylesCss).toContain("--color-hb-normal: var(--hb-ink)");
		expect(stylesCss).toContain("--color-hb-accent: var(--hb-accent)");
	});

	it("honors reduced-motion preferences at the token boundary", () => {
		expect(tokenCss).toContain("@media (prefers-reduced-motion: reduce)");
		expect(tokenCss).toContain("--hb-motion-fast: 0ms");
	});

	it("uses semantic classes for transient drag UI", () => {
		expect(stylesCss).toContain(".heptabase-drag-ghost");
		expect(stylesCss).toContain(".heptabase-selection-handle");
		expect(stylesCss).toContain(".heptabase-drop-animation");
	});
});
