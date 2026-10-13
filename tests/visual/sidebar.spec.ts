import { expect, test, type Page } from "@playwright/test";

const THEMES = {
	dark: {
		"--text-muted": "#999",
		"--text-normal": "#dcddde",
		"--background-primary": "#1e1e1e",
		"--background-secondary": "#262626",
		"--background-modifier-border": "#444",
		"--background-modifier-hover": "rgba(255, 255, 255, 0.08)",
	},
	light: {
		"--text-muted": "#64676d",
		"--text-normal": "#202124",
		"--background-primary": "#ffffff",
		"--background-secondary": "#f4f5f7",
		"--background-modifier-border": "#d9dce1",
		"--background-modifier-hover": "rgba(30, 35, 45, 0.07)",
	},
} as const;

async function prepareSidebar(
	page: Page,
	width: number,
	theme: keyof typeof THEMES,
	path = "/",
): Promise<void> {
	await page.setViewportSize({ width: width + 48, height: 900 });
	await page.goto(path);
	await expect(page.locator("html")).toHaveAttribute("data-virtual-obsidian-engine", "rust");
	await page.locator("#root").evaluate(
		(element, options) => {
			const root = element as HTMLElement;
			root.style.width = `${options.width}px`;
			for (const [property, value] of Object.entries(options.tokens)) {
				document.documentElement.style.setProperty(property, value);
			}
			document.body.style.background = options.tokens["--background-primary"];
		},
		{ width, tokens: THEMES[theme] },
	);
	if (path.includes("canvas=selected1")) {
		await expect(page.getByRole("tab", { name: "Workspace" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.getByLabel("Selected card context")).toBeVisible();
	} else {
		await expect(page.getByRole("tab", { name: "Sources" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(page.locator(".heptabase-note-card").first()).toBeVisible();
	}
}

for (const theme of ["dark", "light"] as const) {
	for (const width of [280, 380] as const) {
		test(`card library remains composed at ${width}px in ${theme} theme`, async ({ page }) => {
			await prepareSidebar(page, width, theme);
			await expect(page.locator("#root")).toHaveScreenshot(`card-library-${theme}-${width}.png`);
		});
	}
}

test("filter popover remains contained at 280px", async ({ page }) => {
	await prepareSidebar(page, 280, "dark");
	await page.getByRole("button", { name: "Filter and sort cards" }).click();
	const popover = page.locator(".heptabase-library-filters__popover");
	await expect(popover).toBeVisible();
	const [rootBox, popoverBox] = await Promise.all([
		page.locator("#root").boundingBox(),
		popover.boundingBox(),
	]);
	expect(rootBox).not.toBeNull();
	expect(popoverBox).not.toBeNull();
	expect(popoverBox!.x).toBeGreaterThanOrEqual(rootBox!.x);
	expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(rootBox!.x + rootBox!.width);
	await expect(page.locator("#root")).toHaveScreenshot("card-library-filter-popover-dark-280.png");
});

test("filter popover closes with Escape and restores trigger focus", async ({ page }) => {
	await prepareSidebar(page, 280, "light");
	const trigger = page.getByRole("button", { name: "Filter and sort cards" });
	await trigger.click();
	await page.getByLabel("Filter by tag").focus();
	await page.keyboard.press("Escape");

	await expect(trigger).toHaveAttribute("aria-expanded", "false");
	await expect(trigger).toBeFocused();
});

test("filter popover opens on its first control and follows the visual Tab order", async ({
	page,
}) => {
	await prepareSidebar(page, 280, "light");
	await page.getByRole("button", { name: "Filter and sort cards" }).click();

	await expect(page.getByLabel("Filter by tag")).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(page.getByLabel("Filter by folder")).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(page.getByLabel("Sort cards", { exact: true })).toBeFocused();
});

test("tab transition keeps inactive panels inaccessible", async ({ page }) => {
	await prepareSidebar(page, 380, "dark");
	await page.getByRole("tab", { name: "Note" }).click();

	await expect(page.getByRole("tab", { name: "Note" })).toHaveAttribute("aria-selected", "true");
	await expect(page.locator("[data-tab-panel='card-library']")).toHaveAttribute(
		"aria-hidden",
		"true",
	);
	await expect(page.locator("[data-tab-panel='article-viewer']")).toHaveClass(/is-active/);
});

test("secondary card actions keep visible focus and 44px touch targets", async ({ browser }) => {
	const context = await browser.newContext({ hasTouch: true });
	const page = await context.newPage();
	await prepareSidebar(page, 380, "light");

	const details = page.getByRole("button", { name: "Headings & Canvas" }).first();
	await details.focus();
	const focusStyle = await details.evaluate((element) => {
		const style = getComputedStyle(element);
		return { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle };
	});
	expect(focusStyle.style).not.toBe("none");
	expect(focusStyle.width).toBeGreaterThanOrEqual(2);

	for (const selector of [
		".heptabase-note-card__quick-add",
		".heptabase-note-card__drag-handle",
		".heptabase-note-card__details-toggle",
	]) {
		const box = await page.locator(selector).first().boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeGreaterThanOrEqual(44);
		expect(box!.height).toBeGreaterThanOrEqual(44);
	}
	await context.close();
});

test("desktop drag and add hit areas never overlap", async ({ page }) => {
	await prepareSidebar(page, 380, "light");
	const dragBox = await page.locator(".heptabase-note-card__drag-handle").first().boundingBox();
	const addBox = await page.locator(".heptabase-note-card__quick-add").first().boundingBox();
	expect(dragBox).not.toBeNull();
	expect(addBox).not.toBeNull();
	const horizontalOverlap =
		Math.min(dragBox!.x + dragBox!.width, addBox!.x + addBox!.width) -
		Math.max(dragBox!.x, addBox!.x);
	const verticalOverlap =
		Math.min(dragBox!.y + dragBox!.height, addBox!.y + addBox!.height) -
		Math.max(dragBox!.y, addBox!.y);
	expect(horizontalOverlap <= 0 || verticalOverlap <= 0).toBe(true);
});

test("selection context explains available Canvas actions on desktop", async ({ page }) => {
	await prepareSidebar(page, 380, "light", "/?canvas=selected");
	await page.getByRole("tab", { name: "Workspace" }).click();

	await expect(page.getByText("2 selected", { exact: true })).toBeAttached();
	await expect(
		page.getByText(
			"Connect, align, and Section are available. Select one more card to distribute.",
		),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Connect selected nodes" })).toBeEnabled();
	await expect(page.getByRole("button", { name: "Distribute horizontally" })).toBeDisabled();
	await expect(page.locator("#root")).toHaveScreenshot("canvas-selection-context-light-380.png");
});

test("two selected materials open the guided distillation flow on mobile", async ({ browser }) => {
	const context = await browser.newContext({ hasTouch: true });
	const page = await context.newPage();
	await prepareSidebar(page, 390, "light", "/?canvas=selected");
	await page.getByRole("tab", { name: "Workspace" }).click();
	await page.getByRole("button", { name: "Distill" }).click();

	const dialog = page.getByRole("dialog", { name: "Create a connected note" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText("Idea 1")).toBeVisible();
	await expect(dialog.getByText("Idea 2")).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Create and replace materials" })).toBeDisabled();
	for (const control of await dialog
		.locator("button:visible, input:visible, select:visible")
		.all()) {
		const box = await control.boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	}
	expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
	await expect(page.locator("#root")).toHaveScreenshot("distillation-mobile-light-390.png");
	await context.close();
});

test("selected card opens the same card on another Canvas within two actions", async ({ page }) => {
	await prepareSidebar(page, 380, "light", "/?canvas=selected1");
	await page.getByRole("tab", { name: "Workspace" }).click();

	const otherCanvases = page.locator("details").filter({ hasText: "Other Canvases" });
	await expect(otherCanvases).toContainText("Research map");
	await otherCanvases.getByRole("button", { name: /Research map/u }).click();
	await expect(page.locator("html")).toHaveAttribute("data-opened-file", "Research map.canvas");
});

test("first Canvas guide stays compact with touch targets on mobile", async ({ browser }) => {
	const context = await browser.newContext({ hasTouch: true });
	const page = await context.newPage();
	await prepareSidebar(page, 280, "dark", "/?canvas=empty");
	await page.getByRole("tab", { name: "Workspace" }).click();

	const guide = page.getByLabel("First connection guide");
	await expect(guide).toBeVisible();
	await expect(guide.locator("strong")).toHaveText("Find a heading in Library");
	const summaryBox = await guide.getByText("Show all 3 steps").boundingBox();
	expect(summaryBox).not.toBeNull();
	expect(summaryBox!.height).toBeGreaterThanOrEqual(44);
	await expect(page.locator("#root")).toHaveScreenshot("canvas-first-guide-dark-280.png");
	await context.close();
});

for (const selectedCount of [1, 2, 3] as const) {
	test(`Canvas selection context does not overflow at 280px with ${selectedCount} selected`, async ({
		browser,
	}) => {
		const context = await browser.newContext({ hasTouch: true });
		const page = await context.newPage();
		await prepareSidebar(page, 280, "light", `/?canvas=selected${selectedCount}`);
		await page.getByRole("tab", { name: "Workspace" }).click();

		await expect(page.getByText(`${selectedCount} selected`, { exact: true })).toBeAttached();
		expect(
			await page.locator("#root").evaluate((element) => element.scrollWidth <= element.clientWidth),
		).toBe(true);
		await expect(page.locator("#root")).toHaveScreenshot(
			`canvas-selection-${selectedCount}-light-280.png`,
		);
		await context.close();
	});
}

test("Current Canvas explains the missing context at 280px", async ({ page }) => {
	await prepareSidebar(page, 280, "light");
	await page.getByRole("tab", { name: "Workspace" }).click();

	await expect(page.getByText("No Canvas is open")).toBeVisible();
	await expect(
		page.getByText("Open an existing Canvas to search and arrange its nodes."),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Open Canvas" })).toHaveClass(/mod-cta/);
	const welcomeBox = await page.locator(".canvas-panel__welcome").boundingBox();
	const rootBox = await page.locator("#root").boundingBox();
	expect(welcomeBox).not.toBeNull();
	expect(rootBox).not.toBeNull();
	expect(welcomeBox!.y + welcomeBox!.height).toBeLessThanOrEqual(rootBox!.y + rootBox!.height / 2);
	expect(
		await page.locator("#root").evaluate((element) => element.scrollWidth <= element.clientWidth),
	).toBe(true);
	await expect(page.locator("#root")).toHaveScreenshot("current-canvas-empty-light-280.png");
});

for (const width of [280, 380] as const) {
	test(`recovered editor draft stays actionable at ${width}px`, async ({ browser }) => {
		const context = await browser.newContext({ hasTouch: true });
		const page = await context.newPage();
		await page.setViewportSize({ width: width + 48, height: 560 });
		await page.goto("/?recovery=recovered");
		await expect(page.locator("html")).toHaveAttribute("data-virtual-obsidian-engine", "rust");
		await page.locator("#root").evaluate(
			(element, options) => {
				(element as HTMLElement).style.width = `${options.width}px`;
				for (const [property, value] of Object.entries(options.tokens)) {
					document.documentElement.style.setProperty(property, value);
				}
				document.body.style.background = options.tokens["--background-primary"];
			},
			{ width, tokens: THEMES.light },
		);

		const recovery = page.locator(".article-editor-recovery.is-recovered");
		await expect(recovery).toBeVisible();
		await expect(recovery).toHaveAttribute("role", "alert");
		await expect(page.getByRole("button", { name: "Restore draft" })).toBeFocused();
		for (const button of await recovery.getByRole("button").all()) {
			const box = await button.boundingBox();
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
		expect(
			await page.locator("#root").evaluate((element) => element.scrollWidth <= element.clientWidth),
		).toBe(true);
		await expect(page.locator("#root")).toHaveScreenshot(`editor-recovery-light-${width}.png`);
		await context.close();
	});
}

test("editor recovery loading and error are distinct accessible states", async ({ page }) => {
	await page.goto("/?recovery=loading");
	await expect(page.getByRole("status")).toContainText("Checking unsaved work");

	await page.goto("/?recovery=error");
	await expect(page.getByRole("alert")).toContainText("Draft check failed");
	const retry = page.getByRole("button", { name: "Check again" });
	await expect(retry).toBeFocused();
	const box = await retry.boundingBox();
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("reduced motion disables decorative animation", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await prepareSidebar(page, 280, "dark");
	await page.getByRole("button", { name: "Filter and sort cards" }).click();

	const durationMs = await page
		.locator(".heptabase-library-filters__popover")
		.evaluate((element) => {
			const duration = getComputedStyle(element).animationDuration;
			return duration.endsWith("ms")
				? Number.parseFloat(duration)
				: Number.parseFloat(duration) * 1000;
		});
	expect(durationMs).toBeLessThanOrEqual(0.01);
});
