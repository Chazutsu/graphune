export interface GraphuneSettings {
	language: "system" | "en" | "ja";
	extractedFilesFolder: string;
	defaultNodeWidth: number;
	defaultNodeHeight: number;
	fileNamePrefix: string;
	defaultEdgeColor: string;
	defaultEdgeLabel: string;
	enableEdgeSync: boolean;
	quickCardDefaultTitle: string;
	showPreviewBeforeCreate: boolean;
}

export const DEFAULT_SETTINGS: GraphuneSettings = {
	language: "system",
	extractedFilesFolder: "",
	defaultNodeWidth: 400,
	defaultNodeHeight: 300,
	fileNamePrefix: "",
	defaultEdgeColor: "",
	defaultEdgeLabel: "",
	enableEdgeSync: true,
	quickCardDefaultTitle: "Untitled",
	showPreviewBeforeCreate: false,
};
