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
import { addKeyToDB, auditData, getAltTextFromDB, getResourceNameByName, keyExistsInDb } from './utils/queryDB';
import { generateAltText } from './helpers/generateAltText';

export default class extends WorkerEntrypoint<Env> {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		//Initialise cache
		const cache = caches.default;
		//Get filename from url path
		const url = new URL(request.url);
		const key = url.pathname.slice(1);
		let resource;

		try {
			resource = await getResourceNameByName(this.env, key);
		} catch {
			resource = key;
		}

		const cached = await cache.match(request);
		if (cached) {
			console.log('Fetching response from cache...');
			return cached;
		}
		//Use Switch statement to handle different HTTP requests
		switch (request.method) {
			case 'GET': {
				if (url.pathname == '/audit') {
					return auditData(this.env);
				}
				//If not cached git:
				console.log('Not fetching from cache :(');
				console.log('Resource=' + resource);

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
				const keyInDb = await keyExistsInDb(this.env, key);
				if (keyInDb == false) {
					//Create new response from object body & Clone Response. Do this so we can consume the response twice, since we need an arrayBuffer for generating alt-text, and the cloned response for serving the image
					const initialResponse = new Response(object.body);
					const clonedResponse = initialResponse.clone();

					//Use the initial response to get arrayBuffer for processing image with AI.
					const blob = await initialResponse.arrayBuffer();

					const altText = await generateAltText(this.env, blob);

					//Write key and alt-text to db
					addKeyToDB(this.env, key + '.jpg', altText);
					//Write headers & return response
					headers.set('alt-text', altText);
					headers.set('Cache-Control', 'public, max_age=3600, immutable');
					headers.set('Content-Type', 'image/jpeg');

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
				//url is accesible to us already and so is the endpoint, as the "key"
				// /audit is our secure endpoint.
				// if (endpoint == 'audit') {
				// }
				//Get image being uploaded.
				const clonedRequest = request.clone();
				const imgName = key;
				const object = await this.env.image_bucket.put(imgName, request.body, {
					httpMetadata: {
						contentType: 'image/jpg',
					},
				});

				if (object == null) {
					return new Response('Precondition failed or upload returned null', { status: 412 });
				}

				//const clonedResponse = request.clone();
				const blob = await clonedRequest.arrayBuffer();
				const altText = await generateAltText(this.env, blob);

				await addKeyToDB(this.env, imgName, altText);

				return Response.json({
					key: object.key,
					size: object.size,
					etag: object.etag,
				});

				return new Response(JSON.stringify({ message: 'To be implemented' }));
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
