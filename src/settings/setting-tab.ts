import { setLocale, t } from "@/i18n";
import type { GraphuneSettings } from "@/types/settings";
import type { App, Plugin, SettingDefinition, SettingDefinitionItem } from "obsidian";
import { getLanguage, PluginSettingTab } from "obsidian";

export const GRAPHUNE_DONATE_URL = "https://github.com/sponsors/ryo-ebata";
export const GRAPHUNE_ISSUES_URL = "https://github.com/Chazutsu/graphune/issues";

type SettingKey = keyof GraphuneSettings;
type StringSettingKey = {
	[K in SettingKey]: GraphuneSettings[K] extends string ? K : never;
}[SettingKey];

export class SettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly settings: GraphuneSettings,
		private readonly onSettingsChange: (settings: GraphuneSettings) => void,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
		return [
			{ type: "group", heading: t("settings.title"), items: [] },
			{
				type: "group",
				heading: t("settings.files"),
				items: [
					this.textDefinition(
						"extractedFilesFolder",
						"settings.extractedFolder.name",
						"settings.extractedFolder.description",
						"settings.extractedFolder.placeholder",
					),
					{
						name: t("settings.nodeWidth.name"),
						desc: t("settings.nodeWidth.description"),
						control: { type: "slider", key: "defaultNodeWidth", min: 200, max: 800, step: 50 },
					},
					{
						name: t("settings.nodeHeight.name"),
						desc: t("settings.nodeHeight.description"),
						control: { type: "slider", key: "defaultNodeHeight", min: 100, max: 600, step: 50 },
					},
					this.textDefinition(
						"fileNamePrefix",
						"settings.filePrefix.name",
						"settings.filePrefix.description",
						"settings.filePrefix.placeholder",
					),
					{
						name: t("settings.preview.name"),
						desc: t("settings.preview.description"),
						control: { type: "toggle", key: "showPreviewBeforeCreate" },
					},
				],
			},
			{
				type: "group",
				heading: t("settings.quickCard"),
				items: [
					this.textDefinition(
						"quickCardDefaultTitle",
						"settings.quickCardTitle.name",
						"settings.quickCardTitle.description",
						"settings.quickCardTitle.placeholder",
					),
				],
			},
			{
				type: "group",
				heading: t("settings.edgeSync"),
				items: [
					{
						name: t("settings.edgeSync.name"),
						desc: t("settings.edgeSync.description"),
						control: { type: "toggle", key: "enableEdgeSync" },
					},
				],
			},
			{
				type: "group",
				heading: t("settings.edges"),
				items: [
					this.textDefinition(
						"defaultEdgeColor",
						"settings.edgeColor.name",
						"settings.edgeColor.description",
						"settings.edgeColor.placeholder",
					),
					this.textDefinition(
						"defaultEdgeLabel",
						"settings.edgeLabel.name",
						"settings.edgeLabel.description",
						"settings.edgeLabel.placeholder",
					),
					{
						name: t("language.name"),
						desc: t("language.description"),
						control: {
							type: "dropdown",
							key: "language",
							options: {
								system: t("language.system"),
								en: t("language.english"),
								ja: t("language.japanese"),
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: t("settings.support"),
				items: [
					{
						name: t("settings.support"),
						desc: t("settings.support.description"),
						render: (setting) => {
							setting.controlEl.createEl("a", {
								text: t("settings.support.donate"),
								href: GRAPHUNE_DONATE_URL,
								attr: { target: "_blank", rel: "noopener noreferrer" },
							});
							setting.controlEl.createEl("br");
							setting.controlEl.createEl("a", {
								text: t("settings.support.issues"),
								href: GRAPHUNE_ISSUES_URL,
								attr: { target: "_blank", rel: "noopener noreferrer" },
							});
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		return isSettingKey(key) ? this.settings[key] : undefined;
	}

	setControlValue(key: string, value: unknown): void {
		if (!isSettingKey(key) || !isValidSettingValue(key, value)) return;
		setSetting(this.settings, key, value);
		if (key === "language") {
			if (value !== "system" && value !== "en" && value !== "ja") return;
			setLocale(value, typeof getLanguage === "function" ? getLanguage() : undefined);
			this.update();
		}
		this.onSettingsChange(this.settings);
	}

	private textDefinition(
		key: StringSettingKey,
		nameKey: Parameters<typeof t>[0],
		descKey: Parameters<typeof t>[0],
		placeholderKey: Parameters<typeof t>[0],
	): SettingDefinition<SettingKey> {
		return {
			name: t(nameKey),
			desc: t(descKey),
			control: { type: "text", key, placeholder: t(placeholderKey) },
		};
	}
}

function isSettingKey(key: string): key is SettingKey {
	return (
		key in
		{
			extractedFilesFolder: true,
			defaultNodeWidth: true,
			defaultNodeHeight: true,
			fileNamePrefix: true,
			showPreviewBeforeCreate: true,
			quickCardDefaultTitle: true,
			enableEdgeSync: true,
			defaultEdgeColor: true,
			defaultEdgeLabel: true,
			language: true,
		}
	);
}

function isValidSettingValue<K extends SettingKey>(
	key: K,
	value: unknown,
): value is GraphuneSettings[K] {
	switch (key) {
		case "defaultNodeWidth":
		case "defaultNodeHeight":
			return typeof value === "number" && Number.isFinite(value);
		case "showPreviewBeforeCreate":
		case "enableEdgeSync":
			return typeof value === "boolean";
		case "language":
			return value === "system" || value === "en" || value === "ja";
		default:
			return typeof value === "string";
	}
}

function setSetting<K extends SettingKey>(
	settings: GraphuneSettings,
	key: K,
	value: GraphuneSettings[K],
): void {
	settings[key] = value;
}
