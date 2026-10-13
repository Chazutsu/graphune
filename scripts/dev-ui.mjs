import { execFile, spawn } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const forwardedArgs = process.argv.slice(2);
const children = new Set();

await execFileAsync(
	"pnpm",
	["exec", "tailwindcss", "-i", "src/styles.css", "-o", "styles.css", "--minify"],
	{ cwd: projectRoot },
);

function start(args) {
	const child = spawn("pnpm", args, {
		cwd: projectRoot,
		stdio: "inherit",
	});
	children.add(child);
	child.once("exit", () => children.delete(child));
	return child;
}

function stop() {
	for (const child of children) child.kill("SIGTERM");
}

process.once("SIGINT", () => {
	stop();
	process.exit(130);
});
process.once("SIGTERM", () => {
	stop();
	process.exit(143);
});

start(["exec", "tailwindcss", "-i", "src/styles.css", "-o", "styles.css", "--watch"]);
const vite = start(["exec", "vite", "--config", "dev/vite.config.ts", ...forwardedArgs]);

vite.once("exit", (code) => {
	stop();
	process.exitCode = code ?? 1;
});
