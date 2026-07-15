import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildReviewPayload,
	compactJson,
	normalizeBaseUrl,
	parseCsv,
	summarizeReviewResponse,
} from '../dist/nodes/OSuite/shared/client.js';

test('normalizeBaseUrl trims trailing slashes and defaults to OSuite Cloud', () => {
	assert.equal(normalizeBaseUrl('https://studio.osuite.ai///'), 'https://studio.osuite.ai');
	assert.equal(normalizeBaseUrl(''), 'https://studio.osuite.ai');
});

test('parseCsv returns clean values and fallback when empty', () => {
	assert.deepEqual(parseCsv('crm, slack, , github'), ['crm', 'slack', 'github']);
	assert.deepEqual(parseCsv('', ['n8n']), ['n8n']);
});

test('compactJson truncates oversized payloads with provenance metadata', () => {
	const compacted = compactJson({ value: 'x'.repeat(5000) }, 300);

	assert.ok(compacted.length <= 360);
	assert.match(compacted, /"_truncated":true/);
	assert.match(compacted, /"_original_chars":/);
});

test('buildReviewPayload maps n8n workflow context into an OSuite governed action', () => {
	const payload = buildReviewPayload({
		actionId: 'act_test',
		agentId: 'n8n-workflow',
		agentName: 'n8n workflow',
		runtimeSessionId: 'n8n_session',
		toolUseId: 'n8n_tool',
		goal: 'Update customer record',
		proposedAction: 'Patch CRM contact',
		actionKind: 'system_change',
		riskLevel: 72,
		systemsTouched: 'CRM, Slack',
		reversible: false,
		decisionContext: 'Customer owner confirmed the change.',
		toolInputJson: '{"recordId":"cus_123"}',
		workflowId: 'wf_123',
		nodeId: 'node_456',
		policyProfileId: 'strict',
	});

	assert.equal(payload.action_id, 'act_test');
	assert.equal(payload.action_type, 'n8n.system_change');
	assert.equal(payload.runtime_type, 'n8n');
	assert.equal(payload.runtime_family, 'workflow_automation');
	assert.deepEqual(payload.systems_touched, ['CRM', 'Slack']);
	assert.equal(payload.policy_profile_id, 'strict');
	assert.equal(payload.risk_score, 72);
	assert.equal(payload.reversible, false);
	assert.match(payload.input_summary, /"workflow_id":"wf_123"/);
	assert.match(payload.input_summary, /"recordId":"cus_123"/);
});

test('summarizeReviewResponse derives approval and replay fields from OSuite response', () => {
	const summary = summarizeReviewResponse(
		'https://studio.osuite.ai',
		{
			action: {
				action_id: 'act_123',
				status: 'pending_approval',
			},
			decision: {
				decision: 'require_approval',
				reason: 'Approval required by policy.',
			},
			contracts: {
				risk_result: {
					risk_score: 63,
				},
			},
		},
		202,
		'act_fallback',
		45,
	);

	assert.deepEqual(summary, {
		action_id: 'act_123',
		decision: 'require_approval',
		approval_required: true,
		blocked: false,
		status: 'pending_approval',
		risk_score: 63,
		policy_reason: 'Approval required by policy.',
		replay_url: 'https://studio.osuite.ai/replay/act_123',
	});
});
