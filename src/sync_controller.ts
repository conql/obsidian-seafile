import { assert } from "console";
import * as IgnoreParser from 'gitignore-parser';
import Server, { DirSeafDirent, DirSeafFs, FileSeafDirent, FileSeafFs, MODE_DIR, MODE_FILE, SeafDirent, SeafFs, ZeroFs } from "./server";
import { STATE_UPLOAD, SyncNode } from "./sync_node";
import * as utils from "./utils";
import { HEAD_COMMIT_PATH } from "./config";
import { Plugin } from "obsidian";

const adapter = app.vault.adapter;

export class SyncController {
    private account: string;
    private ignore: {
        accepts(input: string): boolean;
        denies(input: string): boolean;
        maybe(input: string): boolean;
    };

    public constructor(
        private interval: number,
        private server: Server,
        private nodeRoot: SyncNode,
        private ignorePattern: string = "") {
        this.account = server.getAccount();
        const selfIgnorePath = '/.obsidian/plugins/obsidian-seafile';
        this.ignore = IgnoreParser.compile(ignorePattern);
        if (this.ignore.accepts(selfIgnorePath)) {
            this.ignore = IgnoreParser.compile(this.ignorePattern + '\n' + selfIgnorePath);
        }
    }

    async downloadFile(path: string, fsId: string, mtime: number) {
        await adapter.write(path, "");

        if (fsId == ZeroFs) {
            await adapter.write(path, "", { mtime: mtime * 1000 });
            return;
        }

        const fs = await this.server.getFs(fsId) as FileSeafFs;
        for (let blockId of fs.block_ids) {
            const block = await this.server.getBlock(blockId);
            await adapter.append(path, new DataView(block) as any as string, { mtime: mtime * 1000 });
        }
    }

    public async pull(uploads: Set<SyncNode>, path: string, node: SyncNode, remote?: SeafDirent) {
        // Step 0. Check ignore pattern
        if (this.ignore.denies(path)) {
            if (remote) {
                await node.setPrevAsync(remote, false);
                node.state = { type: "sync" };
                return;
            }
            else {
                await node.delete();
                return;
            }
        }

        // Step 1. Check file status: same, local, remote, merge, conflict
        const local = await adapter.stat(path);

        let target = null;
        // Same:
        // - both are null
        // - prev not dirty, prev id == remote id
        // - mtime is same, type is file, size is same
        if (
            (!local && !remote) ||
            (node && node.prev && remote && node.prevDirty === false && node.prev.id === remote.id) ||
            (local && remote && local.mtime === remote.mtime * 1000 && local.type == "file" && remote.mode == MODE_FILE && local.size === remote.size && false)
        ) {
            target = "same";
            await node.setPrevAsync(remote!, false);
            node.state = { type: "sync" };
            return;
        }
        // Local:
        // prev and remote is null
        // prev and remote have same id
        else if (
            (!remote && !node.prev) ||
            (node.prev && remote && node.prev.id === remote.id)
        ) {
            target = "local";
        }

        // Remote: Local matches prev
        // prev is not dirty
        // prev and local is null
        // prev and local are files, prev mtime and size matches local
        else if (
            (!node.prevDirty) ||
            (!local && !node.prev) ||
            (node.prev?.mode == MODE_FILE && local?.type == "file" && node.prev.mtime === Math.floor(local.mtime / 1000) && node.prev.size === local.size)
        ) {
            target = "remote";
        }

        // Merge:
        // Both are folders
        else if (local && remote && local.type == "folder" && remote.mode == MODE_DIR) {
            target = "merge";
        }
        // Conflict:
        // One is a file
        else {
            target = "conflict";
        }



        // Step 2. Resolve conflicts
        if (target == "conflict")
            throw new Error("To do: resolve conflicts.");



        // Step 3. Update and merge
        // 3.1 Branching
        let newChildrenNames: Set<string> | null = null;
        let newRemote: Record<string, SeafDirent> = {};

        if ((target == "local" || target == "merge") && local && local.type == "folder") {
            const fileList = await adapter.list(path);
            const list = [...fileList.files, ...fileList.folders];
            if (!newChildrenNames) newChildrenNames = new Set();
            for (let name of list) {
                newChildrenNames.add(name);
            }
        }
        if ((target == "remote" || target == "merge") && remote && remote.mode == MODE_DIR) {
            const fs = (await this.server.getFs(remote.id)) as (DirSeafFs | ZeroFs);
            if (!newChildrenNames) newChildrenNames = new Set();
            if (fs !== ZeroFs) {
                for (let dirent of fs.dirents) {
                    newRemote[dirent.name] = dirent;
                    newChildrenNames.add(dirent.name);
                }
            }
        }


        const nodeChildren = node.getChildren();

        // null means no need to pull children
        if (newChildrenNames) {
            for (let name in nodeChildren) {
                newChildrenNames.add(name);
            }

            if (target == "remote" && !local) {
                await adapter.mkdir(path);
            }

            let promises = [];
            for (let name of newChildrenNames) {
                let nodeChild = nodeChildren[name] ?? node.createChild(name);
                let remoteChild = target == "local" ? nodeChild.prev : newRemote[name];

                promises.push(
                    this.pull(
                        uploads,
                        utils.Path.join(path, name),
                        nodeChild,
                        remoteChild
                    ));
            }
            await Promise.all(promises);

            // After pulling children, merge status is changed to local
            if (target == "merge") {
                target = "local";
            }
        }

        // 3.2 Updating
        if (target == "remote") {
            if (!remote) {
                if (local) {
                    if (local.type == "file") {
                        await adapter.remove(path);
                    }
                    else {
                        await adapter.rmdir(path, true);
                    }
                }
                node.delete();
                return;
            }
            else {
                if (remote.mode == MODE_FILE) {
                    await this.downloadFile(path, remote.id, remote.mtime);
                    await node.setPrevAsync(remote, false);
                    node.state = { type: "sync" };
                    return;
                }
                else {
                    await node.setPrevAsync(remote, true);
                    // Let below code to recompute dirent and fs
                }
            }
        }

        if (target == "local") {
            if (!local) {
                node.delete();
                return;
            }
            else if (local.type === "file") {
                const [dirent, fs, blocks] = await this.computeFileDirent(path, this.account);
                node.setNext(dirent, true);
                node.state = { type: "upload", param: { progress: 0, fs, blocks } };
                uploads.add(node);
                return;
            }
        }

        // Recomputing dirent and fs base on current local folder
        const mtime = node?.prev?.mtime;
        let dirents = [];
        for (let child of Object.values(nodeChildren)) {
            if (child.next) dirents.push(child.next);
            else if (child.prev) dirents.push(child.prev);
            else throw new Error("Cannot find next or prev of child");
        }

        const [dirent, fs] = await this.computeDirDirent(path, dirents, mtime);
        if (dirent.id === remote?.id) {
            await node.setPrevAsync(dirent, false);
            node.state = { type: "sync" };
            return;
        }
        else {
            node.setNext(dirent, false);
            node.state = { type: "upload", param: { progress: 0, fs } };
            uploads.add(node);
        }
    }

