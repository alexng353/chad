import type { RouteContext } from "../router";
import { runUpdate } from "../update";

export async function updateHandler(_ctx: RouteContext): Promise<void> {
	await runUpdate();
	process.exit(0);
}
