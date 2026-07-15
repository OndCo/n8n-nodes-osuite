# OSuite n8n demo workflows

This folder contains importable n8n workflows for showing how OSuite governs consequential workflow actions before they execute.

## Governed customer-data export

Import:

```text
examples/osuite-governed-customer-export.workflow.json
```

Demo story:

```text
Manual Trigger
-> Mock CRM Export Request
-> OSuite: Review Planned Work
-> OSuite: Check If Approved
-> Mock Business Action
-> OSuite: Record Final Outcome
```

Optional side branch:

```text
Manual Trigger
-> OSuite: Runtime Exposure Snapshot
```

Before running the workflow, create an **OSuite API** credential in n8n:

- Base URL: `https://studio.osuite.ai`
- API Key: a workspace API key from OSuite Studio

The imported OSuite nodes will show a red warning until this credential is assigned. This is expected: workflow JSON files should not embed API keys.

Recommended recording flow:

1. Import the workflow.
2. Assign the OSuite credential to each OSuite node.
3. Execute through **OSuite - Review Planned Work**.
4. Open OSuite Studio and approve the generated action if it is approval-bound.
5. Continue from **OSuite - Check If Approved**.
6. Show that the mock business action only runs after approval.
7. Open the OSuite replay URL from the final output.

The workflow uses demo data only and does not export, send, or mutate real customer records.
