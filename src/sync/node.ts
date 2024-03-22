import { adapter, SYNC_DATA_PATH, SYNC_DLOG_PATH } from "../config";
import { MODE_FILE, SeafDirent, SeafFs } from "../server";
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

export type SerializedSyncNode = {
	prev: SeafDirent | null,
	children: Record<string, SerializedSyncNode>
}

export type SerializedLogData = [string, SeafDirent | null];

export class SyncNode {
	public static onStateChanged: SyncStateChangedListener | undefined;
	private static _dataLogCount = 0;
	public static get dataLogCount() { return this._dataLogCount; }
	private static set dataLogCount(value: number) { this._dataLogCount = value; }

	public readonly path: string;
	private children: Record<string, SyncNode> = {};
	private _prev?: SeafDirent;
	public prevDirty = true; // prev means the last synced state
	public next?: SeafDirent;
	public nextDirty = true; // next means the pending upload state

	private constructor(
		public readonly name: string,
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
				SyncNode.onStateChanged?.(this);
				return true;
			}
		});
		SyncNode.onStateChanged?.(this);
	}

	public static serialize(node: SyncNode): SerializedSyncNode {
		const children: Record<string, SerializedSyncNode> = {};
		for (const [name, child] of Object.entries(node.children)) {
			if (child.prev)
				children[name] = SyncNode.serialize(child);
		}
		return {
			prev: node.prev!,
			children: children
		};
	}

	public static async deserialize(name: string, data: SerializedSyncNode, parent?: SyncNode): Promise<SyncNode> {
		const node = new SyncNode(name, parent);
		node.prev = data.prev ?? undefined;
		parent?.addChild(node);

		if (!node.prev) {
			debug.log(`Path '${node.path}' has no prev.`);
			const stat = await utils.fastStat(node.path);
			if (!stat) {
				node.prev = undefined;
				node.prevDirty = false;
				node.state = { "type": "delete" };
			}
		}
		else if (node.prev.mode === MODE_FILE) {
			const stat = await utils.fastStat(node.path);
			if (stat && Math.floor(stat.mtime / 1000) == node.prev.mtime && stat.size == node.prev.size) {
				node.prevDirty = false;
				node.state = { "type": "sync" };
			}
		}
		else {
			let childrenDirty = false;
			const localChildren = await utils.fastList(node.path);
			for(const name of localChildren){
				if (!Object.prototype.hasOwnProperty.call(data.children, name)) {
					data.children[name] = { prev: null, children: {} };
				}
			}
			for (const [name, childData] of Object.entries(data.children)) {
				const child = await SyncNode.deserialize(name, childData, node);
				if (child.prevDirty) childrenDirty = true;

			}
			if (!childrenDirty) {
				node.prevDirty = false;
				node.state = { "type": "sync" };
			}
		}

		return node;
	}

	public static async load(): Promise<SyncNode> {
		let fullData = { prev: null, children: {} } as SerializedSyncNode;
		try {
			fullData = JSON.parse(await adapter.read(SYNC_DATA_PATH)) as SerializedSyncNode;
		} catch { /* empty */ }

		let logData = [] as string[];
		try {
			logData = (await adapter.read(SYNC_DLOG_PATH)).split("\n");
			this.dataLogCount = logData.length;
		} catch { /* empty */ }

		for (const line of logData) {
			if (!line.trim()) continue;
			try {
				let [path, dirent] = JSON.parse(line) as SerializedLogData;
				while (path.startsWith("/")) path = path.slice(1);
				const parts = path.split("/");
				const name = parts.pop()!;
				let base = fullData;
				for (const part of parts) {
					if (!Object.prototype.hasOwnProperty.call(base.children, part)) {
						base.children[part] = { prev: null, children: {} };
					}
					base = base.children[part];
				}
				if (dirent) {
					if (name === "")
						base.prev = dirent;
					else if (!Object.prototype.hasOwnProperty.call(base.children, name))
						base.children[name] = { prev: dirent, children: {} };
					else
						base.children[name].prev = dirent;
				}
				else {
					if (name === "")
						base.prev = null;
					else if (Object.prototype.hasOwnProperty.call(base.children, name))
						delete base.children[name];
				}
			}
			catch (e) {
				debug.error(`Failed to parse log data: ${line}`, e);
				break;
			}
		}

		return await this.deserialize("", fullData);
	}

	public static async save(root: SyncNode) {
		const data = this.serialize(root);
		await adapter.write(SYNC_DATA_PATH, JSON.stringify(data));
		await adapter.write(SYNC_DLOG_PATH, "");
		SyncNode.dataLogCount = 0;
	}

	private async appendDataLog(dirent: SeafDirent | undefined | null) {
		if (!dirent) dirent = null;
		await adapter.append(SYNC_DLOG_PATH, JSON.stringify([this.path, dirent] as SerializedLogData) + "\n");
		SyncNode.dataLogCount++;
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
			else {
				node.state = { "type": "init" };
			}

			return false;
		}, "post", false);
	}

	private addChild(node: SyncNode) {
		this.children[node.name] = node;
	}

	createChild(name: string): SyncNode {
		const child = new SyncNode(name, this);
		this.addChild(child);
		return child;
	}



	removeChild(node: SyncNode) {
		if (Object.prototype.hasOwnProperty.call(this.children, node.name)) {
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
		if (!(prev?.id === this.prev?.id && prev?.mtime === this.prev?.mtime)) {
			await this.appendDataLog(prev);
			this.prev = prev;
		}
		this.prevDirty = dirty;
	}

	async applyNext() {
		await this.setPrevAsync(this.next, this.nextDirty);
		this.setNext(undefined, true);
		if (!this.prevDirty) {
			this.state = { "type": "sync" };
		}
		else {
			this.state = { "type": "init" };
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
		this.state = { "type": "delete" };
	}

	toJson() {
		const cjson: Record<string, unknown> = {};
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
		};
	}
}
