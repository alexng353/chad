import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { ansi } from "../ansi";
import type { RouteContext } from "../router";

const CONFIG_PATH = resolve(homedir(), ".config/chad/config.toml");

const EXAMPLE_CONFIG = `# Chad configuration
# ~/.config/chad/config.toml

# Run inside a new tmux session by default
tmux = false

# Max iterations per run (default: 50)
max = 50

# Model to use (e.g. "opus", "sonnet"). Omit to use claude's default.
# model = "sonnet"

# Desktop notifications via notify-send
# "none" = off, "done" = on plan complete/escape, "all" = every iteration + done
notifications = "none"

# [coffee]
# Prevent system idle/sleep while chad is running
# mode = "systemd-inhibit"  # or "off"
`;

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
