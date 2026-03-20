/**
 * @author Nathan Abuaku
 * @param request - an http request
 * @returns either an HTTP response or nothing.
 */
// export async function validateImageFile(env: Env, request: Request): Promise<any> {
// 	const contentType = request.headers.get('Content-Type');
// 	const contentLength = request.headers.get('Content-Length');
// 	if (contentType == undefined || !['image/jpg', 'image/png', 'image/webp'].includes(contentType)) {
// 		return new Response('Invalid Content Type', { status: 400 });
// 	}

// }

/**
 * @author Nathan Abuaku
 * @param request
 * @returns
 */
export async function getFileType(contentType: string): Promise<Response | string> {
	switch (contentType) {
		case 'img/jpg':
			return '.jpg';
		case 'img/png':
			return '.png';
		case 'img/webp':
			return '.webp';
		default:
			return new Response('Unsupported File Type', { status: 400 });
	}
}

/**
 * @author Nathan Abuaku
 * @param request
 * @returns
 */
export async function getContentType(request: Request): Promise<Response | string> {
	const incomingRequest = request.clone();
	const contentTypeHeader = incomingRequest.headers.get('Content-Type');
	if (contentTypeHeader != null) {
		const contentType = contentTypeHeader;
		return contentType;
	}
	return new Response('Unsupported Media Type', { status: 415 });
}
