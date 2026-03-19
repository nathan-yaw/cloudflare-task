import { Env } from '../types/environment';

export async function getResourceNameByName(env: Env, key: string): Promise<string> {
	const results = await env.image_store_db
		.prepare('SELECT ImageName as name FROM Images WHERE ImageName = ?')
		.bind(key)
		.first<{ name: string }>();

	if (!results) {
		throw new Error('Failed to locate resource');
	}
	return results?.name as string;
}

/**
 * Checks if a key/filename exists already within our database.
 *
 * @author Nathan Abuaku
 * @param env - interface: bindings to Cloudflare services
 * @param key  - string: the key/name of the requested resource
 * @returns - boolean: depending on whether or not the resource exists within the database
 */
export async function keyExistsInDb(env: Env, key: String): Promise<boolean> {
	console.log('Checking for key in db...');
	const results = await env.image_store_db
		.prepare('SELECT count(*) as count FROM Images WHERE ImageName = ?')
		.bind(key)
		.first<{ count: number }>();
	return (results?.count ?? 0) > 0;
}

/**
 *
 * @author Nathan Abuaku
 * @param env - interface: bindings to Cloudflare Services
 * @param key - string: the name of the image we're adding to the database
 * @param alt_text - string: the AI generated description of our image file
 * @returns - response: either 201, created or a 500 Internal server error
 */
export async function addKeyToDB(env: Env, key: String, alt_text: String): Promise<Response> {
	const { success } = await env.image_store_db.prepare('INSERT INTO Images (ImageName, AltText) VALUES (?, ?)').bind(key, alt_text).run();

	if (success) {
		return new Response('Created', { status: 201 });
	} else {
		return new Response('Internal Server Error', { status: 500 });
	}
}

/**
 * @author Nathan Abuaku
 * @param env - interface: An interface containing bindings for different Cloudflare services
 * @param key - string: the name of the image file we're querying
 * @returns - string: the alt text for the given image file. or 'Error'
 */
export async function getAltTextFromDB(env: Env, key: String): Promise<String> {
	const success = await env.image_store_db
		.prepare('SELECT AltText as altText FROM Images WHERE ImageId = ?')
		.bind(key)
		.first<{ altText: string }>();

	if (success) {
		return success?.altText as string;
	} else {
		return 'Error';
	}
}

/**
 * @author Nathan Abuaku
 * @param env interface: bindings to Cloudflare services
 * @returns response: result of query as json | 500 if query fails
 */
export async function auditData(env: Env): Promise<Response> {
	const query = await env.image_store_db.prepare('SELECT * FROM Images;').all();

	if (query) {
		return Response.json(query);
	}

	return new Response('Internal Server Error', { status: 500 });
}
