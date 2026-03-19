---
name: chad-brainstorm
description: Refine and improve an existing chad plan. Use when the user says "brainstorm plan", "chad brainstorm", "refine plan", or "improve plan".
argument-hint: [plan path or name] [-y|--non-interactive]
allowed-tools: [Bash, Read, Write, Glob]
---

# Chad Brainstorm

Refine and improve an existing chad plan.

## Arguments

Plan path or name (optional): $ARGUMENTS

## Mode detection

Parse `$ARGUMENTS` for flags:
- If `--non-interactive` or `-y` is present: use non-interactive mode (analyze and edit the plan file directly).
- Otherwise: use interactive mode (launch the interactive brainstorm session).

## Interactive mode (default)

1. **If a plan is specified** in `$ARGUMENTS` (after stripping flags):
   - Run `chad brainstorm <plan>` which opens an interactive Claude session to refine the plan.

2. **If no plan is specified:**
   - Run `chad list` to show available plans, ask the user which one to brainstorm.
   - Once selected, run `chad brainstorm <plan>`.

## Non-interactive mode (`-y` or `--non-interactive`)

Do NOT launch the interactive brainstorm session. Instead, analyze and improve the plan file directly.

1. **If a plan is specified** in `$ARGUMENTS` (after stripping flags):
   - Locate the plan file (check `~/.chad/` or the path as given).
   - Read the plan file contents.
   - Analyze it for the following issues:
     - **Missing validation commands:** Steps without a `**Validate:**` line.
     - **Vague step descriptions:** Steps that don't clearly describe what files to create/modify or what commands to run.
     - **Steps that are too large:** Steps that combine multiple distinct concerns or would take more than ~30 minutes to complete.
     - **Missing Reference section content:** A Reference section that is empty or only has placeholder text.
     - **Missing Co-Authored-By or agent attribution conventions** in commit/push instructions.
   - Write suggested improvements directly to the plan file:
     - Add `**Validate:**` lines to steps that lack them.
     - Clarify vague step descriptions with concrete file paths or commands.
     - Split oversized steps into smaller, focused steps.
     - Populate the Reference section with relevant project context if it is sparse.
   - Report a summary of what was changed.

2. **If no plan is specified:**
   - Exit with an error: "A plan path or name is required in non-interactive mode. Usage: /chad-brainstorm <plan> --non-interactive"
