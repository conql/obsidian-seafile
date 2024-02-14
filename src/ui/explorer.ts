import { setIcon } from "obsidian";
import { ExplorerLeaf, FileItem } from "src/@types/obsidian";
import SeafilePlugin from "src/main";
import { SyncController, SyncStatus } from "src/sync/controller";
import { SyncNode, SyncState } from "src/sync/node";
import { debug } from "src/utils";
import styles from "./explorer.module.css";
import * as icons from "./icons";

export class ExplorerView {

    constructor(private plugin: SeafilePlugin, private sync: SyncController) {
        this.plugin.register(() => {
            this.onPluginUnload();
        });
        this.plugin.app.workspace.onLayoutReady(() => {
            this.registerFileExplorer();
        });

        sync.onNodeStateChanged = node => this.nodeStateChanged(node);
        sync.onSyncStatusChanged = (status) => this.syncStatusChanged(status);
    }


    private fileExplorer: ExplorerLeaf;
    private fileItems: Record<string, FileItem> = {};
    private statusContainter: HTMLElement;
    private statusText: HTMLElement;

    private async registerFileExplorer() {
        // Find the file explorer
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        if (fileExplorers.length == 0) throw new Error("No file explorer found");
        else if (fileExplorers.length > 1) {
            debug.warn("Multiple file explorers found, using the first one");
        }
        this.fileExplorer = fileExplorers[0];

        // Register file items
        this.fileItems = this.fileExplorer.view.fileItems;
        this.fileExplorer.view.fileItems = new Proxy(this.fileItems, {
            set: (target: Record<string, FileItem>, prop: string | symbol, value: FileItem): boolean => {
                let ret = Reflect.set(target, prop, value);
                this.fileItemChanged(value, prop as string);
                return ret;
            }
        });

        // Init all file items
        for (let path in this.fileItems) {
            this.fileItemChanged(this.fileItems[path], path);
        }

        this.statusContainter = document.createElement("div");
        this.statusContainter.classList.add(styles.syncStatus);

        const statusLogo = document.createElement("div");
        setIcon(statusLogo, icons.seafileLogo);
        statusLogo.classList.add(styles.syncStatusLogo);
        this.statusContainter.prepend(statusLogo);

        this.statusText = document.createElement("div");
        this.statusText.classList.add(styles.syncStatusText);
        this.statusContainter.appendChild(this.statusText);
        this.statusText.innerText = "Init";

        this.fileExplorer.containerEl.appendChild(this.statusContainter);
    }

    private statesBuffer: Map<string, SyncState> = new Map();
    private async nodeStateChanged(node: SyncNode) {
        const path = node.path === "" ? "/" : node.path.slice(1); // remove leading slash
        // debug.log("Sync state update", path, node.state);
        const item = this.fileItems[path];
        if (item) {
            await this.renderFileItem(item, node.state);
            // debug.log("Rendered state update", path, node.state);
        }
        else {
            this.statesBuffer.set(path, node.state);
            // debug.log("Buffering state update", path, node.state);
        }
    }

    private async fileItemChanged(item: FileItem, path: string) {
        if (this.statesBuffer.has(path)) {
            await this.renderFileItem(item, this.statesBuffer.get(path)!);
        }
        else {
            await this.renderFileItem(item, { type: "init" });
        }
    }

    private async renderFileItem(item: FileItem, state: SyncState) {
        if (!item.iconWrapper) {
            // Create icon wrapper div
            const iconWrapper = document.createElement('div');
            iconWrapper.classList.add(styles.nodeState);
            item.selfEl.appendChild(iconWrapper);
            item.iconWrapper = iconWrapper;
        }

        const wrapper = item.iconWrapper;
        if (state.type === "sync") {
            // setIcon(wrapper, "check-circle-2");
            wrapper.innerHTML = "";
        }
        else if (state.type === "upload") {
            setIcon(wrapper, "upload-cloud");
        }
        else if (state.type === "init") {
            setIcon(wrapper, "refresh-cw");
        }
        else if (state.type === "download") {
            setIcon(wrapper, "download-cloud");
            // let progress = parseInt(state.param as string);
            // wrapper.appendText(` ${progress}%`);
        }
        else {
            wrapper.innerHTML = state.type;
        }
        wrapper.setAttribute("state", state.type);
    }

    syncStatusChanged(status: SyncStatus): void {
        if (status.type == "idle") {
            this.statusText.innerText = "Idle";
        }
        else if (status.type == "busy" || status.type == "pendingStop") {
            this.statusText.innerText = "Syncing: " + status.message;
        }
        else if(status.type == "stop"){
            this.statusText.innerText = "Paused";
        }
    }

    onPluginUnload() {
        console.log("Unloading plugin");
        for (let [path, item] of Object.entries(this.fileItems)) {
            if (item.iconWrapper) {
                item.iconWrapper.remove();
                delete item.iconWrapper;
            }
        }
        this.fileExplorer.view.fileItems = this.fileItems;

        if (this.statusContainter) {
            this.statusContainter.remove();
        }
    }
}