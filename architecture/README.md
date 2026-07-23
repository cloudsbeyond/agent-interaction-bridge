# Architecture

This directory is the product and system architecture source for
Agent-Interaction-Bridge. It describes the runtime objects, channel boundaries,
domain-agent endpoint boundaries, Runtime Services boundary, and product-facing
contracts that are useful to open-source users and contributors.

The product L0 assets are [../README.md](../README.md) and
[../PRD.md](../PRD.md). Architecture contracts in this directory are downstream
L1/L2 assets and must not redefine product intent.

## Files

- [agentic-ontology.md](./agentic-ontology.md): target product ontology for
  treating the bridge as a bounded bridge agent between humans and domain agents
  with explicit runtime objects, capability boundaries, typed proposals,
  prompt-envelope ownership, and action logs.
- [system-design.md](./system-design.md): target system design for the current
  bidirectional Feishu/Lark and Codex path, gateway modes, proactive delivery
  correlation and resume audit, compact reply identity observability, canonical
  prompt rendering, runtime object flow, endpoint profile boundaries, and Runtime
  Services integration.
- [contracts/*.yaml](./contracts/): executable product architecture contract
  records for public API, carrier intake, presentation rendering, HITL,
  endpoint policy, runtime data, operator commands, and resource architecture.

## Maintenance Rule

README should stay a product overview. This directory owns framework design
details and layer-level product contracts.

When code changes cross a runtime layer boundary, update the matching product
contract here in the same change. Interaction, presentation, multimodal, memory,
and carrier changes must classify the runtime object, capability, and state
boundary they touch. If a needed model, storage, or compute resource does not
exist yet, represent it through the external Runtime Services
`ResourceCatalog`/`missing_resource` contract rather than hiding the assumption
or rebuilding provider code in bridge.

Keep provider payloads, carrier transport, endpoint authority, helper-model
resources, and runtime state as separate product boundaries. Product runtime
docs should not mix in the repository's agent development workflow; that lives
under [agent-devops/](../agent-devops/) as a separate top-level part of the
repo.

Keep architecture diagrams layered. A diagram in this directory should express
one concern at a time: runtime path, gateway mode, object interpretation,
delivery, execution, or evidence. If a diagram needs nested subgraphs or mixes
multiple concerns, split it into several small diagrams with explicit layer
titles. A delivery plan always lowers to a Carrier; diagrams must not show it as
a payload sent directly to a human.

Run `agent-interaction-bridge architecture check` after product architecture or
contract changes to verify the registry and path references.
