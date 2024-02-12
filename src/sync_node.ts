import { FileSeafDirent, MODE_FILE, SeafDirent, SeafFs } from "./server";
import * as utils from "./utils";
import { EventSource } from "./event_source";
import { DataAdapter } from "obsidian";
import { DATA_DIR } from "./config";

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
export type STATE_INIT = {
    type: "init"
}

export type SyncState = STATE_INIT | STATE_DOWNLOAD | STATE_UPLOAD | STATE_SYNC;

export type SyncNodeListener = (node: SyncNode) => void;

const adapter = app.vault.adapter;

export class SyncNode {
    private readonly path: string;
    private children: Record<string, SyncNode> = {};
    private _prev?: SeafDirent;
    public prevDirty = true; // prev means the last synced state
    public next?: SeafDirent;
    public nextDirty = true; // next means the pending upload state

    onChildrenChanged = new EventSource<SyncNodeListener>();
    onStateChanged = new EventSource<SyncNodeListener>();

    private constructor(
        public readonly name: string,
        public readonly parent?: SyncNode,
    ) {
        this.state = { type: "init" };
        this.path = this.parent ? this.parent.path + "/" + this.name : this.name;
    }

    private _state: SyncState;
    get state(): SyncState {
        return this._state;
    }
    set state(value: SyncState) {
        this._state = new Proxy(value, {
            set: (target, prop, value) => {
                Object.assign(target, { [prop]: value });
                this.onStateChanged.raise(this);
                return true;
            }
        });
        this.onStateChanged.raise(this);
    }

    /// Load the nodes from disk
    static async init(): Promise<SyncNode> {
        const loadPath = async (path: string, parent?: SyncNode): Promise<SyncNode> => {
            let metadata: SeafDirent;
            try {
                metadata = JSON.parse(await adapter.read(path + "/" + "metadata.json"));
                const node = new SyncNode(metadata.name, parent); // Use dirent name instead of path name
                node.prev = metadata;
                node.prevDirty = true;

                const children = await adapter.list(path);

                for (let childName of children.folders) {
                    const child = await loadPath(path + "/" + childName, node);
                    node.addChild(child);
                }

                for (let childName of children.files) {
                    try {
                        const childPrev: SeafDirent = JSON.parse(await adapter.read(path + "/" + childName));
                        const child = new SyncNode(childPrev.name, node);
                        child.prev = childPrev;
                        child.prevDirty = true;
                        node.addChild(child);
                    }
                    catch (e) {
                        // console.error(`Cannot load metadata for ${path + childName}, parent: ${parent?.name}`);
                        throw e;
                    }
                }

                return node;
            }
            catch (e) {
                // console.error(`Cannot load metadata for ${path}, parent: ${parent?.name}`);
                throw e;
            }
        }

        try {
            const root = await loadPath(DATA_DIR);
            return root;
        }
        catch {
            // Check if rootDataPath exists
            if (! await adapter.exists(DATA_DIR)) {
                await adapter.mkdir(DATA_DIR);
            }

            const root = new SyncNode("");
            return root;
        }
    }

    private async savePrev() {
        const escapedPath = this.path.replace(/metadata.json$/g, "#metadata.json");
        const savePath = DATA_DIR + escapedPath;

        if (!this.prev) {
            // Delete
            const stat = await adapter.stat(savePath);
            if (stat?.type == "file") {
                await adapter.remove(savePath);
            }
            else if (stat?.type == "folder") {
                await adapter.rmdir(savePath, true);
            }
        }
        else {
            if (this.prev.mode == MODE_FILE) {
                const baseFolder = savePath.slice(0, savePath.lastIndexOf("/"));
                if (!await adapter.exists(baseFolder)) await adapter.mkdir(baseFolder);
                await adapter.write(savePath, JSON.stringify(this.prev));
            }
            else {
                if (!await adapter.exists(savePath)) await adapter.mkdir(savePath);
                await adapter.write(savePath + "/metadata.json", JSON.stringify(this.prev));
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
        this.exec(path, (node) => {
            found = node;
            return true;
        }, "post", false);
        return found;
    }

    setDirty(path: string) {
        this.exec(path, (node) => {
            node.prevDirty = true;
            if (node.next) {
                node.nextDirty = true;
            }

            return false;
        }, "post", false);
    }

    private addChild(node: SyncNode) {
        this.children[node.name] = node;
        this.onChildrenChanged.raise(node);
    }

    createChild(name: string) {
        const child = new SyncNode(name, this);
        this.addChild(child);
        return child;
    }

    removeChild(node: SyncNode) {
        if (this.children.hasOwnProperty(node.name)) {
            this.onChildrenChanged.raise(node);
            delete this.children[node.name];
        }
    }

    clearChildren() {
        Object.keys(this.children).forEach((name) => {
            this.onChildrenChanged.raise(this.children[name]);
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
        if (this.prev?.id !== prev?.id) {
            this.prev = prev;
            await this.savePrev();
        }
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

        if (this.prev) {
            await this.setPrevAsync(undefined, true);
        }

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