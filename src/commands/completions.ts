import { ZSH_COMPLETIONS } from "../completions";
import type { RouteContext } from "../router";

export function completionsHandler(ctx: RouteContext): void {
	const shell = ctx.positional[0];
	if (shell === "zsh") {
		console.log(ZSH_COMPLETIONS);
	} else {
		console.log('Add to your .zshrc:\n\n  eval "$(chad completions zsh)"');
		process.exit(shell ? 1 : 0);
	}
	process.exit(0);
}
