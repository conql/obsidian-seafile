import { arrayBufferToHex } from "obsidian";
import pThrottle from "p-throttle";
import { PlatformPath } from "path/posix";
import { Commit, SeafFs } from "./server";

export const Path = (require("path-browserify").posix) as PlatformPath;

export class FormData {
    private boundary: string;
    private data: any[];

    constructor() {
        this.boundary = crypto.randomUUID();
        this.data = []
    }

    append(name: string, value: string | ArrayBuffer | Buffer, filename?: string): void {
        if (this.data.length > 0) {
            this.data.push(`\r\n`)
        }
        this.data.push(`--${this.boundary}\r\n`)
        this.data.push(`Content-Disposition: form-data; name="${name}"`)
        if (filename) {
            this.data.push(`; filename="${filename}"`)
        }
        this.data.push(`\r\n\r\n`)

        this.data.push(value)
    }

    getArrayBuffer(): Promise<ArrayBuffer> {
        this.data.push(`\r\n--${this.boundary}--\r\n`)
        return new Blob(this.data).arrayBuffer()
    }

    getContentType(): string {
        return `multipart/form-data; boundary=${this.boundary}`
    }

}

// Memoize function with a limit on the cache size
type Func<T extends unknown[], V> = (...args: [...T]) => Promise<V>;
export function memoizeWithLimit<T extends unknown[], V>(fn: Func<T, V>, cacheLimit: number): Func<T, V> {
    let cache: Map<string, V | Promise<V>> = new Map(), cacheSize = 0;
    let keysQueue: Set<string> = new Set();

    return async (...args: [...T]): Promise<V> => {
        const key = JSON.stringify(args);

        if (cache.has(key)) { // cache hit
            let value = cache.get(key);
            if (value)
                return value;
        }

        // set result to cache first, to avoid duplicate requests
        let promise = fn(...args);
        cache.set(key, promise);
        cacheSize++;

        let result: V;
        try {
            result = await promise;
            cache.set(key, result);
        }
        catch (e) {
            cache.delete(key);
            cacheSize--;
            throw e;
        }

        if (keysQueue.has(key)) keysQueue.delete(key);
        keysQueue.add(key);

        if (cacheSize > cacheLimit) {
            let key = keysQueue.values().next().value;
            keysQueue.delete(key);
            cache.delete(key);
            cacheSize--;
        }

        return result;
    }
}

// Pack multiple requests into a single request
export function packRequest<FuncParamType, FuncRetType>
    (
        packFunc: (funcParamArray: Array<FuncParamType>) => Promise<Map<FuncParamType, FuncRetType>>,
        limit: number, interval: number, batchSize: number
    ) {
    type callback = { resolve: (value: FuncRetType) => void, reject: (reason: any) => void };
    let taskQueue: Map<FuncParamType, { callback: callback, stack: string }[]> = new Map();
    const throttled = pThrottle({ limit, interval })(async () => {


        // Take the first batchSize keys from the queue
        // append them to the tasks
        let keys = Array.from(taskQueue.keys()).slice(0, batchSize);
        if (keys.length == 0) return;

        let tasks: Map<FuncParamType, { callback: callback, stack: string }[]> = new Map();

        for (let key of keys) {
            tasks.set(key, taskQueue.get(key)!);
            taskQueue.delete(key);
        }

        let results;
        try {
            results = await packFunc(keys);
        }
        catch (e) {
            // packFunc failed, reject all tasks
            for (let [key, task] of tasks) {
                for (let cb of task) {
                    e.stack = e.stack + cb.stack;
                    cb.callback.reject(e);
                }
            }
            return;
        }

        // Resolve all tasks
        for (let [key, task] of tasks) {
            let result = results.get(key);
            if (result === undefined) {
                for (let cb of task) {
                    cb.callback.reject(new Error(`packFunc did not return a result for key ${key}`));
                }
            }
            else {
                for (let cb of task) {
                    cb.callback.resolve(result);
                }
            }
        }
    });

    return (key: FuncParamType): Promise<FuncRetType> => {
        let stack = new Error().stack ?? "";
        return new Promise<FuncRetType>((resolve, reject) => {
            if (!taskQueue.has(key)) taskQueue.set(key, []);
            taskQueue.get(key)!.push({ callback: { resolve, reject }, stack: stack });
            throttled();
        });
    }
}

