import { Env } from './environment';

/**
 * Generates a descriptive text of an image using uform-gen2-qwen model
 *
 * @author Nathan Abuaku
 * @param env - interface: bindings to Cloudflare services
 * @param image - string: The name of the Image file, must be unique.
 * @returns - string: an AI generated description of the processed image.
 */
export async function generateAltTex(env: Env, image: ArrayBuffer): Promise<string> {
	const image_blob = [...new Uint8Array(image)];
	const input = {
		image: image_blob,
		prompt: 'Generate a brief, but descriptive alt text for this image. Infer what is happening in the image and provide some context',
		max_tokens: 512,
	};

	//Generate a description via request to AI & store desription in 'altText' variable
	const model = '@cf/unum/uform-gen2-qwen-500m';
	const aiResponse = await env.AI.run(model, input);
	const altText = aiResponse['description'] as string;
	return altText;
}
