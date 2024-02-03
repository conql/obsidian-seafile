import { assert } from "console";
import Storage from "./storage";
import Server, { DirSeafDirent, DirSeafFs, FileSeafDirent, MODE_DIR, MODE_FILE, SeafDirent, SeafFs, ZeroFs } from "./server";
import * as utils from "./utils";

export type STATE_DOWNLOAD = {
    type: "download",
    param: number
}
export type STATE_UPLOAD = {
    type: "upload",
    param: {
        progress: number,
        fs: SeafFs,
        blocks?: Record<string, ArrayBuffer>
    }
}
export type STATE_SYNC = {
    type: "sync"
}
export type STATE_MODIFIED = {
    type: "modified"
}

export type SyncState = STATE_DOWNLOAD | STATE_UPLOAD | STATE_SYNC | STATE_MODIFIED;

export type SyncNodeListener = (node: SyncNode) => void;
export class SyncNode {
    parent?: SyncNode;
    name: string;
    dirty: boolean;
    cache?: SeafDirent;
    children: Record<string, SyncNode>;

    private constructor() {

    }

    private _state: SyncState;
    get state(): SyncState {
        return this._state;
    }
    set state(value: SyncState) {
        this._state = new Proxy(value, {
            set: (target, prop, value) => {
                this.notify(this);
                return true;
            }
        });
    }

    listener: SyncNodeListener;
    private notify(node: SyncNode, path: String = "") {
        if (this.listener) {
            this.listener(node);
        }
        this.parent?.notify(node, utils.Path.join(this.name, path));
    }

    static create(name: string, state: SyncState, dirty: boolean, cache?: SeafDirent): SyncNode {
        let node = new SyncNode();
        node.name = name;
        node.dirty = dirty;
        node.cache = cache;
        node.children = {};
        node.state = state;
        return node;
    }

    exec(path: string, callback: (node: SyncNode) => boolean, order: "pre" | "post" = "pre", throwError = true): boolean {
        let [first, rest] = utils.splitFirstSlash(path);
        while (!first && rest) {
            [first, rest] = utils.splitFirstSlash(rest);
        }

        if (order == "pre") {
            if (callback(this)) return true;
        }
        if (first) {
            const child = this.children[first];
            if (!child) {
                if (throwError) throw new Error("Cannot find child " + first);
                return true;
            }
            if (rest) {
                if (child.exec(rest, callback, order, throwError)) {
                    return true;
                }
            }
            else
                if (callback(child)) return true;
        }
        if (order == "post") {
            if (callback(this)) return true;
        }

        return false;
    }

    find(path: string): SyncNode {
        let found: SyncNode | null = null;
        this.exec(path, (node) => {
            found = node;
            return true;
        }, "post", true);
        return found!;
    }

    addChild(node: SyncNode) {
        this.children[node.name] = node;
        node.parent = this;
    }

    removeChild(node: SyncNode) {
        if (this.children.hasOwnProperty(node.name)) {
            this.children[node.name].parent = undefined;
            delete this.children[node.name];
        }
    }

    clearChildren() {
        Object.keys(this.children).forEach((name) => {
            this.children[name].parent = undefined;
            delete this.children[name];
        });
    }

    toJson() {
        let cjson: Record<string, any> = {}
        Object.entries(this.children).forEach(([name, node]) => {
            cjson[name] = node.toJson();
        });
        return {
            name: this.name,
            dirty: this.dirty,
            cache: this.cache,
            children: cjson
        }
    }
}

export class Sync {
    public constructor(private server: Server, private storage: Storage, private account: string) {

    }

