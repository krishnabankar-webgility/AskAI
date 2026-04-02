# Customization workflow skill

Use this skill for **customer-specific customization** tasks in this repository. Load **`dev-customization-expertise.md`** first for rules and architecture discipline; this file focuses on **workflow patterns**.

## Intent parsing

- Extract explicit **must-haves** (API, payload fields, UI location, profile gating).
- Detect implied constraints (**minimum change**, reuse existing flow, non-impact behavior).
- Confirm **manual vs scheduler** expectations from the latest user clarification.

## Implementation pattern

- Add or extend **constants and enums** only when required by the existing flow.
- Wire **UI control visibility** to customization node + `profileID`.
- Keep **button / manual actions** in existing user control/controller paths.
- **Reuse** existing sync endpoint and **DTO contract**.
- Restrict request item list to **existing mapped/matched** item logic.

## Safety pattern

- **Preserve** original state values after temporary overrides.
- **Avoid global side effects** when setting sync mode or filters.
- Return **informative user messages** for empty-result sync operations.

## Observability pattern

- Log **start/end** with profile id and total records.
- Log **skip reasons** (no mapped/matched items, missing data).
- Log and **bubble exceptions** with context.
