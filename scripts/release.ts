#!/usr/bin/env bun
/**
 * Bump version in package.json, commit, tag, and push.
 * Usage: bun run release <patch|minor|major>
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const bump = process.argv[2] as "patch" | "minor" | "major" | undefined;
if (!bump || !["patch", "minor", "major"].includes(bump)) {
	console.error("Usage: bun run release <patch|minor|major>");
	process.exit(1);
}

// Guardrails
const branch = execSync("git rev-parse --abbrev-ref HEAD", {
	encoding: "utf8",
}).trim();
if (branch !== "main") {
	console.error(`error: must be on main branch (currently on ${branch})`);
	process.exit(1);
}

const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (status.length > 0) {
	console.error("error: working directory is not clean");
	process.exit(1);
}

// Read and bump version
const pkgPath = resolve(import.meta.dir, "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);

let newVersion: string;
switch (bump) {
	case "major":
		newVersion = `${major + 1}.0.0`;
		break;
	case "minor":
		newVersion = `${major}.${minor + 1}.0`;
		break;
	case "patch":
		newVersion = `${major}.${minor}.${patch + 1}`;
		break;
}

pkg.version = newVersion;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);

const tag = `v${newVersion}`;
console.log(`${pkg.version} -> ${newVersion}`);

execSync("git add package.json", { stdio: "inherit" });
execSync(`git commit -m "release: ${tag}"`, { stdio: "inherit" });
execSync(`git tag ${tag}`, { stdio: "inherit" });
execSync("git push", { stdio: "inherit" });
execSync(`git push origin ${tag}`, { stdio: "inherit" });

console.log(`\npushed ${tag} — GitHub Actions will build and release.`);
