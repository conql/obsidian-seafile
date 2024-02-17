import { DataAdapter } from "obsidian";
import { DATA_DIR } from "../config";
import { FileSeafDirent, MODE_FILE, SeafDirent, SeafFs } from "../server";
import * as utils from "../utils";
import { debug } from "../utils";

export type STATE_DOWNLOAD = {
    type: "download",
    param: number
}
export type STATE_UPLOAD = {
    type: "upload",
    param: {
        progress: number,
        fs: SeafFs | null,
        blocks?: Record<string, ArrayBuffer>
    }
}
export type STATE_SYNC = {
    type: "sync"
}
export type STATE_INIT = {
    type: "init"
}
export type STATE_DELETE = {
    type: "delete"
}

export type SyncState = STATE_INIT | STATE_DOWNLOAD | STATE_UPLOAD | STATE_SYNC | STATE_DELETE;

export type SyncStateChangedListener = (node: SyncNode) => void;

export class SyncNode {
    public readonly path: string;
    private children: Record<string, SyncNode> = {};
    private _prev?: SeafDirent;
    public prevDirty = true; // prev means the last synced state
    public next?: SeafDirent;
    public nextDirty = true; // next means the pending upload state

    private constructor(
        private adapter: DataAdapter,
        public readonly name: string,
        public onStateChanged: SyncStateChangedListener,
        public readonly parent?: SyncNode,
    ) {
        this.path = this.parent ? this.parent.path + "/" + this.name : this.name;
        this.state = { type: "init" };
    }

    private _state: SyncState;
    get state(): SyncState {
        return this._state;
    }
    set state(value: SyncState) {
        this._state = new Proxy(value, {
            set: (target, prop, value) => {
                Object.assign(target, { [prop]: value });
                this.onStateChanged?.(this);
                return true;
            }
        });
        this.onStateChanged?.(this);
    }

    public static async loadPath(adapter: DataAdapter, onStateChanged: SyncStateChangedListener, realPath: string = DATA_DIR, parent?: SyncNode): Promise<SyncNode> {
        let metadata: SeafDirent;
        try {
            metadata = JSON.parse(await adapter.read(realPath + "/metadata.json"));
            const node = new SyncNode(adapter, metadata.name, onStateChanged, parent); // Use dirent name instead of path name
            node.prev = metadata;
            node.prevDirty = true;

            const children = await adapter.list(realPath);
            let childrenDirty = false;

            for (let childPath of children.folders) {
                const child = await SyncNode.loadPath(adapter, onStateChanged, childPath, node);
                node.addChild(child);
                if (child.prevDirty) childrenDirty = true;
            }

            for (let childPath of children.files) {
                const childName = utils.Path.basename(childPath);
                if (childName === "metadata.json") continue;
                const childPrev: FileSeafDirent = JSON.parse(await adapter.read(realPath + "/" + childName));
                const stat = await adapter.stat(childPath);
                const child = new SyncNode(adapter, childPrev.name, onStateChanged, node);
                child.prev = childPrev;
                child.prevDirty =
                    (
                        stat != null &&
                        Math.floor(stat.mtime / 1000) === childPrev.mtime &&
                        stat.size === childPrev.size
                    )
                if (child.prevDirty)
                    childrenDirty = true;
                else {
                    child.state = { "type": "sync" }
                }
                node.addChild(child);
            }

            if (!childrenDirty) {
                node.prevDirty = false;
                node.state = { "type": "sync" }
            }
            return node;
        }
        catch (e) {
            const path = realPath.replace(DATA_DIR, "");
            debug.warn(`Cannot load metadata for "${path}", parent: ${parent?.name}`, e);
            return new SyncNode(adapter, path.split("/").pop() || "", onStateChanged, parent);
        }
    }

