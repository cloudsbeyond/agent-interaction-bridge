# SOP: Agentic Interaction Change

Status: target SOP
Date: 2026-05-29
Applies to: product-facing interaction, presentation, multimodal, memory, and
channel-delivery changes

This SOP is part of the repo's agent devops system. It tells the Build Agent how
to change the product without collapsing the product architecture into keyword
patches, carrier-specific fixes, or renderer-only hotfixes.

## Goal

When a user reports poor interaction quality or requests a new channel/product
capability, classify and solve it against the product contracts in
`architecture/` before changing implementation artifacts.

## Step 0: Justify Bridge Mediation

Before changing code, decide whether the problem belongs to the bridge domain or
the execution endpoint.

Use bridge mediation when the problem involves:

- human-channel interpretation
- surface or device differences
- multimodal perception
- memory, preference, or prior feedback
- presentation shape, density, or artifact generation
- carrier delivery quality
- cross-endpoint compatibility
- auditability of human-facing decisions

Keep the work inside the execution endpoint boundary when the problem is purely
about task reasoning, tool use, code edits, command execution, or workspace
state under an endpoint profile.

Do not add bridge behavior merely to decorate endpoint output. Add it when the
interaction needs perception, expression, memory, policy, or delivery control
that execution endpoints should not own.

## Non-goals

- Do not start with a renderer hotfix.
- Do not add case-specific keyword branches.
- Do not treat helper models as execution endpoints.
- Do not let bridge helper models approve risk, choose tools, mutate cwd,
  change sessions, or override endpoint configuration.

## Required Inputs

- User request or incident feedback.
- Actual delivered output, when available.
- Surface and channel facts.
- Current endpoint result, when relevant.
- Existing decision evidence or logs, when available.
- Resource and capability state.
- State boundary for every service or resource touched:
  `stateless`, `bounded-state`, `durable-state`, or
  `external-provider-state`.
- Matching product contract path or contract id under `architecture/`.

## Step 1: Reconstruct The Interaction

Capture:

- human input
- quoted context
- attachments
- surface and device
- endpoint used
- presentation mode
- rendered output
- user feedback

Do not decide the fix until the failed product layer is known.

## Step 2: Classify The Product Layer

Choose the smallest failing product layer:

| Symptom | Likely layer |
| --- | --- |
| User meaning misunderstood | conversational interpretation |
| Screenshot, file, or voice ignored | perception |
| Same task should look different on device | surface context |
| Correct content, wrong structure | expression planning |
| Correct structure, wrong layout/density | presentation planning |
| Correct plan, broken Feishu/Web/voice output | carrier delivery |
| Wrong tool/session/cwd/risk behavior | endpoint profile or policy |
| Failure repeats because system forgets feedback | evidence log or memory |

If the issue spans multiple layers, fix the upstream layer first. Link the
classification to an `architecture/contracts/*.yaml` record when preserving the
change.

## Step 3: Decide Whether Cognition Is Needed

Use deterministic logic when the rule is hard, stable, and policy-like.

Use a model capability when the step requires:

- semantic understanding
- summarization
- multimodal perception
- expression planning
- similarity retrieval
- artifact generation
- quality evaluation
- natural-language feedback interpretation

Model use is expected when it materially improves product behavior. Avoiding
models by habit is a design failure for this project.

## Step 4: Mark State Before Planning

Before choosing a design, mark every touched service and resource:

| Question | Expected answer |
| --- | --- |
| Does this component keep memory across calls? | `stateless` or state class |
| If stateful, who owns the state? | bridge runtime, carrier, endpoint profile, provider, or human |
| What is the state key? | turn id, message id, session id, profile id, artifact id, or resource id |
| How long does it live? | one call, retry window, session, runtime lifetime, durable |
| Can execution endpoints see it? | no by default |
| Can helper models write it? | only through typed bridge services |
| Is it committed to git? | never for runtime state |

Default classifications:

- model helper calls are `stateless` from the bridge contract perspective
- carrier send/update tracking is `bounded-state`
- app-server pools and Codex sessions are endpoint-profile state
- decision logs, artifact stores, vector memory, config, and secrets are
  `durable-state`
- provider-side logs or model memory are `external-provider-state` and must not
  be trusted for bridge correctness

If a change introduces a new stateful service or resource, update the matching
product architecture table before implementation.

## Step 5: Require Typed Helper Output

Helper models must return typed proposals or typed artifacts, not direct side
effects.

Minimum proposal shape:

```json
{
  "proposalType": "expression_profile",
  "schemaVersion": "1",
  "confidence": 0.82,
  "evidence": ["user asked for a report", "desktop Feishu supports cards"],
  "recommendedAction": "project_progress_report",
  "rejectedAlternatives": ["plain_markdown"],
  "policyNotes": ["presentation only; no endpoint authority change"]
}
```

Reject helper output that attempts to:

- execute a task
- approve a risk
- change endpoint config
- mutate session scope
- inspect or reveal secrets
- bypass human-owned authority

## Step 6: Preserve Execution Boundary

Only delegate to an execution endpoint when the user request requires endpoint
work.

Before dispatch:

- resolve endpoint profile
- check risk tags
- check approval state
- lock cwd/session scope
- keep helper model config out of endpoint authority

Bridge helper capabilities may prepare context or presentation, but they must
not become execution tools.

## Step 7: Render Through Carrier

Carrier rendering should be a pure lowering step from a channel-neutral plan to
the target transport.

Carrier code may adapt to Feishu, Web, CLI, voice, or file transport. It must
not reinterpret user intent or change execution policy.

## Step 8: Record Evidence

Record at least:

- product layer classification
- capabilities used
- typed proposals
- accepted/rejected alternatives
- presentation plan
- delivery result
- user feedback

Evidence is required for repeated quality failures and future learning.

## Step 9: Test The Behavior

Every change should include tests at the highest stable layer.

Preferred test order:

1. product-layer transition test
2. typed proposal parse/validation test
3. presentation planning test
4. carrier rendering test
5. real channel smoke test

Avoid tests that only assert a keyword maps to a template unless the keyword is
a documented command.

## Step 10: Acceptance Gate

A change is acceptable only if:

- it solves the product layer that failed
- it avoids case-specific hotfixing
- it uses model capability where cognition is needed
- it preserves endpoint authority
- it records or enables durable evidence
- it degrades safely when a resource is missing
- it has a reusable test or contract

## Example: Report Looked Like A Blob

Wrong fix:

```text
if text includes an exact report title from one incident, force one card layout
```

Correct fix:

```text
Classify the request against the product architecture.
Use surface capability and expression needs to choose a structured presentation.
Keep endpoint judgment unchanged.
Record the presentation decision and feedback.
```

## Refactor Entry Points

When applying this SOP to the current codebase, prefer this sequence:

1. Add product ontology types without changing behavior.
2. Move visual expression choices into expression planning.
3. Add surface context derivation.
4. Add capability cataloging above resource availability.
5. Convert helper model calls to typed proposals.
6. Add decision evidence for presentation choices.
7. Rewrite Feishu card selection as carrier lowering.

## Review Questions

- Which product contract owns this change?
- Is this a cognition problem or a deterministic policy problem?
- What model capability is appropriate, if any?
- What typed proposal does the model return?
- Which policy validates it?
- Which surface constraints affect expression?
- What is the safe fallback?
- What evidence will future agents inspect?
