import { existsSync } from "node:fs";
import { resolvePlanPath } from "../lib/plan-resolve";
import { printValidation } from "../plan";
import type { RouteContext } from "../router";

export function validateHandler(ctx: RouteContext): void {
	const plan = resolvePlanPath(ctx.positional);
	if (!existsSync(plan)) {
		console.error(`error: ${plan} not found`);
		process.exit(1);
	}
	const ok = printValidation(plan);
	process.exit(ok ? 0 : 1);
}
