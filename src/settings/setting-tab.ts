import type { GraphuneSettings } from "@/types/settings";
import { setLocale, t } from "@/i18n";
import type { App, Plugin } from "obsidian";
import { getLanguage, PluginSettingTab, Setting } from "obsidian";

export const GRAPHUNE_DONATE_URL = "https://github.com/sponsors/ryo-ebata";
export const GRAPHUNE_ISSUES_URL = "https://github.com/Chazutsu/graphune/issues";

export class SettingTab extends PluginSettingTab {
	private settings: GraphuneSettings;
	private onSettingsChange: (settings: GraphuneSettings) => void;

	constructor(
		app: App,
		plugin: Plugin,
		settings: GraphuneSettings,
		onSettingsChange: (settings: GraphuneSettings) => void,
	) {
		super(app, plugin);
		this.settings = settings;
		this.onSettingsChange = onSettingsChange;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName(t("settings.title")).setHeading();

		new Setting(containerEl).setName(t("settings.files")).setHeading();

		new Setting(containerEl)
			.setName(t("settings.extractedFolder.name"))
			.setDesc(t("settings.extractedFolder.description"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.extractedFolder.placeholder"))
					.setValue(this.settings.extractedFilesFolder)
					.onChange(this.updateSetting("extractedFilesFolder")),
			);

		new Setting(containerEl)
			.setName(t("settings.nodeWidth.name"))
			.setDesc(t("settings.nodeWidth.description"))
			.addSlider((slider) =>
				slider
					.setLimits(200, 800, 50)
					.setValue(this.settings.defaultNodeWidth)
					.onChange(this.updateSetting("defaultNodeWidth")),
			);

		new Setting(containerEl)
			.setName(t("settings.nodeHeight.name"))
			.setDesc(t("settings.nodeHeight.description"))
			.addSlider((slider) =>
				slider
					.setLimits(100, 600, 50)
					.setValue(this.settings.defaultNodeHeight)
					.onChange(this.updateSetting("defaultNodeHeight")),
			);

		new Setting(containerEl)
			.setName(t("settings.filePrefix.name"))
			.setDesc(t("settings.filePrefix.description"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.filePrefix.placeholder"))
					.setValue(this.settings.fileNamePrefix)
					.onChange(this.updateSetting("fileNamePrefix")),
			);

		new Setting(containerEl)
			.setName(t("settings.preview.name"))
			.setDesc(t("settings.preview.description"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.showPreviewBeforeCreate)
					.onChange(this.updateSetting("showPreviewBeforeCreate")),
			);

		new Setting(containerEl).setName(t("settings.quickCard")).setHeading();

		new Setting(containerEl)
			.setName(t("settings.quickCardTitle.name"))
			.setDesc(t("settings.quickCardTitle.description"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.quickCardTitle.placeholder"))
					.setValue(this.settings.quickCardDefaultTitle)
					.onChange(this.updateSetting("quickCardDefaultTitle")),
			);

		new Setting(containerEl).setName(t("settings.edgeSync")).setHeading();

		new Setting(containerEl)
			.setName(t("settings.edgeSync.name"))
			.setDesc(t("settings.edgeSync.description"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.enableEdgeSync)
					.onChange(this.updateSetting("enableEdgeSync")),
			);

		new Setting(containerEl).setName(t("settings.edges")).setHeading();

		new Setting(containerEl)
			.setName(t("settings.edgeColor.name"))
			.setDesc(t("settings.edgeColor.description"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.edgeColor.placeholder"))
					.setValue(this.settings.defaultEdgeColor)
					.onChange(this.updateSetting("defaultEdgeColor")),
			);

		new Setting(containerEl)
			.setName(t("settings.edgeLabel.name"))
			.setDesc(t("settings.edgeLabel.description"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.edgeLabel.placeholder"))
					.setValue(this.settings.defaultEdgeLabel)
					.onChange(this.updateSetting("defaultEdgeLabel")),
			);

		new Setting(containerEl)
			.setName(t("language.name"))
			.setDesc(t("language.description"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("system", t("language.system"))
					.addOption("en", t("language.english"))
					.addOption("ja", t("language.japanese"))
					.setValue(this.settings.language)
					.onChange((value) => {
						this.settings.language = value as GraphuneSettings["language"];
						setLocale(
							this.settings.language,
							typeof getLanguage === "function" ? getLanguage() : undefined,
						);
						this.onSettingsChange(this.settings);
						this.display();
					}),
			);

		new Setting(containerEl).setName(t("settings.support")).setHeading();
		containerEl.createEl("p", { text: t("settings.support.description") });
		containerEl.createEl("a", {
			text: t("settings.support.donate"),
			href: GRAPHUNE_DONATE_URL,
			attr: { target: "_blank", rel: "noopener noreferrer" },
		});
		containerEl.createEl("br");
		containerEl.createEl("a", {
			text: t("settings.support.issues"),
			href: GRAPHUNE_ISSUES_URL,
			attr: { target: "_blank", rel: "noopener noreferrer" },
		});
	}

	private updateSetting<K extends keyof GraphuneSettings>(
		key: K,
	): (value: GraphuneSettings[K]) => void {
		return (value: GraphuneSettings[K]) => {
			this.settings[key] = value;
			this.onSettingsChange(this.settings);
		};
	}
}
