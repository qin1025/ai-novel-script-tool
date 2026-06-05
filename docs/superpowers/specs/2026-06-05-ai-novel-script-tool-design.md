# AI Novel Script Tool Design

## Goal

Build a browser-based tool that converts a novel text of three or more chapters into an editable YAML screenplay draft, and document the YAML Schema design clearly enough for challenge submission.

## Recommended Approach

Use a static frontend with a deterministic local converter. This keeps the tool runnable without a backend, model key, build step, or network access. The converter detects chapters, scenes, dialogue, action beats, characters, and metadata, then serializes the result into YAML.

Two alternatives were considered:

- Backend LLM service: better semantic extraction, but requires credentials, deployment, and prompt-safety work.
- CLI-only converter: easier to test, but less useful for authors who need quick editing and iteration.

The static browser tool is the best fit for a self-contained submission.

## User Experience

The first screen is the usable workspace. Authors paste or import novel text, set a project title, convert it, inspect validation status, and copy or download the YAML. A sample text button is included for quick demonstration.

## Architecture

- `src/converter.js` owns all parsing, schema construction, validation warnings, and YAML serialization.
- `src/app.js` owns browser events, file loading, conversion, copy/download actions, and status rendering.
- `styles.css` owns the restrained dashboard layout.
- `docs/YAML_SCHEMA.md` documents the YAML structure and schema-design rationale.
- `tests/converter.test.mjs` locks core conversion behavior.

## YAML Schema Principles

- Keep chapters, scenes, and beats as separate levels so authors can edit structure without losing source context.
- Use stable IDs such as `ch001`, `sc001`, and `bt001` so downstream tools can reference script elements.
- Preserve uncertain extraction as editable notes instead of pretending the converter knows everything.
- Keep `metadata` and `source` fields for provenance and validation.
- Allow extension through plain YAML fields instead of a rigid binary format.

## Validation

The converter warns when fewer than three chapters are detected. It still returns YAML so authors can inspect partial inputs, but the UI marks the draft as below the challenge threshold.

## Delivery Limits

This version is AI-ready and locally automatic, but does not call an external LLM. It can be connected to a model later by replacing or augmenting `buildScriptProject()` while preserving the YAML contract.
