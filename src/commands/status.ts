import { existsSync } from "node:fs";
import { resolvePlanPath } from "../lib/plan-resolve";
import { pickPlan } from "../picker";
import { printStatus, watchStatus } from "../plan";
import type { FlagDef, RouteContext } from "../router";

export const STATUS_FLAGS: FlagDef[] = [
	{
		short: "-w",
		long: "--watch",
		description: "Watch for changes and re-render",
	},
];

export async function statusHandler(ctx: RouteContext): Promise<void> {
	const watchFlag = ctx.flags.watch === true;

	// No positional arg -> interactive picker
	if (!ctx.positional[0]) {
		const selected = await pickPlan();
		if (!selected) process.exit(0);
		if (watchFlag) {
			watchStatus(selected);
			await new Promise(() => {});
		}
		printStatus(selected);
		process.exit(0);
	}

	const plan = resolvePlanPath(ctx.positional);
	if (!existsSync(plan)) {
		console.error(`error: ${plan} not found`);
		process.exit(1);
	}
	if (watchFlag) {
		watchStatus(plan);
		await new Promise(() => {});
	}
	printStatus(plan);
	process.exit(0);
}
