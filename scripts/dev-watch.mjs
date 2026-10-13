import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const watchedRoots = [join(projectRoot, "src"), join(projectRoot, "rolldown.config.ts"), join(projectRoot, "manifest.json")];
let building = false;
let lastSignature = "";

function listFiles(path) {
	const stat = statSync(path);
	if (stat.isFile()) return [path];
	return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
		listFiles(join(path, entry.name)),
	);
}

function signature() {
	return watchedRoots
		.flatMap((path) => listFiles(path))
		.map((path) => `${path}:${statSync(path).mtimeMs}`)
		.sort()
		.join("|");
}

async function build() {
	if (building) return;
	building = true;
	try {
		console.log("\nBuilding plugin...");
		await execFileAsync("pnpm", ["build"], { cwd: projectRoot });
		console.log("Build complete. Waiting for changes...");
	} catch (error) {
		console.error(error?.stdout ?? error?.message ?? error);
		console.log("Build failed. Waiting for the next change...");
	} finally {
		building = false;
	}
}

lastSignature = signature();
await build();
setInterval(async () => {
	const nextSignature = signature();
	if (nextSignature === lastSignature) return;
	lastSignature = nextSignature;
	await build();
}, 1000);
