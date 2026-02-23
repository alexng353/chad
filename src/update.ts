import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { getVersion, isCompiledBinary } from "./version";

const REPO = "alexng353/chad";
const CACHE_DIR = resolve(homedir(), ".config/chad");
const CACHE_FILE = resolve(CACHE_DIR, "update-check.json");
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CacheEntry {
	checkedAt: number;
	latestVersion: string;
}

function platformAssetName(): string | null {
	const platform = process.platform;
	const arch = process.arch;

	const platformMap: Record<string, string> = {
		linux: "linux",
		darwin: "darwin",
	};
	const archMap: Record<string, string> = {
		x64: "x64",
		arm64: "arm64",
	};

	const p = platformMap[platform];
	const a = archMap[arch];
	if (!p || !a) return null;
	return `chad-${p}-${a}`;
}

async function fetchLatestRelease(): Promise<{
	version: string;
	assets: { name: string; browser_download_url: string }[];
} | null> {
	try {
		const resp = await fetch(
			`https://api.github.com/repos/${REPO}/releases/latest`,
			{
				headers: { Accept: "application/vnd.github+json" },
			},
		);
		if (!resp.ok) return null;
		const data = (await resp.json()) as {
			tag_name: string;
			assets: { name: string; browser_download_url: string }[];
		};
		return {
			version: data.tag_name.replace(/^v/, ""),
			assets: data.assets,
		};
	} catch {
		return null;
	}
}

function isNewer(latest: string, current: string): boolean {
	const l = latest.split(".").map(Number);
	const c = current.split(".").map(Number);
	for (let i = 0; i < Math.max(l.length, c.length); i++) {
		const lv = l[i] ?? 0;
		const cv = c[i] ?? 0;
		if (lv > cv) return true;
		if (lv < cv) return false;
	}
	return false;
}

/**
 * Fire-and-forget background update check. Prints a notice to stderr
 * if a newer version is available. Only runs in compiled mode.
 */
export function checkForUpdateBackground(): void {
	if (!isCompiledBinary()) return;

	// Check cache
	try {
		if (existsSync(CACHE_FILE)) {
			const cache: CacheEntry = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
			if (Date.now() - cache.checkedAt < CACHE_TTL_MS) {
				if (isNewer(cache.latestVersion, getVersion())) {
					process.stderr.write(
						`\x1b[33mchad ${cache.latestVersion} available (current: ${getVersion()}). Run \`chad update\` to upgrade.\x1b[0m\n`,
					);
				}
				return;
			}
		}
	} catch {
		// corrupt cache, continue to fetch
	}

	// Async fetch — fire and forget
	fetchLatestRelease()
		.then((release) => {
			if (!release) return;
			mkdirSync(CACHE_DIR, { recursive: true });
			const entry: CacheEntry = {
				checkedAt: Date.now(),
				latestVersion: release.version,
			};
			writeFileSync(CACHE_FILE, JSON.stringify(entry));
			if (isNewer(release.version, getVersion())) {
				process.stderr.write(
					`\x1b[33mchad ${release.version} available (current: ${getVersion()}). Run \`chad update\` to upgrade.\x1b[0m\n`,
				);
			}
		})
		.catch(() => {
			// silently ignore network errors
		});
}

/**
 * Interactive `chad update` subcommand.
 */
export async function runUpdate(): Promise<void> {
	if (!isCompiledBinary()) {
		console.log(
			"running from source — use `git pull` to update, or download a binary from:",
		);
		console.log(`  https://github.com/${REPO}/releases/latest`);
		process.exit(0);
	}

	const currentVersion = getVersion();
	console.log(`current version: ${currentVersion}`);
	console.log("checking for updates...");

	const release = await fetchLatestRelease();
	if (!release) {
		console.error("error: could not fetch latest release from GitHub");
		process.exit(1);
	}

	if (!isNewer(release.version, currentVersion)) {
		console.log(`already up to date (${currentVersion})`);
		process.exit(0);
	}

	const assetName = platformAssetName();
	if (!assetName) {
		console.error(
			`error: no prebuilt binary for ${process.platform}-${process.arch}`,
		);
		console.error(
			`download manually: https://github.com/${REPO}/releases/latest`,
		);
		process.exit(1);
	}

	const asset = release.assets.find((a) => a.name === assetName);
	if (!asset) {
		console.error(
			`error: asset ${assetName} not found in release ${release.version}`,
		);
		console.error(
			`download manually: https://github.com/${REPO}/releases/latest`,
		);
		process.exit(1);
	}

	console.log(`downloading ${assetName} (${release.version})...`);

	const resp = await fetch(asset.browser_download_url);
	if (!resp.ok || !resp.body) {
		console.error(`error: download failed (${resp.status})`);
		process.exit(1);
	}

	const binaryPath = process.execPath;
	const tmpPath = resolve(dirname(binaryPath), `.chad-update-${Date.now()}`);

	try {
		const data = new Uint8Array(await resp.arrayBuffer());
		writeFileSync(tmpPath, data);
		chmodSync(tmpPath, 0o755);
		renameSync(tmpPath, binaryPath);
	} catch (err) {
		// Clean up temp file on failure
		try {
			unlinkSync(tmpPath);
		} catch {}
		console.error(`error: failed to replace binary: ${err}`);
		process.exit(1);
	}

	// Update cache
	try {
		mkdirSync(CACHE_DIR, { recursive: true });
		writeFileSync(
			CACHE_FILE,
			JSON.stringify({
				checkedAt: Date.now(),
				latestVersion: release.version,
			}),
		);
	} catch {}

	console.log(`updated to ${release.version}`);
}
