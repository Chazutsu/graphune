export function normalizeFingerprintContent(content: string): string {
	return content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
}

export function createContentFingerprint(content: string): string {
	const normalized = normalizeFingerprintContent(content);
	let hash = 0x811c9dc5;
	for (let index = 0; index < normalized.length; index++) {
		hash ^= normalized.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}:${normalized.length}`;
}
