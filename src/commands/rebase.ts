import { resolvePlanPath } from "../lib/plan-resolve";
import { runRebase } from "../rebase";
import type { RouteContext } from "../router";

export function rebaseHandler(ctx: RouteContext): void {
	const plan = resolvePlanPath(ctx.positional);
	runRebase(plan);
}
