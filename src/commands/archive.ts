import crypto from "node:crypto";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { basename, resolve } from "node:path";
import { ansi } from "../ansi";
import { resolvePlanPath } from "../lib/plan-resolve";
import type { RouteContext } from "../router";

function dedupName(name: string): string {
	const stem = name.replace(/\.md$/, "");
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
	const entropy = crypto.randomBytes(3).toString("hex");
	return `${stem}-${entropy}_${ts}.md`;
}

export function archiveHandler(ctx: RouteContext): void {
	const plan = resolvePlanPath(ctx.positional);
	if (!existsSync(plan)) {
		console.error(`error: ${plan} not found`);
		process.exit(1);
	}

	const archiveDir = resolve(ctx.chadDir, "archive");
	mkdirSync(archiveDir, { recursive: true });

	let dest = resolve(archiveDir, basename(plan));
	if (existsSync(dest)) {
		dest = resolve(archiveDir, dedupName(basename(plan)));
	}

	renameSync(plan, dest);
	console.log(`${ansi.dim(plan)} → ${ansi.dim(dest)}`);
}
