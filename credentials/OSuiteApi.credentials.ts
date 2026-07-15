import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class OSuiteApi implements ICredentialType {
	name = 'osuiteApi';

	displayName = 'OSuite API';

	icon: Icon = { light: 'file:../icons/osuite.svg', dark: 'file:../icons/osuite.dark.svg' };

	documentationUrl = 'https://ond.cc/reference-architecture';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://studio.osuite.ai',
			placeholder: 'https://studio.osuite.ai',
			description: 'OSuite Studio endpoint. Use the default for OSuite Cloud.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Workspace API key generated in OSuite Studio',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/setup/ping',
			method: 'POST',
			body: {},
		},
	};
}
