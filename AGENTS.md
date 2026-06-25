# Agent Operating Contract

```text
mission: local-first bounded interaction agent
core: human surface -> bridge domain agent -> execution agent -> surface-aware delivery
current_path: Feishu/Lark -> bridge domain agent -> local Codex execution endpoint
future_paths: Mac, Web, CLI, voice, A2A, remote execution endpoints
authority_boundary: humans own identity, credentials, publishing, and exposure
```

## Repo Map

- Product overview, installation, operator commands, and open-source usage live
  in [README.md](./README.md).
- Product runtime architecture, ontology, system design, and product contracts
  live in [architecture/](./architecture/).
- Agent development process, repo governance, contract indexing, drift checks,
  and replay harness guidance live in [agent-devops/](./agent-devops/).
- Runtime config and local state belong outside git.

The product runtime must not import, load, or require `agent-devops/`. The
devops area may index product contracts, source files, and harness commands as
development evidence.

## Freeze Layer

Treat root `AGENTS.md`, root `README.md`, `architecture/README.md`, and
`agent-devops/README.md` as the first documentation layer to keep mutually
consistent.

- `AGENTS.md` routes agents and records repo-wide operating constraints.
- `README.md` is the product and open-source usage entrypoint.
- `architecture/README.md` is the product architecture entrypoint.
- `agent-devops/README.md` is the AI-native build governance and harness
  entrypoint.

Do not put complex architecture diagrams in this first layer. If a diagram
needs nested subgraphs or mixes product runtime with devops governance, split it
into smaller diagrams in the relevant deeper document.

## Product Invariants

- Agent-Interaction-Bridge is a bounded domain agent, not a passive gateway with
  AI API calls.
- Gateway behavior has two modes only: `relay` and `adapter`.
- `relay` preserves channel duties such as credentials, access control,
  allowed chats, mention policy, queueing, session/cwd, endpoint profile,
  explicit approvals, attachments, quoted context, stream rendering, and channel
  delivery. It must not run complex intent classification, helper-model
  judgment, interaction protocol injection, Dynamic UI routing, presentation
  hints, or delivery support enrichment.
- `adapter` keeps the same channel duties and may add bounded interaction
  assistance such as intent classification, HITL guidance, presentation hints,
  and Runtime Services helper resources. If adapter resources are unavailable,
  the runtime must degrade the current session to `relay` and notify the
  channel.
- Runtime processing starts from ontology objects: `HumanTurn`,
  `SurfaceContext`, `PerceptionResult`, `InteractionIntent`,
  `ExpressionProfile`, `TypedProposal`, `PresentationPlan`, `DeliveryPlan`,
  `AgentTask`, `AgentSignal`, and `ActionLog`.
- `AgentSignal` is semantic truth, not provider payload.
- `InteractionIntent` is conversational-act interpretation, not channel payload,
  Dynamic UI routing, presentation layout, or execution authority.
- `ExpressionProfile` owns the semantic expression shape such as report,
  comparison, architecture, dashboard, watch summary, or voice reply.
- `PresentationPlan` is channel-neutral display intent.
- `Carrier` is channel protocol.
- `DeliveryPlan` maps a `PresentationPlan` and `SurfaceContext` to a carrier
  payload.
- `InteractionTurnPlan` is the channel-neutral prompt plan for one human turn.
- `CapabilityCatalog` records bridge cognitive capabilities such as language,
  vision, audio, embedding, vector search, expression transform, image
  generation, voice generation, quality evaluation, and execution delegation.
- `ResourceCatalog` is supplied by external Runtime Services and records
  required compute, storage, and model resources; missing resources must remain
  explicit stubs or `missing_resource` results, not hidden assumptions.
- Model resources in Runtime Services are bridge helper resources. They may
  support perception, intent support, expression planning, presentation
  transforms, embeddings, indexing, quality evaluation, and visual artifact
  generation; they must not be exposed, advertised, or treated as execution
  endpoint capabilities.
