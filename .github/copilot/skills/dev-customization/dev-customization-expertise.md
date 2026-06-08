# Skill: Dev Customization Expertise

## Purpose

Define the non-negotiable engineering standards for implementing customer customizations safely and consistently.

## Architecture-first checklist

Before coding, confirm:

1. Business goal and expected end state are clear.
2. Source-to-target data path is identified end to end.
3. Exact extension points are identified in current code.
4. Existing customization patterns are reviewed and reusable.
5. Scope boundaries are explicit (what changes vs. what must remain untouched).

## Core implementation rules

1. **Gate all customization logic** with explicit customization configuration and profile/customer checks.
2. **Keep shared flows clean**: no direct inline customization logic in general paths.
3. **Use modular structure**:
   - customization condition at call site
   - dedicated helper method call
   - business logic isolated in helper method(s)
4. **Prefer existing pipelines** over introducing new parallel flows.
5. **Minimize surface area**: only change code required for the approved customization scope.

## Safety rules

1. Validate current branch and upstream tracking before any change.
2. Keep work on feature/customization branch only; never merge directly to protected branches.
3. Avoid unrelated refactors while implementing customization work.
4. Do not scatter ticket links or customer-specific identifiers across unrelated files.

## Observability and verification

1. Verify both phases where applicable:
   - data capture/storage phase
   - downstream assignment/consumption phase
2. Use existing logging and diagnostics patterns; do not add noisy ad hoc logging.
3. Validate behavior with targeted checks and existing test/build commands.

## Completion checklist

- [ ] Requirement intent validated and scope locked
- [ ] Plan approved before code changes
- [ ] Customization logic fully gated
- [ ] Shared flow untouched outside gated call sites
- [ ] All impacted transaction/use-case paths covered
- [ ] Build/test passes for repository standards
- [ ] Final summary includes technical changes, validation done, QA notes, and rollback guidance

## Output expectations

In completion summaries, provide three levels:

1. **Business summary** (what user-visible result changed)
2. **Technical summary** (which modules/methods changed and why)
3. **Verification summary** (what was validated and outcomes)
