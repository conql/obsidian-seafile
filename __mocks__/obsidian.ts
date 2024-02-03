import fetch from 'node-fetch';


/**
 * Similar to `fetch()`, request a URL using HTTP/HTTPS, without any CORS restrictions.
 * @public
 */
export function requestUrl(request: RequestUrlParam | string): RequestUrlResponsePromise {
    if (typeof request === "string") request = { url: request };
    if (request.body && typeof request.body !== "string") request.body = Buffer.from(request.body as ArrayBuffer)
    if (request.contentType) {
        if (!request.headers) request.headers = {}
        request.headers["Content-Type"] = request.contentType
    }

    const resp = fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body as Buffer,
    });
    const decoder = new TextDecoder();
    const ret = resp.then(async (resp) => {
        const arrayBuffer = await resp.arrayBuffer();
        const text = decoder.decode(arrayBuffer);
        try {
            var json = JSON.parse(text);
        }
        catch (e) {
            json = {};
        }
        return {
            status: resp.status,
            headers: Object.fromEntries(resp.headers.entries()),
            arrayBuffer,
            text,
            json,
        };
    }) as RequestUrlResponsePromise;

    return ret;
}

/** @public */
export interface RequestUrlParam {
    /** @public */
    url: string;
    /** @public */
    method?: string;
    /** @public */
    contentType?: string;
    /** @public */
    body?: string | ArrayBuffer;
    /** @public */
    headers?: Record<string, string>;
    /**
     * Whether to throw an error when the status code is 400+
     * Defaults to true
     * @public
     */
    throw?: boolean;
}

/** @public */
export interface RequestUrlResponse {
    /** @public */
    status: number;
    /** @public */
    headers: Record<string, string>;
    /** @public */
    arrayBuffer: ArrayBuffer;
    /** @public */
    json: any;
    /** @public */
    text: string;
}

/** @public */
export interface RequestUrlResponsePromise extends Promise<RequestUrlResponse> {
    /** @public */
    arrayBuffer: Promise<ArrayBuffer>;
    /** @public */
    json: Promise<any>;
    /** @public */
    text: Promise<string>;
}
