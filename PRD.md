# Agent-Interaction-Bridge PRD

`PRD.md` is the fixed formal L0 projection of the product narrative in `README.md`
for Agent-Interaction-Bridge. Together they define product intent before
architecture contracts, agent-devops indexes, runtime objects, CLI commands,
carrier adapters, or channel rendering code are changed.

It is intentionally thin. It does not replace the human-facing product
narrative, and it is not a fragmented spec set, development process record, or
implementation checklist.

## L0 Problem

Local execution agents can act with broad authority, while human surfaces such
as Feishu/Lark carry identity, context, attachments, approvals, and delivery
constraints. Agent-Interaction-Bridge needs to mediate between those worlds
without collapsing channel transport, interaction interpretation,
presentation, delivery, runtime resources, and execution authority into one
opaque gateway.

## P0 Scope

P0 is a local-first bounded interaction bridge:

- Human surface intake over the current Feishu/Lark path.
- Bridge domain-agent objects for turn facts, surface context, perception,
  intent, expression, presentation, delivery, tasks, signals, and action logs.
- Execution-agent handoff to Codex exec or app-server endpoints.
- Gateway modes: `relay` and `adapter`.
- Runtime Services as the external support plane for helper resources, storage,
  sessions, artifacts, vectors, and resource status.
- Explicit authority boundaries for profiles, credentials, approvals,
  publishing, and endpoint execution.

## Non-Goals

- Do not use scattered specs or agent-devops notes as product drivers.
- Do not let architecture YAML records redefine L0 product intent.
- Do not make bridge helper models choose tools, approve risk, change endpoint
  profiles, or override execution-agent authority.
- Do not move provider, model, storage, vector, artifact, or generic Runtime
  Services implementations back into this repo.
- Do not make `agent-devops/` a runtime dependency.

## Downstream Chain

Formal development flows from the co-equal README product narrative and PRD L0
assets into product and devops assets:

```text
README.md / PRD.md
  -> architecture/README.md
  -> architecture/agentic-ontology.md + architecture/system-design.md
  -> architecture/contracts/*.yaml
  -> agent-devops/ai-contract-index.md + harness checks
  -> TypeScript runtime, CLI, carrier and presentation code
  -> package / validation evidence
```

`agent-devops/` may index product contracts and harness evidence, but it does
not own product intent and must not become the product runtime source.

## Owner Boundary

Human owner or architect owns L0-L2 product intent, object boundaries, authority
rules, and contract freeze. Agents and engineers own L3-L4 implementation under
that frozen boundary.

Return to README / PRD or architecture review when a change would alter product
scope, execution authority, profile semantics, approval rules, resource
ownership, or state durability.
