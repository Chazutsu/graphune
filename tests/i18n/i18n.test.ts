import { getLocale, resolveLocale, setLocale, t } from "@/i18n";
import { afterEach, describe, expect, it } from "vitest";

describe("i18n", () => {
	afterEach(() => setLocale("en"));

	it("resolves supported explicit languages", () => {
		expect(resolveLocale("en", "ja-JP")).toBe("en");
		expect(resolveLocale("ja", "en-US")).toBe("ja");
	});

	it("resolves system language and falls back to English", () => {
		expect(resolveLocale("system", "ja-JP")).toBe("ja");
		expect(resolveLocale("system", "fr-FR")).toBe("en");
	});

	it("switches catalogs and interpolates variables", () => {
		setLocale("ja");
		expect(getLocale()).toBe("ja");
		expect(t("article.open", { path: "notes/example.md" })).toBe("記事 notes/example.md を開く");
	});
});