    async computeFileDirent(path: string, modifier: string): Promise<[FileSeafDirent, SeafFs, Record<string, ArrayBuffer>]> {
        const stat = await adapter.stat(path);
        if (!stat) throw new Error("Cannot compute fs of non-existent file");

        const blockBuffer: Record<string, ArrayBuffer> = {};
        let fsId: string, fs: SeafFs;

        if (stat.size == 0) {
            [fsId, fs] = [ZeroFs, ZeroFs];
        }
        else {
            // to do: warn if file too large
            const buffer = await adapter.readBinary(path);
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

    async computeBlocks(localPath: string): Promise<Record<string, ArrayBuffer>> {
        let stat = await adapter.stat(localPath);
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
        let buffer = await adapter.readBinary(localPath);
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

    async push(nodeRoot: SyncNode, uploads: Set<SyncNode>, parentCommitId: string): Promise<string> {
        if (!nodeRoot.next) {
            console.log("Nothing to push");
            return parentCommitId;
        }

        // Upload fs
        await Promise.all([...uploads].map(async (node) => {
            if (node.state.type !== "upload" || !node.next) {
                throw Error("Node is not ready for upload")
            }

            const param = (node.state as STATE_UPLOAD).param;
            if (param.blocks) {
                await Promise.all(Object.entries(param.blocks).map(async ([blockId, block]) => {
                    if (await this.server.checkBlock(blockId))
                        await this.server.sendBlock(blockId, block);
                }));
            }
            if (await this.server.checkFs(node.next.id))
                await this.server.sendFs([node.next.id, param.fs])
        }));

        // Create commit
        const commit = await this.server.createCommit(nodeRoot.next.id, "No Description", parentCommitId);
        await this.server.uploadCommit(commit);
        await this.server.setHeadCommit(commit.commit_id);

        // Update nodes
        for (let node of uploads) {
            await node.applyNext();
        }

        return commit.commit_id;
    }

    async notifyChange(path: string, type: "create" | "modify" | "delete") {
        if (type == "create") {
            if (this.nodeRoot.find(path)) return;
        }
        if (type == "delete") {
            if (!this.nodeRoot.find(path)) return;
        }

        this.nodeRoot.setDirty(path);
    }

    private localHead?: string;
    private async setLocalHeadAsync(commitId: string) {
        if (this.localHead != commitId) {
            this.localHead = commitId;
            await adapter.write(HEAD_COMMIT_PATH, this.localHead);
        }
    }

    async sync() {
        if (this.localHead === undefined) {
            if (await adapter.exists(HEAD_COMMIT_PATH)) {
                this.localHead = await adapter.read(HEAD_COMMIT_PATH)
            }
            else {
                this.localHead = ""
            }
        }

        const uploads = new Set<SyncNode>();
        const remoteHead = await this.server.getHeadCommitId();
        const remoteRoot = await this.server.getCommitRoot(remoteHead);

        console.time("Pull");
        await this.pull(uploads, "", this.nodeRoot, remoteRoot);
        console.timeEnd("Pull");

        await this.setLocalHeadAsync(this.localHead);

        console.time("Push");
        const newHead = await this.push(this.nodeRoot, uploads, this.localHead);
        console.time("Push");

        await this.setLocalHeadAsync(newHead);
    }

    private timeoutId: any;
    private _status: "idle" | "busy" | "stop" | "pendingStop" = "stop";
    public get status() { return this._status; }
    private set status(value) { this._status = value };

    startSync() {
        if (this.status == "stop") {
            this.status = "idle";
            this.syncCycle();
        }
        else if (this.status == "pendingStop") {
            this.status = "busy";
        }
        else if (this.status == "idle") {
            clearTimeout(this.timeoutId);
            this.syncCycle();
        }
    }

    async syncCycle() {
        if (this.status == "idle") {
            this.status = "busy";
            try {
                await this.sync();
            }
            catch (e) {
                console.error(e);
                this.status = "stop";
            }

            if (this.status as any != "pendingStop") {
                this.status = "idle";
                this.timeoutId = setTimeout(() => {
                    this.syncCycle();
                }, this.interval);
            }
            else {
                this.status = "stop";
            }
        }
    }

    stopSync() {
        if (this.status == "idle") {
            clearTimeout(this.timeoutId);
        }
        else if (this.status == "busy") {
            this.status = "pendingStop";
        }
    }
}