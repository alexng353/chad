---
name: chad-run
description: Run a chad plan. Use when the user says "run plan", "chad run", "execute plan", or "start plan". Accepts a plan file path or plan name.
argument-hint: [plan name or path] [-y|--non-interactive]
allowed-tools: [Bash]
---

# Chad Run

Execute a chad plan using the `chad` CLI.

## Arguments

Plan name or path (optional): $ARGUMENTS

## Mode detection

Parse `$ARGUMENTS` for flags:
- If `--non-interactive` or `-y` is present: skip all confirmations, pass `-y` to chad commands.
- Otherwise: use interactive mode (confirm before running, show pickers).

## Interactive mode (default)

1. **If a plan is specified** in `$ARGUMENTS` (after stripping flags):
   - Run `chad status <plan>` and show the output.
   - Ask the user: "Ready to run this plan? (y/N)"
   - If confirmed, run `chad <plan>`.
   - After completion, run `chad status <plan>` again and show the result.

2. **If no plan is specified:**
   - Run `chad list` and display all available plans.
   - Ask the user which plan they want to run.
   - Once the user picks a plan, follow step 1 above with that plan.

## Non-interactive mode (`-y` or `--non-interactive`)

1. **If a plan is specified** in `$ARGUMENTS` (after stripping flags):
   - Run `chad <plan> -y` directly without confirmation.
   - After completion, run `chad status <plan>` and show the result.

2. **If no plan is specified:**
   - Run `chad next -y` to automatically pick and run the next pending plan.
   - After completion, show the status output.
