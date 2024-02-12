import * as fs from 'fs/promises';
import fetch from 'node-fetch';
import { App, DataAdapter, DataWriteOptions, ListedFiles, RequestUrlParam, RequestUrlResponsePromise, Stat } from "obsidian"
import { PlatformPath } from 'path/posix';
export const Path = (require("path-browserify").posix) as PlatformPath;

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

export function arrayBufferToHex(data: ArrayBuffer): string {
    // Create a view for the ArrayBuffer
    const view = new Uint8Array(data);
    // Convert each byte in the ArrayBuffer to its hexadecimal representation
    // and join them together to form the final string
    const hex = Array.from(view).map(byte => byte.toString(16).padStart(2, '0')).join('');
    return hex;
}

class MockDataAdapter implements DataAdapter {
    private cwdPath: string = Path.join(process.cwd(), "temp")

    private resolvePath(filePath: string): string {
        return Path.join(this.cwdPath, filePath);
    }
    private async updateModificationTime(absPath: string, mtime: Date): Promise<void> {
        await fs.utimes(absPath, new Date(), mtime);
    }

    getName(): string {
        throw new Error('Method not implemented.');
    }
    async exists(normalizedPath: string, sensitive?: boolean | undefined): Promise<boolean> {
        normalizedPath = this.resolvePath(normalizedPath);
        try {
            await fs.access(normalizedPath);
            return true;
        } catch {
            return false;
        }
    }
    async stat(normalizedPath: string): Promise<Stat | null> {
        normalizedPath = this.resolvePath(normalizedPath);
        try {
            const stats = await fs.stat(normalizedPath);
            return {
                type: stats.isFile() ? "file" : "folder",
                size: stats.size,
                ctime: stats.ctime.getTime(),
                mtime: stats.mtime.getTime(),
            };
        } catch {
            return null;
        }
    }
    async list(normalizedPath: string): Promise<ListedFiles> {
        const resolvedPath = this.resolvePath(normalizedPath);
        const files = await fs.readdir(resolvedPath, { withFileTypes: true });
        const listedFiles: ListedFiles = {
            files: files.filter(f => f.isFile()).map(f => Path.join(normalizedPath, f.name)),
            folders: files.filter(f => f.isDirectory()).map(f => Path.join(normalizedPath, f.name)),
        }
        return listedFiles;
    }
    async read(normalizedPath: string): Promise<string> {
        normalizedPath = this.resolvePath(normalizedPath);
        return await fs.readFile(normalizedPath, 'utf-8');
    }
    async readBinary(normalizedPath: string): Promise<ArrayBuffer> {
        normalizedPath = this.resolvePath(normalizedPath);
        const buffer = await fs.readFile(normalizedPath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    async write(normalizedPath: string, data: string, options?: DataWriteOptions | undefined): Promise<void> {
        normalizedPath = this.resolvePath(normalizedPath);
        await fs.writeFile(normalizedPath, data);
        if (options?.mtime) {
            await this.updateModificationTime(normalizedPath, new Date(options.mtime));
        }
    }
    async writeBinary(normalizedPath: string, data: ArrayBuffer, options?: DataWriteOptions | undefined): Promise<void> {
        normalizedPath = this.resolvePath(normalizedPath);
        const buffer = Buffer.from(data);
        await fs.writeFile(normalizedPath, buffer);
        if (options?.mtime) {
            await this.updateModificationTime(normalizedPath, new Date(options.mtime));
        }
    }
    async append(normalizedPath: string, data: DataView | string, options?: DataWriteOptions | undefined): Promise<void> {
        normalizedPath = this.resolvePath(normalizedPath);
        const buffer = typeof data === 'string' ? data : Buffer.from(data.buffer);
        await fs.appendFile(normalizedPath, buffer);
        if (options?.mtime) {
            await this.updateModificationTime(normalizedPath, new Date(options.mtime));
        }
    }
    process(normalizedPath: string, fn: (data: string) => string, options?: DataWriteOptions | undefined): Promise<string> {
        throw new Error('Method not implemented.');
    }
    getResourcePath(normalizedPath: string): string {
        throw new Error('Method not implemented.');
    }
    async mkdir(normalizedPath: string): Promise<void> {
        await fs.mkdir(this.resolvePath(normalizedPath), { recursive: true });
    }
    trashSystem(normalizedPath: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    trashLocal(normalizedPath: string): Promise<void> {
        throw new Error('Method not implemented.');
    }
    async rmdir(normalizedPath: string, recursive: boolean): Promise<void> {
        await fs.rm(this.resolvePath(normalizedPath), { recursive });
    }
    async remove(normalizedPath: string): Promise<void> {
        await fs.rm(this.resolvePath(normalizedPath));
    }
    rename(normalizedPath: string, normalizedNewPath: string): Promise<void> {
        throw new Error('Method not implemented.');
    }
    copy(normalizedPath: string, normalizedNewPath: string): Promise<void> {
        throw new Error('Method not implemented.');
    }

}

global.app = {
    vault: {
        adapter: new MockDataAdapter()
    }
} as any as App;