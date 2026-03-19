---
name: chad-validate
description: Validate a chad plan's format. Use when the user says "validate plan", "chad validate", or "check plan format". Accepts a plan file path or plan name.
argument-hint: [plan name or path] [-y|--non-interactive]
allowed-tools: [Bash, Read]
---

# Chad Validate

Validate a chad plan's format using the `chad validate` CLI command.

## Arguments

Plan name or path (optional): $ARGUMENTS

## Mode detection

Parse `$ARGUMENTS` for flags:
- If `--non-interactive` or `-y` is present: use non-interactive mode (report results and exit).
- Otherwise: use interactive mode (offer to fix any warnings found).

## Interactive mode (default)

1. Run `chad validate <plan>` (stripping any flags from `$ARGUMENTS`).
2. Show the validation output.
3. **If validation passes with no warnings:** report success and stop.
4. **If validation has warnings or errors:**
   - Ask the user: "Would you like help fixing these issues?"
   - If yes: read the plan file with the Read tool and suggest specific corrections for each warning or error found. Offer to apply them.
   - If no: stop.

## Non-interactive mode (`-y` or `--non-interactive`)

1. Run `chad validate <plan>` (stripping flags from `$ARGUMENTS`).
2. Show the validation output.
3. Exit with the same exit code as `chad validate`.
