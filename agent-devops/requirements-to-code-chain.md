# Requirements To Code Chain

This is the durable development protocol for agent-maintained repository work.
It belongs to part 2 of the repository: AI-native build governance and harness.
Product runtime code must not load this file.

Product L0 intent lives in `../README.md` and the equivalent formal projection
in `../PRD.md`. This file is downstream governance for agent-maintained L3/L4
work and must not act as product authority.

Use it for code generation, generated artifact maintenance, SDK/DTO/index
generation, framework-boundary changes, package metadata gates, and replay
harness changes.

```text
L0 Problem Definition
  -> L1 Structured Expression
  -> L2 Formal Contract
  -> L3 Engineering Organization
  -> L4 Maintained Artifacts + AI Contract Index
```

## Durable Gate

Durable implementation may start or remain only when all conditions are true:

- `L0-L2 Status: frozen`
- `L3-L4 Mode: durable`
- `L2 Freeze Signal` exists
- `AI Contract Index` exists
- generation, contract, or replay harness evidence exists

If the gate fails, the agent may produce drafts, questions, review packets, or
contract-completion proposals, but must not preserve durable implementation.

## Ownership

- Human owner or architect owns L0-L2.
- Build Agent owns L3-L4 under a frozen upstream contract.
- Human corrections land first in L0-L2, harness assertions, or a local durable
  contract; the Build Agent then changes repository artifacts and records
  verification evidence.
- Humans do not hand-edit maintained implementation artifacts as a durable path.
  Durable changes happen by updating the contract or generator and replaying the
  work.

Repository implementation is agent-maintained by default. The relevant
distinction is the L4 maintenance mode:

- `contract-generated`: regenerated from L2 by a command.
- `contract-maintained`: edited by an agent under L1/L2 contracts, tests, and
  drift checks.
- `operator-owned runtime data`: local config, secrets, sessions, workspaces,
  logs, and process state outside git.

The Build Agent creates, revises, verifies, and records contracts, SOPs, tests,
implementation artifacts, and replay evidence. It must not appear as a product
runtime speaker, approver, carrier, endpoint profile, or execution authority.

## Product Change Preflight

For product-facing interaction, presentation, multimodal, memory, carrier, or
channel-delivery changes, run
[sops/agentic-interaction-change.md](./sops/agentic-interaction-change.md)
before durable implementation.

Minimum extra intake for those changes:

```text
Bridge Mediation Needed: yes/no
Product Contract: architecture/<path or contract id>
Product Layer: ontology | carrier | endpoint profile | provider | policy | storage | presentation | command
Capability: language | vision | audio | embedding | vector_search | expression_transform | image_generation | voice_generation | quality_evaluation | execution_endpoint | none
State Class: stateless | bounded-state | durable-state | external-provider-state
Typed Proposal Needed: yes/no
Action Evidence Needed: yes/no
Runtime Boundary: bridge | carrier | endpoint profile | provider | human
```

This preflight supplements L0-L4. It does not replace the durable gate.

## Task Tiers

| Tier | Typical Scope | Human Attention | Agent Behavior |
| --- | --- | --- | --- |
| `routine` | Small local fix, copy, low-risk test | Usually none | Implement, run tests, report |
| `scoped` | Module-local behavior, low-risk UI or CLI change | Async review if tagged | Create minimal test plan and evidence |
| `contracted` | API, schema, page structure, DTO, SDK, index, generated artifact | Required freeze | Execute L0-L4 |
| `critical` | Authority, security, irreversible action, persistence, payment, cross-repo boundary | Explicit approval | Produce a Human Review Packet before durable work |

Minimum intake:

```text
Task Tier:
Risk Tags:
Need Human Freeze: yes/no
Existing Contract:
Missing Context:
Proposed Next Step:
Stop Condition:
```

Risk tags include `schema`, `api`, `generated-artifact`,
`authority-changing`, `security`, `persistence`, `cross-repo`, `irreversible`,
`manual-review`, and `short-lived-code`.

