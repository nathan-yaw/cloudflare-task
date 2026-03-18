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
import { Env } from './environment';
import { addKeyToDB, getAltTextFromDB, keyExistsInDb } from './queryDB';
import { generateAltTex } from './generateAltText';

export default class extends WorkerEntrypoint<Env> {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		//console.log('db binding:', env.image_store_db);
		const url = new URL(request.url);
		const key = url.pathname.slice(1);
		//We can check if our key exists in our databases Image table. SELECT * COUNT(*) FROM Images WHERE ImageName = 'key'.
		switch (request.method) {
			case 'GET': {
				const object = await this.env.image_bucket.get(key, {
					onlyIf: request.headers,
					range: request.headers,
				});

				if (object == null) {
					return new Response(JSON.stringify({ message: 'Image not found' }));
				}

				const headers = new Headers();
				object?.writeHttpMetadata(headers);
				headers.set('etag', object.httpEtag);

				//Object exists in bucket, check if object in db.
				const keyInDb = await keyExistsInDb(this.env, key);
				console.log('keyInDB:' + keyInDb + ' with key:' + key);
				if (keyInDb == false) {
					//Create new response from object body & Clone Response
					const initialResponse = new Response(object.body);
					const clonedResponse = initialResponse.clone();

					//Use the initial response to get arrayBuffer for processing image with AI.
					const blob = await initialResponse.arrayBuffer();

					const altText = await generateAltTex(this.env, blob);

					//Write key and alt-text to db
					addKeyToDB(this.env, key, altText);
					//Write headers & return response
					headers.set('alt-text', altText);

					return new Response(clonedResponse.body, {
						status: 200,
						headers,
					});
				} else {
					//Get alt-text from db
					const altText = (await getAltTextFromDB(this.env, key)) as string;
					headers.set('alt-text', altText);

					return new Response(object.body, {
						status: 200,
						headers,
					});
				}
			}
			case 'POST': {
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
