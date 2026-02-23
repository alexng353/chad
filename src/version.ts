/**
 * Compile-time constant injected via `bun build --compile --define`.
 * Falls back to "dev" when running from source.
 */
declare const __CHAD_VERSION__: string;

function readPackageJsonVersion(): string {
	try {
		const pkg = require("../package.json");
		return pkg.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

export function getVersion(): string {
	try {
		return __CHAD_VERSION__;
	} catch {
		return readPackageJsonVersion();
	}
}

/**
 * Bun-compiled binaries use a virtual filesystem. Module URLs start with
 * `file:///$bunfs/root/` and `Bun.main` starts with `/$bunfs/root/`.
 */
export function isCompiledBinary(): boolean {
	try {
		return Bun.main.startsWith("/$bunfs/root/");
	} catch {
		return false;
	}
}
