---
name: chad-new
description: Create a new chad plan. Use when the user says "new plan", "chad new", "create plan", or "start a new chad plan". Accepts a plan name. Note: this wraps the `chad new` CLI command. For a pure Claude-driven plan authoring workflow, use the chad-plan-writer skill instead.
argument-hint: [plan name] [-y|--non-interactive]
allowed-tools: [Bash, Read, Glob]
---

# Chad New

Create a new chad plan using the `chad new` CLI command.

## Arguments

Plan name (optional): $ARGUMENTS

## Mode detection

Parse `$ARGUMENTS` for flags:
- If `--non-interactive` or `-y` is present: use non-interactive mode (create template only, then populate it).
- Otherwise: use interactive mode (launch the interactive brainstorm session).

## Interactive mode (default)

1. **If a plan name is specified** in `$ARGUMENTS` (after stripping flags):
   - Run `chad new <name>` which launches an interactive Claude brainstorm session to populate the plan.

2. **If no plan name is specified:**
   - Ask the user: "What would you like to plan?" and wait for their answer.
   - Once a name is provided, run `chad new <name>` as above.

## Non-interactive mode (`-y` or `--non-interactive`)

1. **If a plan name is specified** in `$ARGUMENTS` (after stripping flags):
   - Run `chad new <name> --template-only` to create the plan template without launching Claude.
   - The command will output the path to the newly created plan file.
   - Read the generated plan file.
   - Explore the codebase for context:
     - Read `CLAUDE.md` if it exists (check the project root).
     - Run `ls` or use Glob to survey the top-level project structure.
   - Populate the plan's **Reference** section with relevant key paths, conventions, and architectural notes from the codebase.
   - Populate the **Steps** section with concrete, actionable steps derived from the plan name and codebase context. Each step should include a **Validate** command.
   - Write the updated plan back to the file.

2. **If no plan name is specified:**
   - Exit with an error: "A plan name is required in non-interactive mode. Usage: /chad-new <name> --non-interactive"
