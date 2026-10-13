import { SettingTab } from "@/settings/setting-tab";
import { setLocale } from "@/i18n";
import { DEFAULT_SETTINGS, type GraphuneSettings } from "@/types/settings";
import { App, Plugin, Setting } from "obsidian";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

const settingInstances: InstanceType<typeof Setting>[] = [];

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("obsidian")>("obsidian");
	class TrackedSetting extends actual.Setting {
		constructor(containerEl: HTMLElement) {
			super(containerEl);
			settingInstances.push(this);
		}
	}
	return {
		...actual,
		Setting: TrackedSetting,
	};
});

function getOnChangeCallback(instance: InstanceType<typeof Setting>): (value: never) => void {
	const onChangeMock = vi.mocked(instance.onChange);
	return onChangeMock.mock.calls[0][0] as (value: never) => void;
}

describe("SettingTab", () => {
	let app: App;
	let plugin: Plugin;
	let settings: GraphuneSettings;
	let onSettingsChange: Mock;
	let tab: SettingTab;

	beforeEach(() => {
		setLocale("en");
		settingInstances.length = 0;
		vi.clearAllMocks();
		app = new App();
		plugin = { app } as unknown as Plugin;
		settings = { ...DEFAULT_SETTINGS };
		onSettingsChange = vi.fn();
		tab = new SettingTab(app, plugin, settings, onSettingsChange);
	});

	it("is an instance of SettingTab", () => {
		expect(tab).toBeInstanceOf(SettingTab);
	});

	it("stores the app reference", () => {
		expect(tab.app).toBe(app);
	});

	describe("display", () => {
		it("calls containerEl.empty()", () => {
			tab.display();
			expect(tab.containerEl.empty).toHaveBeenCalled();
		});

		it("creates h2 headers via createEl", () => {
			tab.display();
			const createElMock = vi.mocked(tab.containerEl.createEl);
			const h2Calls = createElMock.mock.calls.filter((call) => call[0] === "h2");
			expect(h2Calls.length).toBeGreaterThanOrEqual(1);
			expect(h2Calls[0]).toEqual(["h2", { text: "Graphune settings" }]);
		});

		it("creates all section headers", () => {
			tab.display();
			const createElMock = vi.mocked(tab.containerEl.createEl);
			const h2Texts = createElMock.mock.calls
				.filter((call) => call[0] === "h2")
				.map((call) => (call[1] as Record<string, string> | undefined)?.text);
			expect(h2Texts).toContain("Graphune settings");
			expect(h2Texts).toContain("Extracted files");
			expect(h2Texts).toContain("Quick cards");
			expect(h2Texts).toContain("Edge sync");
			expect(h2Texts).toContain("Edges");
			expect(h2Texts).not.toContain("Multi-Drop Layout Settings");
		});

		it("creates 10 Setting instances", () => {
			tab.display();
			expect(settingInstances).toHaveLength(10);
		});

		it("calls setName and setDesc on all Settings", () => {
			tab.display();
			for (const instance of settingInstances) {
				expect(instance.setName).toHaveBeenCalled();
				expect(instance.setDesc).toHaveBeenCalled();
			}
		});
	});

	describe("updateSetting via onChange callbacks", () => {
		it("updates extractedFilesFolder (text - Setting #0)", () => {
			tab.display();
			const instance = settingInstances[0];
			expect(instance.addText).toHaveBeenCalled();
			expect(instance.setPlaceholder).toHaveBeenCalledWith("e.g. extracted-notes");
			expect(instance.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.extractedFilesFolder);

			const onChange = getOnChangeCallback(instance);
			onChange("my-folder" as never);
			expect(settings.extractedFilesFolder).toBe("my-folder");
			expect(onSettingsChange).toHaveBeenCalledWith(settings);
		});

		it("updates defaultNodeWidth (slider - Setting #1)", () => {
			tab.display();
			const instance = settingInstances[1];
			expect(instance.addSlider).toHaveBeenCalled();
			expect(instance.setLimits).toHaveBeenCalledWith(200, 800, 50);
			expect(instance.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.defaultNodeWidth);
			expect(instance.setDynamicTooltip).toHaveBeenCalled();

			const onChange = getOnChangeCallback(instance);
			onChange(600 as never);
			expect(settings.defaultNodeWidth).toBe(600);
			expect(onSettingsChange).toHaveBeenCalledWith(settings);
		});

		it("updates defaultNodeHeight (slider - Setting #2)", () => {
			tab.display();
			const instance = settingInstances[2];
			expect(instance.addSlider).toHaveBeenCalled();
			expect(instance.setLimits).toHaveBeenCalledWith(100, 600, 50);
			expect(instance.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.defaultNodeHeight);

			const onChange = getOnChangeCallback(instance);
			onChange(500 as never);
			expect(settings.defaultNodeHeight).toBe(500);
			expect(onSettingsChange).toHaveBeenCalledWith(settings);
		});

		it("updates fileNamePrefix (text - Setting #3)", () => {
			tab.display();
			const instance = settingInstances[3];
			expect(instance.addText).toHaveBeenCalled();
			expect(instance.setPlaceholder).toHaveBeenCalledWith("e.g. extracted-");

			const onChange = getOnChangeCallback(instance);
			onChange("prefix-" as never);
			expect(settings.fileNamePrefix).toBe("prefix-");
			expect(onSettingsChange).toHaveBeenCalledWith(settings);
		});

		it("updates showPreviewBeforeCreate (toggle - Setting #4)", () => {
			tab.display();
			const instance = settingInstances[4];
			expect(instance.addToggle).toHaveBeenCalled();

			const onChange = getOnChangeCallback(instance);
			onChange(true as never);
			expect(settings.showPreviewBeforeCreate).toBe(true);
			expect(onSettingsChange).toHaveBeenCalledWith(settings);
		});

		it("updates quickCardDefaultTitle (text - Setting #5)", () => {
			tab.display();
			const instance = settingInstances[5];
			expect(instance.addText).toHaveBeenCalled();
			expect(instance.setPlaceholder).toHaveBeenCalledWith("e.g. Untitled");

			const onChange = getOnChangeCallback(instance);
			onChange("New Card" as never);
			expect(settings.quickCardDefaultTitle).toBe("New Card");
			expect(onSettingsChange).toHaveBeenCalledWith(settings);
		});

		it("updates enableEdgeSync (toggle - Setting #6)", () => {
			tab.display();
			const instance = settingInstances[6];
			expect(instance.addToggle).toHaveBeenCalled();

			const onChange = getOnChangeCallback(instance);
			onChange(false as never);
			expect(settings.enableEdgeSync).toBe(false);
			expect(onSettingsChange).toHaveBeenCalledWith(settings);
		});

		it("updates defaultEdgeColor (text - Setting #7)", () => {
			tab.display();
			const instance = settingInstances[7];
			expect(instance.addText).toHaveBeenCalled();
			expect(instance.setPlaceholder).toHaveBeenCalledWith("e.g. 1");

			const onChange = getOnChangeCallback(instance);
			onChange("3" as never);
			expect(settings.defaultEdgeColor).toBe("3");
			expect(onSettingsChange).toHaveBeenCalledWith(settings);
		});

		it("updates defaultEdgeLabel (text - Setting #8)", () => {
			tab.display();
			const instance = settingInstances[8];
			expect(instance.addText).toHaveBeenCalled();
			expect(instance.setPlaceholder).toHaveBeenCalledWith("e.g. relates to");

			const onChange = getOnChangeCallback(instance);
			onChange("links to" as never);
			expect(settings.defaultEdgeLabel).toBe("links to");
			expect(onSettingsChange).toHaveBeenCalledWith(settings);
		});

		it("updates language (dropdown - Setting #9)", () => {
			tab.display();
			const instance = settingInstances[9];
			expect(instance.addDropdown).toHaveBeenCalled();
			expect(instance.setValue).toHaveBeenCalledWith("system");

			const onChange = getOnChangeCallback(instance);
			onChange("ja" as never);
			expect(settings.language).toBe("ja");
			expect(onSettingsChange).toHaveBeenCalledWith(settings);
		});
	});

	describe("display called multiple times", () => {
		it("calls empty() each time to clear previous content", () => {
			tab.display();
			tab.display();
			expect(tab.containerEl.empty).toHaveBeenCalledTimes(2);
		});
	});
});
