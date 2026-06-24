# `ruleset/` — build-time copy of the companion rules

This directory holds a **build-time-bundled copy** of the heuristic rules and lists
from the companion repository [`read-twice-rules`][rules] (ADR-004). The extension
compiles the YAML rules into typed objects at build time — there is no runtime YAML
parser in the shipped bundle (architecture §3).

It is intentionally empty in the scaffold: the companion repo does not exist yet, and
the v0.1 rules currently live as TypeScript modules under `src/lib/heuristics/`. When
the companion repo is stood up, the sync/compile step populates this directory and the
loader (`src/lib/ruleset/loader.ts`) reads from here instead.

[rules]: https://github.com/kVadrum/read-twice-rules