    public async pull(uploads: Set<SyncNode>, path: string, node?: SyncNode, remote?: SeafDirent) {
        // Step 1. Check file status: same, Local, remote, merge, conflict
        const local = await this.storage.stat(path);
        
        let status = null;
        // Same:
        // - both are null
        // - cache not dirty, cache id == remote id
        // - mtime is same, type is file, size is same
        if (
            (!local && !remote) ||
            (node && node.cache && remote && node.dirty === false && node.cache.id === remote.id) ||
            (local?.mtime === remote?.mtime && local?.type == "file" && remote?.mode == MODE_FILE && local?.size === (remote?.size))
        ) {
            status = "same";
            if (!node) {
                node = SyncNode.create(remote!.name, { type: "sync" }, false, remote!);
            }
            return [node];
        }
        // Local:
        // remote id matches cache id
        else if (node && node.cache && node.cache.id === remote?.id) {
            status = "local";
        }

        // Remote:
        // Cache not dirty
        else if (!node || node.dirty === false) {
            status = "remote";
        }

        // Merge:
        // Both are folders
        else if (local && remote && local.type == "folder" && remote.mode == MODE_FILE) {
            status = "merge";
        }
        // Conflict:
        // One is a file
        else {
            status = "conflict";
        }

        // Step 2. Resolve conflicts
        // TO DO
        assert(status != "conflict");

        // Step 3. Update and merge

        // 3.1 Branching
        let newChildrenNames: Set<string> | null = null;
        let newRemote: Record<string, SeafDirent> = {};

        if ((status == "local" || status == "merge") && local && local.type == "folder") {
            const list = await this.storage.list(path);
            if (!newChildrenNames) newChildrenNames = new Set();
            list.forEach((name) => {
                newChildrenNames!.add(name);
            });
        }
        else if ((status == "remote" || status == "merge") && remote && remote.mode == MODE_DIR) {
            const fs = (await this.server.getFs(remote.id)) as (DirSeafFs | ZeroFs);
            if (!newChildrenNames) newChildrenNames = new Set();
            if (fs !== ZeroFs) {
                fs.dirents.forEach((dirent) => {
                    newRemote[dirent.name] = dirent;
                    newChildrenNames!.add(dirent.name);
                });
            }
        }

        // null means no need to pull every children
        let newChildren: SyncNode[] = [];
        if (newChildrenNames) {
            if (node && node.cache) {
                Object.keys(node.children).forEach((name) => {
                    newChildrenNames!.add(name);
                });
            }

            if (status == "remote" && !local) {
                await this.storage.mkdir(path);
            }

            newChildren = await Promise.all([...newChildrenNames].map(async (name) => {
                return await this.pull(uploads, utils.Path.join(path, name), node?.children[name], newRemote[name]);
            })).then(t => t.flat() as SyncNode[]);

            // After pulling children, merge status is changed to local
            if (status == "merge") {
                status = "local";
            }
        }

        // 3.2 Updating
        if (status == "remote") {
            if (!remote) {
                if (!local) return [];
                if (local.type == "file") {
                    await this.storage.remove(path);
                }
                else {
                    await this.storage.rmdir(path, true);
                }
                return [];
            }
            else {
                if (!node)
                    node = SyncNode.create(remote.name, { type: "download", param: 0 }, true, remote);
                if (remote.mode == MODE_FILE) {
                    await this.server.downloadFile(path, remote.id, true, remote.mtime);
                    node.cache = remote;
                    node.dirty = false;
                    node.children = {};
                    node.state = { type: "sync" };

                    return [node];
                }
                else {
                    node.cache = remote;
                    // Let below code to recompute dirent and fs
                }
            }
        }

        if (status == "local") {
            if (!local)
                return [];
            else if (local.type === "file") {
                const [dirent, fs, blocks] = await this.computeFileDirent(path, this.account);
                const newNode = SyncNode.create(dirent.name, { type: "upload", param: { progress: 0, fs, blocks } }, true, dirent);
                uploads.add(newNode);
                return [newNode];
            }
        }

        // Recomputing dirent and fs base on current local folder
        const mtime = node?.cache?.mtime;
        const [dirent, fs] = await this.computeDirDirent(path, newChildren.map((child) => child.cache!), mtime);
        if (node && dirent.id === node.cache?.id) {
            node.cache = dirent;
            node.dirty = false;
            node.clearChildren();
            newChildren.forEach((child) => {
                node!.addChild(child);
            });
            node.state = { type: "sync" };
            return [node];
        }
        else {
            const newNode = SyncNode.create(dirent.name, { type: "upload", param: { progress: 0, fs } }, false, dirent);
            newChildren.forEach((child) => {
                newNode.addChild(child);
            });
            uploads.add(newNode);
            return [newNode];
        }
    }

    async computeFileDirent(path: string, modifier: string): Promise<[FileSeafDirent, SeafFs, Record<string, ArrayBuffer>]> {
        const stat = await this.storage.stat(path);
        if (!stat) throw new Error("Cannot compute fs of non-existent file");

        const blockBuffer: Record<string, ArrayBuffer> = {};
        let fsId: string, fs: SeafFs;

        if (stat.size == 0) {
            [fsId, fs] = [ZeroFs, ZeroFs];
        }
        else {
            // to do: warn if file too large
            const buffer = await this.storage.readBinary(path);
            let blocks: Record<string, ArrayBuffer> = await utils.computeBlocks(buffer);

            let entries = Object.entries(blocks);
            if (entries.length == 1) {
                let [blockId, block] = entries[0] as [string, ArrayBuffer];
                // if only one block and it is smaller than 32kb, we put it in buffer
                if (block.byteLength < 32 * 1024)
                    blockBuffer[blockId] = block;
            }

            fs = {
                block_ids: Object.keys(blocks),
                size: stat.size,
                type: 1,
                version: 1,
            }
            fsId = await utils.computeFsId(fs);
        }

        let dirent: FileSeafDirent = {
            id: fsId,
            mode: MODE_FILE,
            modifier,
            mtime: Math.floor(stat.mtime / 1000),
            name: utils.Path.basename(path),
            size: stat.size,
        };

        return [dirent, fs, blockBuffer];
    }

    async computeDirDirent(path: string, children: SeafDirent[], defaultMtime?: number): Promise<[DirSeafDirent, SeafFs]> {
        const name = utils.Path.basename(path);
        const createDirFs = async (): Promise<[string, SeafFs]> => {
            let count = Object.keys(children).length;
            if (count === 0)
                return [ZeroFs, ZeroFs];

            let childrenDirents = Object.values(children);

            childrenDirents.sort((a, b) => {
                return utils.strcmp((b as SeafDirent).name, (a as SeafDirent).name);
            });

            let fs: DirSeafFs = {
                dirents: childrenDirents,
                type: 3,
                version: 1,
            }
            let fsId = await utils.computeFsId(fs);
            return [fsId, fs];
        }

        const [fsId, fs] = await createDirFs();

        let mtime = defaultMtime;
        if (!mtime) {
            mtime = -1;
            for (let child of children) {
                if (child.mtime > mtime)
                    mtime = child.mtime;
            }
            if (mtime === -1) {
                mtime = (defaultMtime) ?? Math.floor(new Date().getTime() / 1000);
            }
        }

        let dirent: DirSeafDirent = {
            id: fsId,
            mode: 16384,
            mtime,
            name,
        };

        return [dirent, fs];
    }


}