    private async saveDirent(dirent: SeafDirent | undefined) {
        const escapedPath = this.path.replace(/metadata.json$/, "#metadata.json");
        const savePath = DATA_DIR + escapedPath;

        if (!dirent) {
            // Delete
            const stat = await this.adapter.stat(savePath);
            if (stat?.type == "file") {
                await this.adapter.remove(savePath);
            }
            else if (stat?.type == "folder") {
                await this.adapter.rmdir(savePath, true);
            }
        }
        else {
            if (dirent.mode == MODE_FILE) {
                const baseFolder = savePath.slice(0, savePath.lastIndexOf("/"));
                if (!await this.adapter.exists(baseFolder)) await this.adapter.mkdir(baseFolder);
                await this.adapter.write(savePath, JSON.stringify(dirent));
            }
            else {
                if (!await this.adapter.exists(savePath)) await this.adapter.mkdir(savePath);
                await this.adapter.write(savePath + "/metadata.json", JSON.stringify(dirent));
            }
        }
    }

    exec(path: string, callback: (node: SyncNode) => boolean, order: "pre" | "post" = "pre", throwError = true): boolean {
        while (path.startsWith("/")) path = path.slice(1);

        let [first, rest] = utils.splitFirstSlash(path);
        while (!first && rest) {
            [first, rest] = utils.splitFirstSlash(rest);
        }

        if (order == "pre") {
            if (callback(this))
                return true;
        }
        if (first) {
            const child = this.children[first];
            if (!child) {
                if (throwError)
                    throw new Error("Cannot find child " + first);
            }
            else {
                if (rest) {
                    if (child.exec(rest, callback, order, throwError)) {
                        return true;
                    }
                }
                else {
                    if (callback(child))
                        return true;
                }
            }
        }
        if (order == "post") {
            if (callback(this))
                return true;
        }

        return false;
    }

    find(path: string): SyncNode | null {
        let found: SyncNode | null = null;
        try {
            this.exec(path, (node) => {
                found = node;
                return true;
            }, "post", true);
            return found;
        }
        catch {
            return null;
        }
    }

    setDirty(path: string) {
        this.exec(path, (node) => {
            node.prevDirty = true;
            if (node.next) {
                node.nextDirty = true;
            }
            node.state = { "type": "init" }

            return false;
        }, "post", false);
    }

    private addChild(node: SyncNode) {
        this.children[node.name] = node;
    }

    createChild(name: string, onStateChanged: SyncStateChangedListener) {
        const child = new SyncNode(this.adapter, name, onStateChanged, this);
        this.addChild(child);
        return child;
    }

    removeChild(node: SyncNode) {
        if (this.children.hasOwnProperty(node.name)) {
            delete this.children[node.name];
        }
    }

    clearChildren() {
        Object.keys(this.children).forEach((name) => {
            delete this.children[name];
        });
    }

    setNext(next?: SeafDirent, dirty = true) {
        this.next = next;
        this.nextDirty = dirty;
    }

    get prev(): SeafDirent | undefined {
        return this._prev;
    }

    private set prev(value: SeafDirent | undefined) {
        this._prev = value;
    }

    async setPrevAsync(prev?: SeafDirent, dirty = true) {
        this.prevDirty = dirty;
        this.prev = prev;
        await this.saveDirent(this.prev);
    }

    async applyNext() {
        await this.setPrevAsync(this.next, this.nextDirty);
        this.setNext(undefined, true);
        if (!this.prevDirty) {
            this.state = { "type": "sync" }
        }
    }

    getChildren(): Record<string, SyncNode> {
        return this.children;
    }

    async delete() {
        if (this.parent) {
            this.parent.removeChild(this);
        }
        await this.setPrevAsync(undefined, true);
        this.state = { "type": "delete" }
    }

    toJson() {
        let cjson: Record<string, any> = {}
        Object.entries(this.children).forEach(([name, node]) => {
            cjson[name] = node.toJson();
        });
        return {
            name: this.name,
            prevDirty: this.prevDirty,
            prev: this.prev,
            nextDirty: this.nextDirty,
            next: this.next,
            children: cjson
        }
    }
}