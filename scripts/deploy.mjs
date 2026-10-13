import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { collectArtifactSet, deployPluginTargets, validateObsidianManifest } from "obsidian-plugin-kit/deploy";

const projectRoot = path.resolve(import.meta.dirname, "..");
const vaults = process.argv.flatMap((argument, index, arguments_) =>
	argument === "--vault" && arguments_[index + 1] ? [path.resolve(arguments_[index + 1])] : [],
);
const targets = vaults.map((vault) =>
	path.join(vault, ".obsidian", "plugins", "obsidian-heptabase"),
);

const manifest = JSON.parse(await readFile(path.join(projectRoot, "manifest.json"), "utf8"));
const versions = JSON.parse(await readFile(path.join(projectRoot, "versions.json"), "utf8"));
validateObsidianManifest({ manifest, versions, expectedId: "obsidian-heptabase" });

const { sourceFiles, digests } = await collectArtifactSet({ source: projectRoot });

if (process.argv.includes("--check")) {
	console.log(`validated ${manifest.id}@${manifest.version}`);
	for (const [file, digest] of digests) console.log(`${file} sha256:${digest.slice(0, 12)}`);
	process.exit(0);
}

if (targets.length === 0) {
	throw new Error("Deployment requires at least one explicit --vault <path>");
}

await deployPluginTargets({
	targets,
	sourceFiles,
	digests,
	pluginId: manifest.id,
	log: (target) => console.log(`deployed and enabled ${manifest.id}@${manifest.version} -> ${target}`),
});
