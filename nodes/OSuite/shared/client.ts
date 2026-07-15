import type { IDataObject, IHttpRequestMethods, IHttpRequestOptions } from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://studio.osuite.ai';
const MAX_SUMMARY_CHARS = 3800;

export type OSuiteCredentials = {
	baseUrl?: string;
	apiKey?: string;
};

export type ReviewInput = {
	actionId: string;
	agentId: string;
	agentName: string;
	runtimeSessionId: string;
	toolUseId: string;
	goal: string;
	proposedAction: string;
	actionKind: string;
	riskLevel: number;
	systemsTouched: string;
	reversible: boolean;
	decisionContext: string;
	toolInputJson: string;
	workflowId: string;
	nodeId: string;
	policyProfileId: string;
};

export function normalizeBaseUrl(value: unknown): string {
	const text = String(value ?? '').trim();
	const baseUrl = (text || DEFAULT_BASE_URL).replace(/\/+$/u, '');
	const parsed = new URL(baseUrl);

	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		throw new Error('OSuite Base URL must use HTTP or HTTPS.');
	}

	return baseUrl;
}

export function parseCsv(value: unknown, fallback: string[] = []): string[] {
	const values = String(value ?? '')
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);

	return values.length > 0 ? values : fallback;
}

export function parseJsonObject(value: unknown): IDataObject {
	const text = String(value ?? '').trim();

	if (!text) {
		return {};
	}

	try {
		const parsed = JSON.parse(text) as unknown;
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? (parsed as IDataObject)
			: { value: parsed as IDataObject[keyof IDataObject] };
	} catch {
		return { raw: text.slice(0, 1000) };
	}
}

export function compactJson(value: unknown, maxChars = MAX_SUMMARY_CHARS): string {
	const text = JSON.stringify(value);

	if (text.length <= maxChars) {
		return text;
	}

	const suffix = JSON.stringify({
		_truncated: true,
		_original_chars: text.length,
	});

	return `${text.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

export function buildRuntimeSessionPayload(input: ReviewInput): IDataObject {
	return {
		runtime_session_id: input.runtimeSessionId,
		agent_id: input.agentId,
		runtime_adapter_id: 'n8n-community-node',
		runtime_family: 'workflow_automation',
		adapter_mode: 'community_node',
		client_name: 'n8n',
		client_version: 'community-node-0.1.0',
		governance_posture: 'managed',
		signature_mode: 'connector-declared',
		install_channel: 'n8n_community_node',
		settings_scope: 'workflow',
		metadata: {
			source: 'n8n_community_node',
			n8n_workflow_id: input.workflowId,
			n8n_node_id: input.nodeId,
		},
	};
}

export function buildReviewPayload(input: ReviewInput): IDataObject {
	const toolInput = parseJsonObject(input.toolInputJson);
	const inputSummary = {
		runtime: 'n8n',
		capture_mode: 'connector_declared',
		decision_capture: 'osuite_preflight',
		workflow_id: input.workflowId,
		node_id: input.nodeId,
		proposed_action: input.proposedAction,
		decision_context: input.decisionContext,
		tool_input: toolInput,
	};
	const payload: IDataObject = {
		action_id: input.actionId,
		agent_id: input.agentId,
		agent_name: input.agentName,
		action_type: `n8n.${input.actionKind}`,
		declared_goal: input.goal,
		reasoning: input.decisionContext.slice(0, 4000),
		trigger: `n8n:review_planned_work:${input.actionKind}`,
		systems_touched: parseCsv(input.systemsTouched, ['n8n']),
		input_summary: compactJson(inputSummary),
		risk_score: input.riskLevel,
		reversible: input.reversible,
		runtime_family: 'workflow_automation',
		runtime_type: 'n8n',
		adapter_mode: 'community_node',
		runtime_session_id: input.runtimeSessionId,
		tool_use_id: input.toolUseId,
		policy_binding_source: input.policyProfileId
			? 'n8n_node_explicit'
			: 'n8n_node_default',
		governance_stage_receipts: [
			{
				stage: 'n8n_node_preflight',
				status: 'submitted',
				timestamp: new Date().toISOString(),
			},
		],
	};

	if (input.policyProfileId) {
		payload.policy_profile_id = input.policyProfileId;
	}

	return payload;
}

export function summarizeReviewResponse(
	baseUrl: string,
	response: IDataObject,
	httpStatus: number,
	fallbackActionId: string,
	fallbackRiskScore: number,
): IDataObject {
	const action = (response.action ?? {}) as IDataObject;
	const decisionPayload = (response.decision ?? {}) as IDataObject;
	const contracts = (response.contracts ?? {}) as IDataObject;
	const riskResult = (contracts.risk_result ?? {}) as IDataObject;
	const actionId = String(action.action_id ?? fallbackActionId);
	const decision =
		decisionPayload.decision ??
		(httpStatus === 403 ? 'block' : action.status === 'pending_approval' ? 'require_approval' : 'allow');

	return {
		action_id: actionId,
		decision,
		approval_required: decision === 'require_approval',
		blocked: decision === 'block' || httpStatus === 403,
		status: action.status ?? (httpStatus === 403 ? 'blocked' : 'running'),
		risk_score: riskResult.risk_score ?? fallbackRiskScore,
		policy_reason: decisionPayload.reason ?? response.error ?? '',
		replay_url: `${baseUrl}/replay/${encodeURIComponent(actionId)}`,
	};
}

export function buildHttpRequestOptions(
	credentials: OSuiteCredentials,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
): IHttpRequestOptions {
	const baseUrl = normalizeBaseUrl(credentials.baseUrl);
	const apiKey = String(credentials.apiKey ?? '').trim();

	if (!apiKey) {
		throw new Error('OSuite API key is required.');
	}

	return {
		method,
		url: `${baseUrl}${path}`,
		body,
		json: true,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'n8n-nodes-osuite/0.1.0',
			'x-api-key': apiKey,
		},
	};
}
