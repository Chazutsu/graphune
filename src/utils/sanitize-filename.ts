const FORBIDDEN_CHARS = /[/\\:*?"<>|]/g;
const CONSECUTIVE_SPACES = / {2,}/g;
const DOTS_ONLY = /^\.+$/;

export function sanitizeFilename(name: string): string {
	const sanitized = name.replace(FORBIDDEN_CHARS, "").replace(CONSECUTIVE_SPACES, " ").trim();
	if (!sanitized || DOTS_ONLY.test(sanitized)) {
		return "Untitled";
	}
	return sanitized;
}