export function strcmp(str1: string, str2: string) {
    return ((str1 == str2) ? 0 : ((str1 > str2) ? 1 : -1));
}

export function sha1(data: ArrayBuffer | string) {
    if (typeof data == "string") {
        data = new TextEncoder().encode(data);
    }
    return crypto.subtle.digest("SHA-1", data).then(hash => {
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, "0")).join("");
    });
}

export function stringifySeafFs(fs: SeafFs): string {
    // Stringify, add one space after colons and commas
    let str = JSON.stringify(fs, null, "/");
    str = str.replace(/\//g, "").replace(/,\n/g, ", ").replace(/\n/g, "");
    return str;
}

export async function computeFsId(fs: SeafFs): Promise<string> {
    let str = stringifySeafFs(fs);
    let fsId = await sha1(str);
    return fsId;
}

export async function computeCommitId(commit: Commit): Promise<string> {
    const encoder = new TextEncoder();

    const rootIdBytes = encoder.encode(commit.root_id + "\0");
    const creatorBytes = encoder.encode(commit.creator + "\0");
    const creatorNameBytes = commit.creator_name ? encoder.encode(commit.creator_name + "\0") : new Uint8Array();
    const descriptionBytes = encoder.encode(commit.description + "\0");
    const ctimeBytes = new DataView(new ArrayBuffer(8));
    ctimeBytes.setBigInt64(0, BigInt(commit.ctime), false);

    const data = new Uint8Array([
        ...rootIdBytes,
        ...creatorBytes,
        ...creatorNameBytes,
        ...descriptionBytes,
        ...new Uint8Array(ctimeBytes.buffer)
    ]);

    const digest = await crypto.subtle.digest('SHA-1', data);
    const commitId = arrayBufferToHex(digest)
    return commitId;
}

export async function computeBlocks(buffer: ArrayBuffer): Promise<Record<string, ArrayBuffer>> {
    const size = buffer.byteLength;

    let blocks: Record<string, ArrayBuffer> = {};
    let blockSize = 8 * 1024 * 1024; // 8MB
    let numBlocks = Math.ceil(size / blockSize);
    for (let i = 0; i < numBlocks; i++) {
        let block = buffer.slice(i * blockSize, (i + 1) * blockSize);
        let hash = await sha1(block);
        blocks[hash] = block;
    }

    return blocks;
}

// Faster way to convert an array buffer to a base64 string
export function arrayBufferToBase64(buffer: ArrayBuffer) {
    return new Promise<string>((resolve, reject) => {
        let blob = new Blob([buffer], { type: 'application/octet-binary' });
        let fileReader = new FileReader();
        fileReader.onload = function () {
            let dataUrl = fileReader.result;
            if (typeof dataUrl !== 'string')
                return reject(new Error("dataUrl is not a string"));
            let base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
            resolve(base64);
        };
        fileReader.readAsDataURL(blob);
    });
}

export function concatTypedArrays(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
}

export function splitFirstSlash(path: string) {
    const firstSlash = path.indexOf("/");
    if (firstSlash == -1) return [path, ""];
    const [first, rest] = [path.slice(0, firstSlash), path.slice(firstSlash + 1)];
    return [first, rest];
}

export let debug: Console = {} as Console;
for (let key in console) {
    if (typeof (console as any)[key] == "function") {
        (debug as any)[key] = (console as any)[key].bind(console);
    }
}

export function disableDebug() {
    for (let key in debug) {
        (debug as any)[key] = () => { };
    }
}