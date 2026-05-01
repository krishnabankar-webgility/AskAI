# dev-customization — prompt routing

Use for **implementation** of customer-specific desktop customizations: minimum diff, reuse sync/DTO/controller paths, profile + customization node gating, structured logging. **Jira URLs** belong only next to the matching const in `CustomizationConstant.cs`; gate customization work **at the call site** with `CustomizationNode.Contains` before helpers.

**Load first**

1. `.cursor/skill-library/dev-customization-expertise.skill.md`
2. `.cursor/skill-library/dev-customization-workflow.skill.md`

**Agent files:** `.cursor/agents/dev-customization.agent.md`, `.github/copilot/agents/dev-customization.agent.md`, `.github/agents/dev-customization.agent.md`

**Invoke in Cursor:** `/dev-customization` then your request.
