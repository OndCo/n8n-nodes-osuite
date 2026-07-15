import { randomUUID } from 'node:crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	buildHttpRequestOptions,
	buildReviewPayload,
	buildRuntimeSessionPayload,
	normalizeBaseUrl,
	parseCsv,
	summarizeReviewResponse,
	type OSuiteCredentials,
	type ReviewInput,
} from './shared/client';

type ActionResponse = IDataObject & {
	_httpStatus?: number;
};

const actionKinds = [
	{
		name: 'Workflow',
		value: 'workflow',
		description: 'General workflow step',
	},
	{
		name: 'Publish or Message',
		value: 'publish',
		description: 'Send, publish, notify, or otherwise expose information',
	},
	{
		name: 'Data Access',
		value: 'data_access',
		description: 'Read, export, summarize, or transfer data',
	},
	{
		name: 'System Change',
		value: 'system_change',
		description: 'Change records, settings, deployments, or production systems',
	},
	{
		name: 'External API Call',
		value: 'external_api',
		description: 'Call an external service or tool',
	},
];

async function requestOSuite(
	executeFunctions: IExecuteFunctions,
	credentials: OSuiteCredentials,
	method: 'GET' | 'POST' | 'PATCH',
	path: string,
	body?: IDataObject,
): Promise<ActionResponse> {
	const requestOptions = buildHttpRequestOptions(credentials, method, path, body);
	const timeout = Number(requestOptions.timeout ?? 60000);

	try {
		const response = await fetch(requestOptions.url, {
			method,
			headers: requestOptions.headers as Record<string, string>,
			body: method === 'GET' || body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(timeout),
		});
		const text = await response.text();
		let parsed: unknown = {};

		if (text) {
			try {
				parsed = JSON.parse(text) as unknown;
			} catch {
				throw new NodeOperationError(
					executeFunctions.getNode(),
					`OSuite returned a non-JSON response (${response.status}).`,
				);
			}
		}

		const data =
			typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
				? (parsed as ActionResponse)
				: ({ value: parsed } as ActionResponse);
		data._httpStatus = response.status;
		data._http_status = response.status;

		return data;
	} catch (error) {
		const message =
			error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
				? `OSuite request timed out after ${timeout}ms.`
				: error instanceof Error
					? error.message
					: String(error);
		throw new NodeOperationError(executeFunctions.getNode(), message);
	}
}

function getCredentialsObject(credentials: IDataObject): OSuiteCredentials {
	return {
		baseUrl: String(credentials.baseUrl ?? ''),
		apiKey: String(credentials.apiKey ?? ''),
	};
}

