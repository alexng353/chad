import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export type CoffeeMode = "systemd-inhibit" | "off";
export type NotifyMode = "all" | "none" | "done";

export type ChadConfig = {
	tmux: boolean;
	max: number;
	height: number;
	model: string | null;
	notifications: NotifyMode;
	coffee: { mode: CoffeeMode };
};

const DEFAULTS: ChadConfig = {
	tmux: false,
	max: 50,
	height: 30,
	model: null,
	notifications: "none",
	coffee: { mode: "off" },
};

const CONFIG_PATH = resolve(homedir(), ".config/chad/config.toml");

export function loadConfig(): ChadConfig {
	if (!existsSync(CONFIG_PATH))
		return { ...DEFAULTS, coffee: { ...DEFAULTS.coffee } };

	let raw: string;
	try {
		raw = readFileSync(CONFIG_PATH, "utf8");
	} catch {
		return { ...DEFAULTS, coffee: { ...DEFAULTS.coffee } };
	}

	let parsed: Record<string, unknown>;
	try {
		parsed = Bun.TOML.parse(raw) as Record<string, unknown>;
	} catch (err) {
		console.error(`warning: failed to parse ${CONFIG_PATH}: ${err}`);
		return { ...DEFAULTS, coffee: { ...DEFAULTS.coffee } };
	}

	const coffee = parsed.coffee as Record<string, unknown> | undefined;

	return {
		tmux: typeof parsed.tmux === "boolean" ? parsed.tmux : DEFAULTS.tmux,
		max:
			typeof parsed.max === "number" && parsed.max >= 1
				? parsed.max
				: DEFAULTS.max,
		height:
			typeof parsed.height === "number" && parsed.height >= 1
				? parsed.height
				: DEFAULTS.height,
		model: typeof parsed.model === "string" ? parsed.model : DEFAULTS.model,
		notifications:
			parsed.notifications === "all" || parsed.notifications === "done"
				? parsed.notifications
				: DEFAULTS.notifications,
		coffee: {
			mode:
				coffee?.mode === "systemd-inhibit"
					? "systemd-inhibit"
					: DEFAULTS.coffee.mode,
		},
	};
}
