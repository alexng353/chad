import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import EXAMPLE_CONFIG from "../../config.example.toml" with { type: "text" };
import { ansi } from "../ansi";
import type { RouteContext } from "../router";

const CONFIG_PATH = resolve(homedir(), ".config/chad/config.toml");

export function configHandler(ctx: RouteContext): void {
	const sub = ctx.positional[0];

	if (sub === "init") {
		if (existsSync(CONFIG_PATH)) {
			console.error(`error: ${CONFIG_PATH} already exists`);
			process.exit(1);
		}
		mkdirSync(dirname(CONFIG_PATH), { recursive: true });
		writeFileSync(CONFIG_PATH, EXAMPLE_CONFIG);
		console.log(`${ansi.dim("created")} ${CONFIG_PATH}`);
		process.exit(0);
	}

	if (sub === "path") {
		console.log(CONFIG_PATH);
		process.exit(0);
	}

	console.error("Usage: chad config init");
	process.exit(1);
}
