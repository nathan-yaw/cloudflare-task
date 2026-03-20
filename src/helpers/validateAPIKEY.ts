import { Env } from '../types/environment';

export async function validateApiKey(env: Env, request: Request): Promise<any> {
	const api_key = request.headers.get('X-API-Key');

	if (api_key != env.API_KEY || !api_key) {
		return new Response('Unuthorized', { status: 401 });
	}
}
