import { DataWriteOptions, Stat } from "obsidian";
import * as utils from "./utils";

export default class Filesystem {
    public async exists(path: string): Promise<boolean> {
        return false;
    }
    public async readBinary(path: string): Promise<ArrayBuffer> {
        return app.vault.adapter.readBinary(path);
    }
    public async writeBinary(path: string, data: ArrayBuffer, options: DataWriteOptions) {
        return app.vault.adapter.writeBinary(path, data, options);
    }
    public async append(path: string, data: ArrayBuffer | String, options: DataWriteOptions) {
        return app.vault.adapter.append(path, data as unknown as string, options);
    }
    public async stat(path: string): Promise<Stat | null> {
        return app.vault.adapter.stat(path);
    }
    
    async computeBlocks(localPath: string): Promise<Record<string, ArrayBuffer>> {
        let stat = await this.stat(localPath);
        if (!stat) throw new Error(`File '${localPath}' does not exist.`);
        if (stat.type != "file") throw new Error(`Path '${localPath}' is not a file.`);

        if (stat.size == 0) {
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
            let block = buffer.slice(i * blockSize, (i + 1) * blockSize);
            let hash = await utils.sha1(block);
            blocks[hash] = block;
        }

        return blocks;
    }
}