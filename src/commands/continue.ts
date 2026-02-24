import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ansi } from "../ansi";
import type { RouteContext } from "../router";
import { executeRun } from "./run";

export async function continueHandler(ctx: RouteContext): Promise<void> {
	const LAST_RUN_FILE = resolve(ctx.chadDir, "last-run.json");
	let lastRun: Record<string, string> = {};
	try {
		lastRun = JSON.parse(readFileSync(LAST_RUN_FILE, "utf8"));
	} catch {
		console.error("error: no previous run found for this directory");
		process.exit(1);
	}
	const lastPlan = lastRun[process.cwd()];
	if (!lastPlan || !existsSync(lastPlan)) {
		console.error("error: no previous run found for this directory");
		process.exit(1);
	}
	console.log(`${ansi.bold("continuing:")} ${lastPlan}`);
	await executeRun(ctx, lastPlan);
}
