# HAVENIQ Design Studio — Architecture

Full rationale and roadmap: [MASTER_PLAN.md](MASTER_PLAN.md). Status: [PROGRESS.md](PROGRESS.md).

## Data flow
```
PlanTwin (approved, immutable)  ->  Baseline (shell GLB + walk.json + entity map, versioned)
DesignDocument = baseline ref + nodes{} + overrides{} + proposals{}      (per user)
Command engine (pure TS): apply -> {doc, inverse}; validate -> errors | advisories
zustand store = single source of truth for Walk / Design / Plan modes
```

## Rules
- `lib/studio/**` is engine-independent: no three.js, no React imports. Testable in Vitest and usable server-side (AI validation).
- Units: metres. Plan coords follow the twin (x east, y north, z up). Rotation: radians about vertical. Viewer maps (x,y,z) -> (x,z,-y).
- Nodes are a flat `Record<NodeId, Node>` with `parentId` (idea from Pascal Editor, MIT; no code is vendored).
- Baseline is read-only. User changes to baseline entities live in `overrides[baselineId]`. Restore original = drop overrides + nodes.
- IDs: baseline `wall:<id>`, `room:<id>`, `opening:<id>`, `surface:<wall>:<side>`, `surface:floor:<room>`; user nodes are ULIDs.
- Every mutation is a Command with an inverse. UI gestures, AI proposals and migrations all emit Commands. `batch` = one undo step.
- Catalog references are pinned: `{catalogId, version}`; published versions are immutable.
- Resizing is never non-uniform mesh scaling: fixed assets, size variants, modular assemblies (connectors) or parametric regeneration.
- Existing `/walk/*` assets and pages are never modified; new output goes to new slugs (e.g. `yarkon-twin-shell`).

## Rendering
Empty-shell Cycles bake (irradiance only) + realtime dynamic layer (probe IBL, matched sun with shadow, per-item contact AO decals, N8AO on desktop). Adaptive quality tiers. See MASTER_PLAN section 8.

## Feature flag
`lib/studio/flags.ts`: `STUDIO_ENABLED` env + role allowlist. Nothing under `/studio` is reachable without it.
