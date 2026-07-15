# Changelog

## 0.1.3

- Stabilized OSuite API calls for customer n8n environments by using a direct fetch transport.
- Added a 60-second request timeout so Review Planned Work can wait for full OSuite decision scoring.
- Added regression coverage for OSuite action request timeout behavior.

## 0.1.0

- Initial OSuite community node for n8n.
- Added OSuite API credentials.
- Added Review Planned Work, Check If Approved, Record Final Outcome, and Summarize Runtime Exposure operations.
- Added build, lint, and Node.js test coverage for OSuite payload construction.
