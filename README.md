# n8n-nodes-osuite

OSuite governed action checkpoints for n8n workflows and AI agents.

This community node lets n8n workflow builders send consequential actions to OSuite before the action runs, check whether an approval-bound action may continue, record the final outcome, and summarize runtime exposure across connected agents.

## Why this exists

n8n is often used as the practical glue between AI agents, business systems, customer data, messaging, and internal operations. Once a workflow can update records, send messages, publish content, call external APIs, or touch production systems, "human in the loop" is not enough by itself.

OSuite gives those steps a governed action layer:

- **Review Planned Work** creates a pre-execution OSuite action record.
- **Check If Approved** lets a workflow pause until OSuite approval is granted.
- **Record Final Outcome** closes the loop with what actually happened.
- **Summarize Runtime Exposure** returns a read-only runtime security posture from OSuite.

## Installation

Install this package as an n8n community node:

```bash
npm install n8n-nodes-osuite
```

For self-hosted n8n, you can also install it from the n8n UI under **Settings → Community nodes** by entering:

```text
n8n-nodes-osuite
```

## Credentials

Create an **OSuite API** credential in n8n:

- **Base URL**: `https://studio.osuite.ai`
- **API Key**: a workspace API key generated in OSuite Studio

The credential test calls:

```text
POST /api/setup/ping
```

## Operations

### Review Planned Work

Use this before an n8n step performs consequential work.

Typical placement:

```text
AI / workflow planning step
→ OSuite: Review Planned Work
→ IF approval_required is false
→ Execute business action
→ OSuite: Record Final Outcome
```

If OSuite returns `approval_required: true`, route the workflow to a wait, manual approval, or escalation branch before continuing.

### Check If Approved

Use this after `Review Planned Work` returns an OSuite `action_id`.

The output includes:

- `approved`
- `denied`
- `approval_required`
- `status`
- `replay_url`

### Record Final Outcome

Use this after the governed action finishes.

Record:

- final status
- summary
- side effects
- created artifacts
- error message when failed

### Summarize Runtime Exposure

Use this for a read-only posture summary from OSuite Runtime Security.

This is useful in scheduled checks, security review workflows, and operator dashboards.

## Example workflow pattern

```text
Trigger
→ Prepare CRM update
→ OSuite: Review Planned Work
→ IF blocked: stop and notify owner
→ IF approval_required: wait for approval, then OSuite: Check If Approved
→ Patch CRM
→ Send Slack summary
→ OSuite: Record Final Outcome
```

An importable demo workflow is included at:

```text
examples/osuite-governed-customer-export.workflow.json
```

It demonstrates a customer-data export review, an approval checkpoint, a mock business action, and final outcome recording.

## Data handling

This node sends the action context you configure in n8n to your OSuite workspace endpoint. That may include declared goal, proposed action, systems touched, risk level, decision context, optional tool input summary, final outcome, side effects, and artifact summaries.

Do not include secrets in the **Tool Input JSON** field.

## Development

```bash
npm install
npm run lint
npm test
npm run build
```

Local development uses the official `@n8n/node-cli` tooling.

## Links

- OSuite website: https://ond.cc
- OSuite Studio: https://studio.osuite.ai
- Reference architecture: https://ond.cc/reference-architecture
- Examples: https://github.com/OndCo/OSuite-Governed-Agent-Examples

## License

MIT. Copyright Ond Holdings Inc.
