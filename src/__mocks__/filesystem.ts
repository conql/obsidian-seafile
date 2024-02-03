import * as fs from 'fs/promises';
import { DataWriteOptions, Stat } from "obsidian"; // Define these types according to your needs
import * as utils from "../utils";

export default class Filesystem {
    private cwdPath: string = utils.Path.join(process.cwd(), "vault");

    private resolvePath(filePath: string): string {
        return utils.Path.join(this.cwdPath, filePath);
    }

    public async exists(filePath: string): Promise<boolean> {
        filePath = this.resolvePath(filePath);
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    public async readBinary(filePath: string): Promise<ArrayBuffer> {
        filePath = this.resolvePath(filePath);
        const buffer = await fs.readFile(filePath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }

    public async writeBinary(filePath: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<void> {
        filePath = this.resolvePath(filePath);
        const buffer = Buffer.from(data);
        await fs.writeFile(filePath, buffer);
        if (options?.mtime) {
            await this.updateModificationTime(filePath, new Date(options.mtime));
        }
    }

    public async append(filePath: string, data: ArrayBuffer | string, options?: DataWriteOptions): Promise<void> {
        filePath = this.resolvePath(filePath);
        const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
        await fs.appendFile(filePath, buffer);
        if (options?.mtime) {
            await this.updateModificationTime(filePath, new Date(options.mtime));
        }
    }

    public async stat(filePath: string): Promise<Stat | null> {
        filePath = this.resolvePath(filePath);
        try {
            const stats = await fs.stat(filePath);
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

    async computeBlocks(localPath: string): Promise<Record<string, ArrayBuffer>> {
        localPath = this.resolvePath(localPath);
        let stat = await this.stat(localPath);
        if (!stat) throw new Error(`File '${localPath}' does not exist.`);
        if (stat.type != "file") throw new Error(`Path '${localPath}' is not a file.`);

        if (stat.size === 0) {
            return {};
        }

        // if size > 50MB, warn user
        if (stat.size > 50 * 1024 * 1024) {
            console.warn(`File '${localPath}' is larger than 50MB. This may take a while or even crash obsidian.`);
        }

        let blocks: Record<string, ArrayBuffer> = {};
        let buffer = await this.readBinary(localPath);
        let blockSize = 8 * 1024 * 1024; // 8MB
        let numBlocks = Math.ceil(stat.size / blockSize);
        for (let i = 0; i < numBlocks; i++) {
            let blockStart = i * blockSize;
            let blockEnd = blockStart + blockSize;
            let block = buffer.slice(blockStart, blockEnd);
            let hash = await utils.sha1(block); // Ensure utils.sha1 can handle ArrayBuffer or adjust accordingly
            blocks[hash] = block;
        }

        return blocks;
    }

    private async updateModificationTime(absPath: string, mtime: Date): Promise<void> {
        await fs.utimes(absPath, new Date(), mtime);
    }
}
