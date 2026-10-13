import type { ExtractedSection } from "@/types/plugin";

const HEADING_PATTERN = /^(#{1,6}) (.+)$/;
const CODE_FENCE_PATTERN = /^(`{3,}|~{3,})/;

export interface SectionRange {
	contentStart: number;
	contentEnd: number;
}

export class ContentExtractor {
	extractContent(content: string, headingLine: number, headingLevel: number): string {
		return this.extractRange(content, headingLine + 1, headingLine, headingLevel);
	}

	extractContentWithHeading(content: string, headingLine: number, headingLevel: number): string {
		return this.extractRange(content, headingLine, headingLine, headingLevel);
	}

	getSectionRange(content: string, headingLine: number, headingLevel: number): SectionRange | null {
		const lines = content.split("\n");

		if (headingLine < 0 || headingLine >= lines.length) {
			return null;
		}

		const codeBlockLines = this.buildCodeBlockRanges(lines);
		const contentStart = headingLine + 1;
		const contentEnd = this.findNextHeadingLine(lines, contentStart, headingLevel, codeBlockLines);

		return { contentStart, contentEnd };
	}

	extractSectionTree(content: string, headingLine: number, headingLevel: number): ExtractedSection {
		const lines = content.split("\n");
		const codeBlockLines = this.buildCodeBlockRanges(lines);

		const headingMatch = lines[headingLine]?.match(HEADING_PATTERN);
		const headingText = headingMatch?.[2] ?? "";

		const sectionEnd = this.findNextHeadingLine(
			lines,
			headingLine + 1,
			headingLevel,
			codeBlockLines,
		);

		const children: ExtractedSection[] = [];
		let contentLines: string[] = [];
		let i = headingLine + 1;

		while (i < sectionEnd) {
			if (codeBlockLines.has(i)) {
				contentLines.push(lines[i]!);
				i++;
				continue;
			}

			const match = lines[i]!.match(HEADING_PATTERN);
			if (match && match[1]!.length > headingLevel) {
				const childLevel = match[1]!.length;
				const childEnd = this.findNextHeadingLine(lines, i + 1, childLevel, codeBlockLines);

				const childContent = lines.slice(i, childEnd).join("\n");
				const child = this.extractSectionTree(childContent, 0, childLevel);
				child.headingLine = i;
				children.push(child);

				i = childEnd;
			} else {
				contentLines.push(lines[i]!);
				i++;
			}
		}

		return {
			headingText,
			headingLevel,
			headingLine,
			content: contentLines.join("\n"),
			children,
		};
	}

	private extractRange(
		content: string,
		sliceStart: number,
		validationLine: number,
		headingLevel: number,
	): string {
		const lines = content.split("\n");

		if (validationLine < 0 || validationLine >= lines.length) {
			return "";
		}

		const codeBlockLines = this.buildCodeBlockRanges(lines);
		const endLine = this.findNextHeadingLine(
			lines,
			validationLine + 1,
			headingLevel,
			codeBlockLines,
		);
		return lines.slice(sliceStart, endLine).join("\n").trim();
	}

	private buildCodeBlockRanges(lines: string[]): Set<number> {
		const codeBlockLines = new Set<number>();
		let inCodeBlock = false;
		let fenceChar = "";
		let fenceLength = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			const match = line.match(CODE_FENCE_PATTERN);

			if (inCodeBlock) {
				codeBlockLines.add(i);
				if (match && match[1]!.charAt(0) === fenceChar && match[1]!.length >= fenceLength) {
					const rest = line.slice(match[1]!.length).trim();
					if (rest === "") {
						inCodeBlock = false;
					}
				}
			} else if (match) {
				inCodeBlock = true;
				fenceChar = match[1]!.charAt(0);
				fenceLength = match[1]!.length;
				codeBlockLines.add(i);
			}
		}

		return codeBlockLines;
	}

	private findNextHeadingLine(
		lines: string[],
		startLine: number,
		headingLevel: number,
		codeBlockLines: Set<number>,
	): number {
		for (let i = startLine; i < lines.length; i++) {
			if (codeBlockLines.has(i)) {
				continue;
			}
			const match = lines[i]!.match(HEADING_PATTERN);
			if (match && match[1]!.length <= headingLevel) {
				return i;
			}
		}
		return lines.length;
	}
}
