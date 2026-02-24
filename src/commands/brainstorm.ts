import { runBrainstorm } from "../brainstorm";
import { resolvePlanPath } from "../lib/plan-resolve";
import type { RouteContext } from "../router";

export function brainstormHandler(ctx: RouteContext): void {
	const plan = resolvePlanPath(ctx.positional);
	runBrainstorm(plan);
}
