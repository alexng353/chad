---
name: chad-status
description: Check chad plan progress. Use when the user says "plan status", "chad status", "check progress", or "how far along". Accepts an optional plan file path or plan name.
argument-hint: [plan name or path] [-y|--non-interactive]
allowed-tools: [Bash]
---

# Chad Status

Check the progress of a chad plan using the `chad` CLI.

## Arguments

Plan name or path (optional): $ARGUMENTS

## Mode detection

Parse `$ARGUMENTS` for flags:
- If `--non-interactive` or `-y` is present: use non-interactive mode (one-shot output, no watch).
- Otherwise: use interactive mode (live watch or interactive picker).

## Interactive mode (default)

1. **If a plan is specified** in `$ARGUMENTS` (after stripping flags):
   - Run `chad status -w <plan>` to show live watch mode with auto-refresh.

2. **If no plan is specified:**
   - Run `chad status` to open the interactive picker and let the user select a plan.

## Non-interactive mode (`-y` or `--non-interactive`)

1. **If a plan is specified** in `$ARGUMENTS` (after stripping flags):
   - Run `chad status <plan>` for a one-shot status snapshot (no watch).

2. **If no plan is specified:**
   - Run `chad list` to show all plans and their progress summary.
