#!/usr/bin/env bun
import { archiveHandler } from "./commands/archive";
import { brainstormHandler } from "./commands/brainstorm";
import { completionsHandler } from "./commands/completions";
import { configHandler } from "./commands/config";
import { continueHandler } from "./commands/continue";
import { listHandler } from "./commands/list";
import { newHandler } from "./commands/new";
import { nextHandler } from "./commands/next";
import { rebaseHandler } from "./commands/rebase";
import { RUN_FLAGS, runHandler } from "./commands/run";
import { STATUS_FLAGS, statusHandler } from "./commands/status";
import { updateHandler } from "./commands/update";
import { validateHandler } from "./commands/validate";
import { runMcpServer } from "./mcp";
import { Router } from "./router";

const router = new Router();

// MCP server must be checked before anything else
router.preflight(async () => {
	if (process.argv.includes("--__mcp-server")) {
		runMcpServer();
		await new Promise(() => {});
		return true;
	}
	return false;
});

// Global flags (run-related, but available to all routes)
for (const flag of RUN_FLAGS) {
	router.flag(flag);
}

// Routes
router.route({
	name: "",
	description: "Run a plan file",
	handler: runHandler,
});
router.route({
	name: "list",
	description: "List plans in ~/.chad/",
	handler: listHandler,
});
router.route({
	name: "next",
	description: "Run first incomplete plan in ~/.chad/",
	handler: nextHandler,
});
router.route({
	name: "continue",
	description: "Re-run last plan used in this directory",
	handler: continueHandler,
});
router.route({
	name: "new",
	description: "Create a new plan from template in ~/.chad/",
	args: "<name>",
	flags: [
		{
			long: "--template-only",
			short: "-t",
			description: "Write blank template without opening Claude",
		},
	],
	handler: newHandler,
});
router.route({
	name: "status",
	description: "Show plan progress (-w/--watch for live updates)",
	args: "[-w] <plan>",
	flags: STATUS_FLAGS,
	handler: statusHandler,
});
router.route({
	name: "validate",
	description: "Check plan file format and structure",
	args: "<plan>",
	handler: validateHandler,
});
router.route({
	name: "brainstorm",
	description: "Open interactive session to develop the plan",
	args: "<plan>",
	handler: brainstormHandler,
});
router.route({
	name: "rebase",
	description: "Clean up git history with claude's help",
	args: "<plan>",
	handler: rebaseHandler,
});
router.route({
	name: "archive",
	description: "Move a plan to ~/.chad/archive/",
	args: "<plan>",
	handler: archiveHandler,
});
router.route({
	name: "config",
	description: "Manage config file",
	args: "init",
	handler: configHandler,
});
router.route({
	name: "update",
	description: "Update chad to the latest release",
	handler: updateHandler,
});
router.route({
	name: "completions",
	description: "Output zsh completion script",
	args: "zsh",
	handler: completionsHandler,
});

router.footer(
	"Keybindings (during execution):\n  Ctrl-C    Kill current iteration and exit immediately\n  Ctrl-X    Stop after the current iteration finishes",
);

await router.run();
