import { setLocale } from "@/i18n";
import { GRAPHUNE_DONATE_URL, GRAPHUNE_ISSUES_URL, SettingTab } from "@/settings/setting-tab";
import { DEFAULT_SETTINGS, type GraphuneSettings } from "@/types/settings";
import {
	App,
	Plugin,
	type Setting,
	type SettingDefinitionGroup,
	type SettingDefinitionItem,
} from "obsidian";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

describe("SettingTab", () => {
	let settings: GraphuneSettings;
	let onSettingsChange: Mock;
	let tab: SettingTab;

	beforeEach(() => {
		setLocale("en");
		vi.clearAllMocks();
		const app = new App();
		settings = { ...DEFAULT_SETTINGS };
		onSettingsChange = vi.fn();
		tab = new SettingTab(app, { app } as unknown as Plugin, settings, onSettingsChange);
	});

	it("exposes all settings as six searchable declarative groups", () => {
		const definitions = tab.getSettingDefinitions();
		expect(definitions).toHaveLength(6);
		expect(definitions.map(groupHeading)).toEqual([
			"Graphune settings",
			"Extracted files",
			"Quick cards",
			"Edge sync",
			"Edges",
			"Support",
		]);
		expect(definitions.flatMap(groupItems)).toHaveLength(11);
	});

	it("describes native controls with values, ranges, options, and placeholders", () => {
		const controls = controlDefinitions(tab.getSettingDefinitions());
		expect(controls.get("extractedFilesFolder")?.control).toMatchObject({
			type: "text",
			placeholder: "e.g. extracted-notes",
		});
		expect(controls.get("defaultNodeWidth")?.control).toMatchObject({
			type: "slider",
			min: 200,
			max: 800,
			step: 50,
		});
		expect(controls.get("defaultNodeHeight")?.control).toMatchObject({
			type: "slider",
			min: 100,
			max: 600,
			step: 50,
		});
		expect(controls.get("language")?.control).toMatchObject({
			type: "dropdown",
			options: { system: "System default", en: "English", ja: "Japanese" },
		});
		for (const key of controls.keys())
			expect(tab.getControlValue(key)).toBe(settings[key as keyof GraphuneSettings]);
	});

	it("persists valid declarative control changes and rejects invalid values", () => {
		tab.setControlValue("extractedFilesFolder", "my-folder");
		tab.setControlValue("defaultNodeWidth", 600);
		tab.setControlValue("showPreviewBeforeCreate", true);
		tab.setControlValue("language", "ja");
		tab.setControlValue("defaultNodeHeight", "invalid");
		expect(settings).toMatchObject({
			extractedFilesFolder: "my-folder",
			defaultNodeWidth: 600,
			showPreviewBeforeCreate: true,
			language: "ja",
			defaultNodeHeight: DEFAULT_SETTINGS.defaultNodeHeight,
		});
		expect(onSettingsChange).toHaveBeenCalledTimes(4);
		expect(tab.update).toHaveBeenCalledOnce();
	});

	it("renders support destinations without opener access", () => {
		const support = tab.getSettingDefinitions().at(-1) as SettingDefinitionGroup;
		const definition = support.items?.[0];
		if (!definition || !("render" in definition) || !definition.render)
			throw new Error("Support renderer missing");
		const controlEl = document.createElement("div");
		controlEl.createEl = vi.fn(controlEl.createEl.bind(controlEl));
		definition.render({ controlEl } as Setting, {} as never);
		expect(controlEl.createEl).toHaveBeenCalledWith("a", {
			text: "Sponsor Graphune",
			href: GRAPHUNE_DONATE_URL,
			attr: { target: "_blank", rel: "noopener noreferrer" },
		});
		expect(controlEl.createEl).toHaveBeenCalledWith("a", {
			text: "Report an issue",
			href: GRAPHUNE_ISSUES_URL,
			attr: { target: "_blank", rel: "noopener noreferrer" },
		});
	});
});

function groupHeading(item: SettingDefinitionItem): string | undefined {
	return "heading" in item ? item.heading : undefined;
}

function groupItems(item: SettingDefinitionItem): SettingDefinitionItem[] {
	return "items" in item ? (item.items ?? []) : [];
}

function controlDefinitions(
	items: SettingDefinitionItem[],
): Map<string, Extract<SettingDefinitionItem, { control: unknown }>> {
	const controls = new Map<string, Extract<SettingDefinitionItem, { control: unknown }>>();
	for (const item of items.flatMap(groupItems)) {
		if (!("control" in item) || !item.control) continue;
		controls.set(item.control.key, item as Extract<SettingDefinitionItem, { control: unknown }>);
	}
	return controls;
}
