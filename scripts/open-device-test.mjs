import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const vaultPath = resolve(projectRoot, ".dev", "ux-audit-vault");
const vaultUrl = `obsidian://open?path=${encodeURIComponent(vaultPath)}`;

if (process.platform === "darwin") {
	execFileSync("open", [vaultUrl], { stdio: "inherit" });
} else if (process.platform === "win32") {
	execFileSync("cmd", ["/c", "start", "", vaultUrl], { stdio: "inherit" });
} else {
	execFileSync("xdg-open", [vaultUrl], { stdio: "inherit" });
}

console.log(`Opened UX audit vault: ${vaultPath}`);