## Layer Checklist

| Layer | Owner | Required Evidence |
| --- | --- | --- |
| `L0` | Human | `README.md` product narrative and `PRD.md` formal projection: goal, scenario, stable constraints, open questions |
| `L1` | Human | Reviewable DSL, Figma, flow, state model, or equivalent structure |
| `L2` | Human | YAML, OpenAPI, JSON Schema, registry, or equivalent contract |
| `L3` | Build Agent | AGENTS, PRD/contract links, skills, repo boundaries, commands, test plan |
| `L4` | Build Agent | Code, pages, DTOs, SDKs, indexes, docs, replay evidence, AI Contract Index links |

L3-L4 must return to L0-L2 when it finds an unimplementable contract, unstable
generated artifact, multi-repo conflict, missing resource, or business semantic
gap. Engineering code must not privately change business meaning.

## Human Review Packet

Use this packet for `critical` work, authority-changing tags, or unresolved
contract gaps:

```text
Decision Needed:
Risk Tags:
Contract Diff:
Key Invariants:
Uncovered Items:
Generated Artifact Diff:
Drift / Replay Result:
Stop Condition:
Build Agent Recommendation:
Required Human Action:
```

Allowed actions: `approve-freeze`, `request-clarification`,
`change-invariant`, `reject-risk`, `approve-durable-implementation`,
`approve-short-lived-code`.

## Canonical Preflight Fields

```text
L0 Problem Definition: <human-owned goal / scenario / constraints / open questions, normally summarized in README.md and PRD.md>
L1 Structured Expression: <DSL / Figma / flow / state model / equivalent>
L2 Contract Source: <YAML / OpenAPI / JSON Schema / registry / equivalent>
L2 Freeze Signal: <review / commit / version / accepted invariants / drift check>
L0-L2 Status: <draft | frozen>
L3 Engineering Carrier: <AGENTS / PRD and contract links / skill / repo boundary / commands>
L3-L4 Mode: <draft | durable>
L4 Maintained Artifacts: <code / page / DTO / SDK / index / docs>
AI Contract Index: <how L4 links back to L1/L2>
Owner Boundary: human owns L0-L2; Build Agent owns L3-L4 under frozen contract
Stop Condition: <what returns to human before durable implementation>
```

## Contract Record Minimum

YAML contract records must be executable enough for
`agent-interaction-bridge architecture check`.

The current registry schema uses `owner: agent`; in this project that owner is
the Build Agent described above.

```yaml
id: feature.example
tier: contracted
risk_tags: [schema, generated-artifact]
l0: { owner: human, status: frozen, problem: "" }
l1: { owner: human, status: frozen, expression: "", paths: [] }
l2:
  owner: human
  status: frozen
  path: ""
  freeze_signal: ""
  invariants: []
  generation_commands:
    - cwd: "."
      command: ""
      mode: check
      writes_workspace: false
      ci_required: true
  drift_checks: []
  generation_command: ""
  drift_check: ""
l3: { owner: agent, mode: durable, carriers: [], commands: [] }
l4:
  owner: agent
  artifacts: []
  ai_contract_index: agent-devops/ai-contract-index.md
  harness: []
  replay_evidence: []
  hand_edit_guard: ""
stop_condition: ""
```

`generation_command` and `drift_check` are compatibility summaries. Structured
`generation_commands` and `drift_checks` are the source for durable checks.

## Generation Lock

- Structure generation and drift commands; do not leave them as prose only.
- Link every L4 artifact to L1/L2 through `agent-devops/ai-contract-index.md`.
- Record replay evidence or an explicit reason replay is not applicable.
- Record a hand-edit guard for generated or contract-maintained artifacts.
- Map every L2 invariant to tests, harness cases, manual review items, or an
  explicit uncovered-risk entry.
- Fail the gate when a durable artifact lacks a contract source, replay
  evidence, or AI Contract Index row.