- Provider-specific code belongs at entity and adapter boundaries.
- Provider, model, artifact, vector, content-index, and generic Runtime Services
  secret-resolver implementations belong in `agent-runtime-services`, not in
  bridge product runtime modules.
- The execution endpoint owns task reasoning and risk judgment; helper models
  may only support bridge-internal, stateless, authority-free processing.
- Model calls are allowed in both endpoint and bridge-internal processing
  layers, but endpoint models decide and execute work while bridge helper
  models must not choose tools, approve risk, change cwd/session/profile,
  invoke shell/filesystem/network actions, or override endpoint model/config/env.
- Helper models return typed proposals or typed artifacts. Policy and
  deterministic planners decide whether proposals are accepted.
- Every service or resource touched by interaction work must declare one state
  class: `stateless`, `bounded-state`, `durable-state`, or
  `external-provider-state`.
- Agents do not share raw resources, sessions, stores, or provider handles.
  Runtime Services are the support plane for base capabilities, and access
  across agent boundaries must be typed and policy-governed.
- Expression/delivery helper support may return a missing-resource result. Do
  not fake rich HTML, image, voice, storage, or remote compute when the catalog
  says the resource is only stubbed.
- Feishu/Lark normal delivery may automatically call expression/delivery support
  for HTML/image/file-style artifacts. It must fail open to the original
  rendered message and must not change task judgment, endpoint selection,
  approval state, cwd/session/profile, or endpoint runtime environment.
- Dynamic UI belongs in `ExpressionProfile` and `PresentationPlan`; do not add
  new visual routing semantics to `InteractionIntent`.
- Endpoint profiles are authority boundaries. A guest or team profile must not
  inherit the owner's Codex home, filesystem reach, shell reach, network reach,
  or publishing authority by accident.
- Runtime handoff must apply endpoint profile policy before session lookup,
  approval persistence, or agent execution.
- Conversation scope is task state. Topic-style scopes should isolate session,
  cwd, pending queue, and signal timeline.
- `exec` and `app-server` are endpoint implementations behind the same agent
  boundary. Keep the exec path as fallback when app-server protocol behavior
  changes.
- LaunchAgent is a macOS runtime adapter, not a generic architecture primitive.
- External project references belong in README References. Fold adopted ideas
  into project capabilities, contracts, or roadmap instead of creating
  reference-specific done/todo sections.

## Change Routing

Read [architecture/](./architecture/) before changing framework boundaries,
adding a channel, adding an execution endpoint, or wiring model/storage/compute
resources. Use [architecture/agentic-ontology.md](./architecture/agentic-ontology.md)
as the target product architecture for bounded domain-agent behavior.

Read [agent-devops/](./agent-devops/) before changing repo governance, durable
contract indexing, drift checks, replay evidence, or agent-maintained harness
policy.

Runtime Services are the support plane for profiles, resources, ActionLog,
artifacts, vectors, sessions, and other state stores. Keep them out of runtime
flow diagrams unless the change is specifically about a service contract.
Bridge consumes Runtime Services through `src/runtime-services/port.ts` and
`src/runtime-services/selector.ts`; business code depends only on
`RuntimeServicesPort`. The local adapter calls JSON-RPC `/rpc` only
(`AGENT_RUNTIME_SERVICES_URL`, then `http://127.0.0.1:8765`). Tests may inject a
mock `RuntimeServicesPort`, but production code must not create an in-process
Runtime Services instance.

Runtime Services context initialization must run `GET /health`, then JSON-RPC
`version`, `capabilities.describe`, and `resources.status` before normal typed
capability calls such as `language.complete`, `artifact.save`, `record.*`, or
`vector.*`.

Do not reintroduce provider, artifact, vector, content-index, model smoke, or
model-provider config implementation under bridge `src/`.

## Project Roadmap

- Current iteration priority is product/user-visible Feishu/Lark delivery.
  Pause further project self-management and resource-management expansion
  unless the user explicitly asks for it.
- Keep endpoint profiles as the authority boundary for host, guest, team, and
  remote execution.
- Keep app-server pool reuse inside one endpoint profile only. Pool reuse is a
  runtime-service optimization, not cross-agent session sharing.
