import { mkdirSync } from "node:fs";
import { ansi } from "../ansi";
import { listPlans } from "../plan";
import type { RouteContext } from "../router";
import { executeRun } from "./run";

export async function nextHandler(ctx: RouteContext): Promise<void> {
	mkdirSync(ctx.chadDir, { recursive: true });
	const plans = listPlans(ctx.chadDir);
	const next = plans.find((p) => !p.complete);
	if (!next) {
		console.log("all plans complete (or no plans found in ~/.chad/)");
		process.exit(0);
	}
	console.log(`${ansi.bold("next plan:")} ${next.name}`);
	await executeRun(ctx, next.path);
}