export class Osuite implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OSuite',
		name: 'osuite',
		icon: { light: 'file:../../icons/osuite.svg', dark: 'file:../../icons/osuite.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Govern n8n workflow actions with OSuite runtime review and approvals',
		defaults: {
			name: 'OSuite',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'osuiteApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Check If Approved',
						value: 'checkIfApproved',
						action: 'Check if approved',
						description: 'Check whether an OSuite approval-bound action may continue',
					},
					{
						name: 'Record Final Outcome',
						value: 'recordFinalOutcome',
						action: 'Record final outcome',
						description: 'Close a governed action with the workflow result',
					},
					{
						name: 'Review Planned Work',
						value: 'reviewPlannedWork',
						action: 'Review planned work',
						description: 'Create a governed action record before consequential work runs',
					},
					{
						name: 'Summarize Runtime Exposure',
						value: 'summarizeRuntimeExposure',
						action: 'Summarize runtime exposure',
						description: 'Read OSuite runtime security posture and exposure backlog',
					},
				],
				default: 'reviewPlannedWork',
			},
			{
				displayName: 'Goal',
				name: 'goal',
				type: 'string',
				required: true,
				default: '',
				description: 'Business goal of the planned n8n step',
				displayOptions: {
					show: {
						operation: ['reviewPlannedWork'],
					},
				},
			},
			{
				displayName: 'Proposed Action',
				name: 'proposedAction',
				type: 'string',
				required: true,
				default: '',
				description: 'Concrete action n8n is about to perform',
				displayOptions: {
					show: {
						operation: ['reviewPlannedWork'],
					},
				},
			},
			{
				displayName: 'Action Kind',
				name: 'actionKind',
				type: 'options',
				options: actionKinds,
				default: 'workflow',
				displayOptions: {
					show: {
						operation: ['reviewPlannedWork'],
					},
				},
			},
			{
				displayName: 'Risk Level',
				name: 'riskLevel',
				type: 'number',
				default: 25,
				typeOptions: {
					minValue: 0,
					maxValue: 100,
				},
				description: 'Initial n8n-side risk estimate from 0 to 100. OSuite recalculates its own score.',
				displayOptions: {
					show: {
						operation: ['reviewPlannedWork'],
					},
				},
			},
			{
				displayName: 'Systems Touched',
				name: 'systemsTouched',
				type: 'string',
				default: 'n8n',
				placeholder: 'CRM, Slack, database',
				description: 'Comma-separated systems affected by the action',
				displayOptions: {
					show: {
						operation: ['reviewPlannedWork'],
					},
				},
			},
			{
				displayName: 'Reversible',
				name: 'reversible',
				type: 'boolean',
				default: false,
				description: 'Whether the action can be cleanly rolled back',
				displayOptions: {
					show: {
						operation: ['reviewPlannedWork'],
					},
				},
			},
			{
				displayName: 'Decision Context',
				name: 'decisionContext',
				type: 'string',
				typeOptions: {
					rows: 5,
				},
				default: '',
				description: 'Evidence or assumptions an approver should see',
				displayOptions: {
					show: {
						operation: ['reviewPlannedWork'],
					},
				},
			},
			{
				displayName: 'Tool Input JSON',
				name: 'toolInputJson',
				type: 'json',
				default: '{}',
				description: 'Optional compact JSON summary of the next n8n step input. Do not include secrets.',
				displayOptions: {
					show: {
						operation: ['reviewPlannedWork'],
					},
				},
			},
			{
				displayName: 'Action ID',
				name: 'actionId',
				type: 'string',
				default: '',
				description: 'OSuite action ID. Leave blank in Review Planned Work to generate one.',
				displayOptions: {
					show: {
						operation: ['reviewPlannedWork', 'checkIfApproved', 'recordFinalOutcome'],
					},
				},
			},
			{
				displayName: 'Advanced',
				name: 'advanced',
				type: 'collection',
				default: {},
				placeholder: 'Add advanced field',
				displayOptions: {
					show: {
						operation: ['reviewPlannedWork'],
					},
				},
				options: [
					{
						displayName: 'Agent ID',
						name: 'agentId',
						type: 'string',
						default: 'n8n-governed-workflow',
						description: 'Stable OSuite agent ID for this workflow',
					},
					{
						displayName: 'Agent Name',
						name: 'agentName',
						type: 'string',
						default: 'n8n governed workflow',
						description: 'Human-readable agent name in OSuite',
					},
					{
						displayName: 'Node ID',
						name: 'nodeId',
						type: 'string',
						default: '',
						description: 'Optional n8n node identifier',
					},
					{
						displayName: 'Policy Profile ID',
						name: 'policyProfileId',
						type: 'string',
						default: '',
						description: 'Optional OSuite policy profile override',
					},
					{
						displayName: 'Runtime Session ID',
						name: 'runtimeSessionId',
						type: 'string',
						default: '',
						description: 'Optional OSuite runtime session ID. Leave blank to generate one.',
					},
					{
						displayName: 'Tool Use ID',
						name: 'toolUseId',
						type: 'string',
						default: '',
						description: 'Optional tool-use identifier. Leave blank to generate one.',
					},
					{
						displayName: 'Workflow ID',
						name: 'workflowId',
						type: 'string',
						default: '',
						description: 'Optional n8n workflow identifier',
					},
				],
			},
			{
				displayName: 'Outcome',
				name: 'outcome',
				type: 'options',
				options: [
					{
						name: 'Cancelled',
						value: 'cancelled',
					},
					{
						name: 'Completed',
						value: 'completed',
					},
					{
						name: 'Failed',
						value: 'failed',
					},
				],
				default: 'completed',
				displayOptions: {
					show: {
						operation: ['recordFinalOutcome'],
					},
				},
			},
			{
				displayName: 'Summary',
				name: 'summary',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description: 'Concise summary of what happened',
				displayOptions: {
					show: {
						operation: ['recordFinalOutcome'],
					},
				},
			},
			{
				displayName: 'Side Effects',
				name: 'sideEffects',
				type: 'string',
				default: '',
				placeholder: 'message sent, record updated',
				description: 'Comma-separated side effects observed',
				displayOptions: {
					show: {
						operation: ['recordFinalOutcome'],
					},
				},
			},
			{
				displayName: 'Artifacts Created',
				name: 'artifactsCreated',
				type: 'string',
				default: '',
				placeholder: 'report URL, exported file',
				description: 'Comma-separated artifacts created by the workflow step',
				displayOptions: {
					show: {
						operation: ['recordFinalOutcome'],
					},
				},
			},
			{
				displayName: 'Error Message',
				name: 'errorMessage',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['recordFinalOutcome'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = getCredentialsObject((await this.getCredentials('osuiteApi')) as IDataObject);
		const baseUrl = normalizeBaseUrl(credentials.baseUrl);
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				if (operation === 'summarizeRuntimeExposure') {
					const response = await requestOSuite(
						this,
						credentials,
						'GET',
						'/api/runtime-security/overview',
					);

					returnData.push({
						json: response,
						pairedItem: itemIndex,
					});
					continue;
				}

				const actionId = this.getNodeParameter('actionId', itemIndex, '') as string;

				if (operation === 'checkIfApproved') {
					if (!actionId) {
						throw new NodeOperationError(this.getNode(), 'Action ID is required.', { itemIndex });
					}

					const response = await requestOSuite(
						this,
						credentials,
						'GET',
						`/api/actions/${encodeURIComponent(actionId)}`,
					);
					const action = (response.action ?? {}) as IDataObject;
					const status = String(action.status ?? 'unknown');
					const errorMessage = String(action.error_message ?? '').toLowerCase();

					returnData.push({
						json: {
							action_id: actionId,
							status,
							approval_required: status === 'pending_approval',
							approved: !['pending_approval', 'failed', 'blocked'].includes(status),
							denied: status === 'failed' && errorMessage.includes('denied'),
							decision: ((action.policy_snapshot ?? {}) as IDataObject).effective_decision,
							replay_url: `${baseUrl}/replay/${encodeURIComponent(actionId)}`,
							raw: response,
						},
						pairedItem: itemIndex,
					});
					continue;
				}

				if (operation === 'recordFinalOutcome') {
					if (!actionId) {
						throw new NodeOperationError(this.getNode(), 'Action ID is required.', { itemIndex });
					}

					const payload: IDataObject = {
						status: this.getNodeParameter('outcome', itemIndex) as string,
						output_summary: this.getNodeParameter('summary', itemIndex, '') as string,
						error_message: this.getNodeParameter('errorMessage', itemIndex, '') as string,
						side_effects: parseCsv(this.getNodeParameter('sideEffects', itemIndex, '') as string),
						artifacts_created: parseCsv(
							this.getNodeParameter('artifactsCreated', itemIndex, '') as string,
						),
						timestamp_end: new Date().toISOString(),
					};
					const response = await requestOSuite(
						this,
						credentials,
						'PATCH',
						`/api/actions/${encodeURIComponent(actionId)}`,
						payload,
					);

					returnData.push({
						json: {
							action_id: actionId,
							outcome_recorded: true,
							status: ((response.action ?? {}) as IDataObject).status ?? payload.status,
							replay_url: `${baseUrl}/replay/${encodeURIComponent(actionId)}`,
							raw: response,
						},
						pairedItem: itemIndex,
					});
					continue;
				}

				const advanced = this.getNodeParameter('advanced', itemIndex, {}) as IDataObject;
				const generatedActionId = actionId || `act_${randomUUID()}`;
				const runtimeSessionId =
					String(advanced.runtimeSessionId ?? '').trim() || `n8n_${randomUUID()}`;
				const toolUseId = String(advanced.toolUseId ?? '').trim() || `n8n_tool_${randomUUID()}`;
				const reviewInput: ReviewInput = {
					actionId: generatedActionId,
					agentId: String(advanced.agentId ?? 'n8n-governed-workflow'),
					agentName: String(advanced.agentName ?? 'n8n governed workflow'),
					runtimeSessionId,
					toolUseId,
					goal: this.getNodeParameter('goal', itemIndex) as string,
					proposedAction: this.getNodeParameter('proposedAction', itemIndex) as string,
					actionKind: this.getNodeParameter('actionKind', itemIndex) as string,
					riskLevel: this.getNodeParameter('riskLevel', itemIndex, 25) as number,
					systemsTouched: this.getNodeParameter('systemsTouched', itemIndex, 'n8n') as string,
					reversible: this.getNodeParameter('reversible', itemIndex, false) as boolean,
					decisionContext: this.getNodeParameter('decisionContext', itemIndex, '') as string,
					toolInputJson: this.getNodeParameter('toolInputJson', itemIndex, '{}') as string,
					workflowId: String(advanced.workflowId ?? ''),
					nodeId: String(advanced.nodeId ?? ''),
					policyProfileId: String(advanced.policyProfileId ?? ''),
				};

				await requestOSuite(
					this,
					credentials,
					'POST',
					'/api/runtime-sessions',
					buildRuntimeSessionPayload(reviewInput),
				);

				const payload = buildReviewPayload(reviewInput);
				const response = await requestOSuite(this, credentials, 'POST', '/api/actions', payload);
				const httpStatus = Number(response._http_status ?? response.statusCode ?? 200);

				returnData.push({
					json: {
						...summarizeReviewResponse(
							baseUrl,
							response,
							httpStatus,
							generatedActionId,
							reviewInput.riskLevel,
						),
						runtime_session_id: runtimeSessionId,
						raw: response,
					},
					pairedItem: itemIndex,
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: itemIndex,
					});
					continue;
				}

				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
