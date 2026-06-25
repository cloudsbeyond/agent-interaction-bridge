# SOP: Channel Formatting And Adaptation

Status: target SOP
Date: 2026-06-17
Applies to: channel formatting, carrier lowering, final-answer delivery,
stream rendering, reply templates, and future channel adaptation work

This SOP is part of the repo's Agent DevOps system. It records reusable
patterns and anti-patterns from recent formatting and adapter fixes so future
channels can be added without accumulating one-channel hotfixes.

## Goal

When a reply looks correct at the execution endpoint but degraded in a human
surface, fix the responsible product boundary:

```text
AgentSignal or endpoint final text
  -> PresentationPlan
  -> DeliveryPlan
  -> Carrier lowering
  -> channel send/update payload
```

Do not let carrier details leak back into task reasoning, endpoint authority,
or business-specific text patches.

## Good Patterns

### Keep Delivery Timing Separate From Carrier Shape

A channel decision has at least two independent concerns:

- timing: progress stream, status update, final once, or retry
- carrier: text, markdown post, card, image, file, voice, or app surface

Do not encode these as one overloaded switch. A streaming card can be useful for
progress, while a single final markdown post may be safer for readable final
answers on the same channel.

### Treat Streaming As Progress, Not The Canonical Final Answer

Streaming delivery should optimize live feedback and status visibility. The
canonical final answer should still have a stable final-render path that can be
replayed locally and compared against the channel payload.

For dense human-facing answers, prefer final-once delivery unless the channel
has a proven stream renderer that preserves paragraph, list, table, link, and
code block boundaries.

### Preserve Replay Evidence

For every channel formatting bug, capture enough local evidence to reproduce
the failure without re-running the execution endpoint:

- raw endpoint or `AgentSignal` text
- rendered text after product presentation
- lowered carrier payload
- send/update mode
- channel, message id, and reply mode when available

Replay evidence is not a user-facing product artifact. It is a local harness
asset for debugging `PresentationPlan`, `DeliveryPlan`, and carrier lowering.

### Fix At The Lowest Responsible Boundary

Use this order:

1. If the endpoint answer is wrong, fix endpoint task reasoning or prompt
   context.
2. If the content is right but the structure is wrong, fix
   `ExpressionProfile` or `PresentationPlan`.
3. If the structure is right but the channel loses boundaries, fix
   `DeliveryPlan` or carrier lowering.
4. If the channel send/update timing causes readability loss, fix reply mode or
   delivery timing policy.

Carrier code may preserve line breaks, escape text, split payloads, or choose a
transport representation. It must not reinterpret user intent, change task
judgment, or approve execution risk.

### Inject Known Channel Templates At Prompt Boundaries

When the source channel is known and reliable public carrier facts exist, pass a
small response template into the prompt plan. The template should describe
surface constraints and readable output shape.

When the channel is unknown:

- `adapter` mode may call Runtime Services helper resources for presentation
  support, if available.
- `relay` mode should inject only a plain-text response template and leave
  complex interaction assistance disabled.

Templates guide expression; carrier lowering still owns protocol-specific
payload correctness.

### Keep Provider Code At Carrier Boundaries

Provider-specific formatting belongs in provider carrier modules, renderers, or
surface-template facts. Product ontology, endpoint profiles, approval policy,
session selection, and runtime services selection should stay provider-neutral.

### Test The Failure Shape

Write tests against the actual failure class:

- markdown paragraphs and list items remain separated
- links do not merge into surrounding text
- code fences remain intact
- card text escapes only the carrier-required characters
- final delivery stores replay evidence
- stream delivery does not become the only final-answer path

Avoid snapshot tests that only prove one incident string still looks good.

## Anti-Patterns

### Business-Text Hotfixes

Wrong:

```text
if answer contains "stock snapshot" or a specific report title, insert newlines
```

Correct:

```text
preserve markdown block boundaries for all final answers lowered into this
carrier
```

### One Enum For Mode, Carrier, And Timing

Wrong:

```text
messageReply = markdown means stream a markdown card and also decides final
answer formatting
```

Correct:

```text
reply timing policy decides stream vs final once
carrier lowering decides markdown/card/text payload shape
```

### Debugging From A Pasted Channel Blob

A pasted broken message is a symptom, not enough evidence. Reconstruct the
actual raw text, rendered text, and lowered payload before choosing a fix.

### Prompt-Only Formatting Fixes

Prompt templates can improve the endpoint's output shape, but they cannot
guarantee channel protocol behavior. If the channel transport collapses
paragraphs or links, fix carrier lowering and add a local replay test.

### Renderer-Only Fixes For Product-Layer Problems

Do not make a renderer compensate for wrong intent classification, wrong
expression profile, missing surface context, or failed resource checks.
Classify the product layer first.

### Carrying Deprecated IDs For Compatibility Without A Contract

Do not keep old resource ids, protocol ids, or carrier ids unless a frozen
contract requires a transition window. If the contract says there is no legacy
runtime, remove the old id and update tests to the current source of truth.

### Letting Helper Models Cross Authority Boundaries

Helper models may propose expression, presentation, or artifact support. They
must not select endpoint profile, change cwd/session, approve risk, choose
tools, or override execution endpoint configuration.

## New Channel Checklist

Before adding a new channel:

1. Declare the channel's carrier facts: supported text shape, markdown dialect,
   card surface, image/file/voice support, streaming behavior, quote behavior,
   and update/delete limits.
2. Add or reuse surface templates for prompt planning.
3. Add a carrier-lowering module or renderer with tests for paragraph, list,
   link, code block, and dense-answer behavior.
4. Decide default reply timing separately from carrier shape.
5. Add replay evidence for final-answer delivery.
6. Update the matching contract index row and harness evidence.
7. Smoke test with one short answer, one dense answer, one quoted reply, and
   one failure/degrade path.

## Incident Review Checklist

Use this checklist when a user reports that channel output is unreadable:

1. Capture the exact channel output and current channel config.
2. Locate or create replay evidence with raw text, rendered text, and payload.
3. Classify the failure as `SurfaceContext`, `ExpressionProfile`,
   `PresentationPlan`, `DeliveryPlan`, or `Carrier`.
4. Prove the failing layer with a local fixture.
5. Fix the smallest responsible boundary.
6. Add a reusable test for the failure class.
7. Re-run targeted tests plus the relevant architecture check.
8. If runtime behavior changed, restart the local service and verify the
   operator-facing config.

## Acceptance Gate

A formatting or adaptation change is acceptable only if:

- product runtime code still does not depend on `agent-devops/`
- endpoint authority remains unchanged
- channel-specific code stays at the carrier or surface-template boundary
- default delivery is readable on the target surface
- replay evidence exists for future debugging
- no business-specific keyword branch was added
- contracts or the AI Contract Index point to the new evidence
