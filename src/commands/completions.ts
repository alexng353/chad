import { ZSH_COMPLETIONS } from "../completions";
import type { RouteContext } from "../router";

export function completionsHandler(ctx: RouteContext): void {
	const shell = ctx.positional[0];
	if (shell === "zsh") {
		console.log(ZSH_COMPLETIONS);
	} else {
		console.error("Usage: chad completions zsh");
		process.exit(1);
	}
	process.exit(0);
}
