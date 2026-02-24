import { existsSync, mkdirSync, renameSync } from "node:fs";
import { basename, resolve } from "node:path";
import { ansi } from "../ansi";
import { resolvePlanPath } from "../lib/plan-resolve";
import type { RouteContext } from "../router";

export function archiveHandler(ctx: RouteContext): void {
	const plan = resolvePlanPath(ctx.positional);
	if (!existsSync(plan)) {
		console.error(`error: ${plan} not found`);
		process.exit(1);
	}

	const archiveDir = resolve(ctx.chadDir, "archive");
	mkdirSync(archiveDir, { recursive: true });

	const dest = resolve(archiveDir, basename(plan));
	if (existsSync(dest)) {
		console.error(`error: ${dest} already exists`);
		process.exit(1);
	}

	renameSync(plan, dest);
	console.log(`${ansi.dim(plan)} → ${ansi.dim(dest)}`);
}
