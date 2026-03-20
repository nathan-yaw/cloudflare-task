/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { Env } from './types/environment';
import {
	addKeyToDB,
	auditData,
	deleteFromD1,
	getAltTextFromDB,
	getFileNameFromD1,
	getResourceNameById,
	keyExistsInDb,
} from './utils/queryDB';
import { generateAltText } from './helpers/generateAltText';
import { getContentType, getFileType } from './helpers/validateImageFile';
import { validateApiKey } from './helpers/validateAPIKEY';

export default class extends WorkerEntrypoint<Env> {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		//Initialise cache
		const cache = caches.default;
		//Get filename from url path
		const url = new URL(request.url);
		const key = url.pathname.slice(1);
		let resource;
		const validContentTypes = ['image/jpg', 'image/png', 'image/webp'];
		const api_key = request.headers.get('X-API-Key');
		try {
			resource = await getResourceNameById(this.env, key);
		} catch {
			resource = key;
		}

		const cached = await cache.match(request);
		if (cached && api_key == this.env.API_KEY) {
			console.log('Fetching response from cache...');
			return cached;
		}

		//Check if API Key in request
		if (api_key != this.env.API_KEY || !api_key) {
			return new Response('Not Authorized', { status: 401 });
		}

		//Handle different requests
		switch (request.method) {
			case 'GET': {
				//If /audit is requested
				if (url.pathname == '/audit') {
					return auditData(this.env);
				}

				//If not cached:
				const object = await this.env.image_bucket.get(resource, {
					onlyIf: request.headers,
					range: request.headers,
				});

				if (object == null) {
					return new Response(JSON.stringify({ message: 'Image not found' }));
				}

				//If object is not null. Begin by creating headers & setting etag header.
				const headers = new Headers();
				object?.writeHttpMetadata(headers);
				headers.set('etag', object.httpEtag);

				//Check if object has been added to the database yet
				const keyInDb = await keyExistsInDb(this.env, resource);
				if (keyInDb == false) {
					const new_key = crypto.randomUUID();
					//Create new response from object body & Clone Response. Do this so we can consume the response twice, since we need an arrayBuffer for generating alt-text, and the cloned response for serving the image
					const initialResponse = new Response(object.body);
					const clonedResponse = initialResponse.clone();
					const contentType = clonedResponse.headers.get('Content-Type') ?? 'image/jpg';

					//Use the initial response to get arrayBuffer for processing image with AI.
					const blob = await initialResponse.arrayBuffer();

					const altText = await generateAltText(this.env, blob);
					//Write key and alt-text to db
					addKeyToDB(this.env, new_key, altText, resource, contentType);
					//Write headers & return response
					headers.set('alt-text', altText);
					headers.set('Cache-Control', 'public, max_age=3600, immutable');
					headers.set('Content-Type', 'image/jpeg');

					//Build response and return
					const res = new Response(clonedResponse.body, {
						status: 200,
						headers,
					});

					this.ctx.waitUntil(cache.put(request, res.clone()));
					return res;
				} else {
					//Get alt-text from db
					const altText = (await getAltTextFromDB(this.env, key)) as string;
					headers.set('alt-text', altText);
					headers.set('Cache-Control', 'public, max_age=3600, immutable');
					headers.set('Content-Type', 'image/jpeg');

					const res = new Response(object.body, {
						status: 200,
						headers,
					});

					this.ctx.waitUntil(cache.put(request, res.clone()));
					return res;
				}
			}
			case 'PUT': {
				//Get image being uploaded.
				const clonedRequest = request.clone();
				const new_key = crypto.randomUUID();
				const contentType = request.headers.get('Content-Type');
				const contentLength = request.headers.get('Content-Length');

				//Validate content-type
				if (contentType == null || !validContentTypes.includes(contentType)) {
					return new Response('Unsupported Media Type', { status: 415 });
				}

				//Validate Content Length
				if (contentLength && parseInt(contentLength) > 2500000) {
					return new Response('File too large!', { status: 413 });
				}

				//validateImageFile(this.env, clonedRequest);
				const fileType = await getFileType(contentType);
				const object = await this.env.image_bucket.put(new_key, request.body, {
					httpMetadata: {
						contentType: contentType,
					},
				});

				if (object == null) {
					return new Response('Precondition failed or upload returned null', { status: 412 });
				}

				const blob = await clonedRequest.arrayBuffer();
				const altText = await generateAltText(this.env, blob);

				await addKeyToDB(this.env, new_key, altText, key, contentType);

				return Response.json({
					key: object.key,
					size: object.size,
					etag: object.etag,
				});
			}
			case 'DELETE': {
				const fileName = await getFileNameFromD1(this.env, key);
				console.log('DELETING...' + fileName);
				await this.env.image_bucket.delete(fileName);
				deleteFromD1(this.env, key);

				return new Response('Content Deleted', { status: 200 });
			}
			default:
				return new Response('Method Not Allowed', {
					status: 405,
					headers: {
						Allow: 'PUT, GET, DELETE',
					},
				});
		}
	}
}
