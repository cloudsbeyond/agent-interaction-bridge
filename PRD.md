# Agent-Interaction-Bridge PRD

`PRD.md` is the fixed formal L0 projection of the product narrative in `README.md`
for Agent-Interaction-Bridge. Together they define product intent before
architecture contracts, agent-devops indexes, runtime objects, CLI commands,
carrier adapters, or channel rendering code are changed.

It is intentionally thin. It does not replace the human-facing product
narrative, and it is not a fragmented spec set, development process record, or
implementation checklist.

## L0 Problem

Local domain agents can act with broad authority, while human surfaces such
as Feishu/Lark carry identity, context, attachments, approvals, and delivery
constraints. Agent-Interaction-Bridge needs to mediate between those worlds
without collapsing channel transport, interaction interpretation,
presentation, delivery, runtime resources, and execution authority into one
opaque gateway.

The bridge must also mediate domain-agent-initiated interaction. A proactive
message and the human reply to it need the same policy, delivery, audit, and
session-continuity guarantees as a human-initiated task.

## P0 Scope

P0 is a local-first bounded interaction bridge agent:

- Human surface intake over the current Feishu/Lark path.
- Bridge-agent objects for turn facts, surface context, perception, intent,
  expression, presentation, delivery, prompts, tasks, signals, and action logs.
- Domain-agent handoff to Codex through exec or app-server endpoints.
- One normalized, gateway-mode-separated Domain Agent prompt envelope per human
  turn. It keeps the original user task distinct from Bridge protocol and
  carrier facts, while retaining user-authored formatting.
- Human-selected discovery and binding of an existing idle Codex thread through
  the active endpoint profile, so a Feishu/Lark scope can continue saved local
  work without copying endpoint session files into Bridge state. The discovery
  list prefers endpoint `thread.name`, then `thread.preview`, then `(空会话)`.
  It removes Bridge-owned prompt envelopes from endpoint metadata and limits
  each task preview to 200 Unicode characters without loading conversation turns
  or invoking a helper model.
- Domain-agent-initiated outbound interaction through bridge policy,
  presentation, carrier delivery, and ActionLog.
- Correlation from outbound intent to carrier message, conversation scope, and
  originating domain-agent session so human replies resume the same task, with
  distinct audit evidence for reply matching, one-time consumption, and endpoint
  resume success or failure.
- A compact presentation-only footer on every normal Feishu/Lark reply showing
  the current Bridge scope and Domain session/thread reference. Bridge scope
  displays its final 8 characters and Domain session/thread displays its first
  8 characters; shorter values remain unchanged and no ellipsis is added. When
  task timing is available, the footer appends compact elapsed time on one
  `Session：📥 - <id> | 🤖 - <id> | ⏳ - <duration>` line, where 📥 represents
  Bridge scope, 🤖 the Domain Agent thread, and ⏳ elapsed task time. Replies
  without task timing omit that segment. Markdown and card carriers use quote
  styling; plain-text carriers omit quote syntax.
- Gateway modes: `relay` and `adapter`. A pending approval freezes the effective
  mode and prompt context version; a mismatch is stale and must fail closed.
- Runtime Services as the external support plane for helper resources, storage,
  sessions, artifacts, vectors, and resource status.
- Explicit authority boundaries for profiles, credentials, approvals,
  publishing, and endpoint execution.

## Non-Goals

- Do not use scattered specs or agent-devops notes as product drivers.
- Do not let architecture YAML records redefine L0 product intent.
- Do not make bridge helper models choose tools, approve risk, change endpoint
  profiles, or override domain-agent authority.
- Do not let a domain agent bypass the bridge for normal human interaction or
  take long-term ownership of carrier credentials and delivery state.
- Keep direct domain-agent-to-carrier calls only as bootstrap, diagnostic, or
  fault-degradation paths, not the formal P0 interaction path.
- Do not move provider, model, storage, vector, artifact, or generic Runtime
  Services implementations back into this repo.
- Do not make `agent-devops/` a runtime dependency.
- Do not add ACP, A2A, public proactive ingress, or a Codex plugin/skill
  transport in P0. Future adapters may reuse AgentSignal without taking Bridge
  carrier authority.
- Do not promise live Codex Desktop co-control, cross-process turn steering, or
  concurrent writes to one thread in P0. Active threads must not be bound.

## Downstream Chain

Formal development flows from the co-equal README product narrative and PRD L0
assets into product and devops assets:

```text
README.md / PRD.md
  -> architecture/README.md
  -> architecture/agentic-ontology.md + architecture/system-design.md
  -> architecture/contracts/*.yaml
  -> src/ + bin/ + package metadata
  -> tests + public-safety + architecture checks + package evidence
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
