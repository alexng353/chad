import { homedir } from "node:os";
import { resolve } from "node:path";
import type { ChadConfig } from "./config";
import { loadConfig } from "./config";
import { getVersion, isCompiledBinary } from "./version";

export type FlagValue = boolean | string | number;

export interface FlagDef {
	short?: string;
	long: string;
	description: string;
	takesValue?: boolean;
}

export interface RouteContext {
	flags: Record<string, FlagValue>;
	positional: string[];
	config: ChadConfig;
	chadDir: string;
}

export interface RouteDef {
	name: string;
	description: string;
	args?: string;
	flags?: FlagDef[];
	handler: (ctx: RouteContext) => Promise<void> | void;
	hidden?: boolean;
}

type PreflightFn = () => boolean | Promise<boolean>;

export class Router {
	private routes: RouteDef[] = [];
	private globalFlags: FlagDef[] = [];
	private preflightFns: PreflightFn[] = [];
	private footerText = "";

	preflight(fn: PreflightFn): this {
		this.preflightFns.push(fn);
		return this;
	}

	flag(def: FlagDef): this {
		this.globalFlags.push(def);
		return this;
	}

	route(def: RouteDef): this {
		this.routes.push(def);
		return this;
	}

	footer(text: string): this {
		this.footerText = text;
		return this;
	}

	generateHelp(): string {
		const lines: string[] = [];

		lines.push("Usage: chad [options] PLAN_FILE");
		lines.push("       chad <command> [args]");
		lines.push("");
		lines.push(
			"Autonomous plan runner \u2014 feeds a markdown checklist to claude",
		);
		lines.push("one iteration at a time until all steps are complete.");
		lines.push("");
		lines.push("Commands:");

		const specs: { spec: string; desc: string }[] = [];
		for (const route of this.routes) {
			if (route.hidden) continue;
			const argsPart = route.args ? ` ${route.args}` : "";
			const spec =
				route.name === "" ? "chad <plan>" : `chad ${route.name}${argsPart}`;
			specs.push({ spec, desc: route.description });
		}
		const maxSpec = Math.max(...specs.map((s) => s.spec.length));
		for (const { spec, desc } of specs) {
			lines.push(`  ${spec.padEnd(maxSpec)}  ${desc}`);
		}

		lines.push("");
		lines.push("Options:");

		for (const flag of this.globalFlags) {
			const shortPart = flag.short ? `${flag.short}, ` : "    ";
			const valuePart = flag.takesValue ? " N" : "";
			const spec = `  ${shortPart}${flag.long}${valuePart}`;
			lines.push(`${spec.padEnd(21)}${flag.description}`);
		}
		lines.push("  -V, --version      Show version");
		lines.push("  -h, --help         Show this help");

		if (this.footerText) {
			lines.push("");
			lines.push(this.footerText);
		}

		return lines.join("\n");
	}

	async run(): Promise<void> {
		for (const fn of this.preflightFns) {
			const handled = await fn();
			if (handled) return;
		}

		const rawArgs = process.argv.slice(2);

		if (rawArgs.includes("-h") || rawArgs.includes("--help")) {
			console.log(this.generateHelp());
			process.exit(0);
		}

		if (rawArgs.includes("-V") || rawArgs.includes("--version")) {
			const mode = isCompiledBinary() ? "compiled" : "source";
			console.log(`chad ${getVersion()} (${mode})`);
			process.exit(0);
		}

		const routeNames = this.routes
			.filter((r) => r.name !== "")
			.map((r) => r.name);
		const matchedRoute = routeNames.includes(rawArgs[0])
			? (this.routes.find((r) => r.name === rawArgs[0]) ?? null)
			: null;

		const args = matchedRoute ? rawArgs.slice(1) : rawArgs;
		const route = matchedRoute ?? this.routes.find((r) => r.name === "");

		if (!route) {
			console.log(this.generateHelp());
			process.exit(1);
		}

		const allFlags = [...this.globalFlags, ...(route.flags ?? [])];
		const { flags, positional } = parseFlags(args, allFlags);

		// No subcommand and no positional args → show help
		if (!matchedRoute && positional.length === 0) {
			console.log(this.generateHelp());
			process.exit(1);
		}

		const config = loadConfig();
		const chadDir = resolve(homedir(), ".chad");

		await route.handler({ flags, positional, config, chadDir });
	}
}

function parseFlags(
	args: string[],
	flagDefs: FlagDef[],
): { flags: Record<string, FlagValue>; positional: string[] } {
	const byLong = new Map<string, FlagDef>();
	const byShort = new Map<string, FlagDef>();
	for (const def of flagDefs) {
		byLong.set(def.long, def);
		if (def.short) byShort.set(def.short, def);
	}

	const flags: Record<string, FlagValue> = {};
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const def = byLong.get(arg) ?? byShort.get(arg);

		if (def) {
			const key = def.long.replace(/^--/, "");
			if (def.takesValue) {
				const val = args[i + 1];
				if (val === undefined) {
					console.error(`error: ${arg} requires a value`);
					process.exit(1);
				}
				if (/^-?\d+$/.test(val)) {
					flags[key] = Number.parseInt(val, 10);
				} else {
					flags[key] = val;
				}
				i++;
			} else {
				flags[key] = true;
			}
		} else if (arg.startsWith("-")) {
			console.error(`error: unknown flag: ${arg}`);
			process.exit(1);
		} else {
			positional.push(arg);
		}
	}

	return { flags, positional };
}
