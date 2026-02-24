import { homedir } from "node:os";
import { resolve } from "node:path";

export function expandPath(p: string): string {
	return resolve(p.startsWith("~") ? p.replace("~", homedir()) : p);
}

export function resolvePlanPath(positional: string[]): string {
	const raw = positional[0];
	if (!raw) {
		console.error("error: no plan file specified");
		process.exit(1);
	}
	return expandPath(raw);
}