- Add thread, fork, side, queue, steer, and compact workflows so one topic or
  fork can map to one agent work unit.
- Improve installer, doctor checks, service logs, and recovery UX for local
  operators.
- Harden the bridge Runtime Services adapter for language, vision, audio,
  embedding, vector search, expression transform, image generation, voice
  generation, quality evaluation, artifact storage, vector memory, ActionLog,
  and remote execution sandbox without moving those base implementations back
  into this repo. Runtime Services storage remains support state, not execution
  endpoint memory.

## Loop

Classify the ontology object, capability, state class, and authority boundary.
Read nearby code, keep generic runtime code provider-neutral, test boundary
changes, then report exactly what passed.

## Interaction Quality Debugging

When a user challenges output quality, first reconstruct the incident from
logs, session state, cwd, endpoint, reply mode, and the actual rendered output.
Do not treat feedback like "too dense", "unclear", or "looks like a blob" as a
generic task retry.

Diagnose the failing ontology object:

- `SurfaceContext`: wrong channel, device, density budget, or capability.
- `PerceptionResult`: attachment, screenshot, audio, or visual content ignored.
- `InteractionIntent`: conversational act or feedback meaning misunderstood.
- `ExpressionProfile`: content type, Dynamic UI, report, comparison, watch, or
  voice expression chosen incorrectly.
- `PresentationPlan`: content correct but too dense, too long, or shaped for the
  wrong surface.
- `DeliveryPlan` or `Carrier`: Markdown/card/file/voice transport loses
  structure or cannot express the intended display.
- `AgentTask` or execution endpoint: reasoning, tool choice, cwd, session,
  approval, or endpoint profile behavior is wrong.
- `ActionLog` or memory: repeated failure is not retained as usable evidence.

General fix order: reconstruct the incident, justify bridge mediation, classify
the ontology object, mark state, use model capability when cognition is needed,
preserve execution-agent authority, generate typed proposals, plan presentation
from surface, then adjust carrier rendering only if lowering still fails.

## Commands

Setup: `pnpm install`
Validate: `pnpm public-safety-check`, `pnpm test`, `pnpm typecheck`,
`pnpm build`, `npm pack --dry-run`, `agent-interaction-bridge architecture check`,
`agent-interaction-bridge architecture contracts`
Run: `node ./dist/cli.js start`
Local install: `npm install -g .` then `agent-interaction-bridge start`
macOS service: `agent-interaction-bridge service install launchd --agent-endpoint app-server`
Resource gaps: `agent-interaction-bridge resources`
Runtime Services sibling package: `../agent-runtime-services`
Storage proxy: `agent-interaction-bridge storage status`,
`agent-interaction-bridge storage artifacts list`,
`agent-interaction-bridge storage vectors search <text>`
Doctor: `agent-interaction-bridge doctor`
Architecture gate: `agent-interaction-bridge architecture check`

`npm i -g agent-interaction-bridge` only works after an npm release.

Before start, verify Codex with `codex login`, then
`codex exec --json --skip-git-repo-check 'reply only: pong'`. First bridge
start requires human Feishu/Lark binding and App Secret handling.

## Human Handoff

Stop before QR login, app binding, App Secret entry, credential changes, secret
inspection, repository visibility changes, branch protection changes,
force-pushes, npm publishing, deploys, or remote endpoint exposure.

## Runtime Data

Never commit runtime state: `~/.agent-interaction-bridge/`, real
`config.json`, `secrets.enc`, sessions, workspaces, process registries, media,
or logs.

Use `config.example.json` only as a shape reference. Runtime config belongs to
the local operator, not the repository.

## Review Lens

Smoke test after human-owned Feishu/Lark binding: `/status`, `reply only:
pong`, `/visual summarize architecture briefly`, `/approve run git status and
summarize it`.

Reject changes that mix ontology objects with provider payloads, expression
planning with carrier transport, credentials with git, bridge helper
capabilities with execution endpoint authority, or risky actions without HITL.
