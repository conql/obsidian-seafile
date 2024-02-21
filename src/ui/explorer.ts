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
    private statusIcon: HTMLElement;
    private isStatusSynced = false;

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

        this.statusIcon = document.createElement("div");
        setIcon(this.statusIcon, "refresh-cw");
        this.statusIcon.classList.add(styles.syncStatusIcon);
        this.statusIcon.addEventListener("click", async () => {
            if (!this.plugin.settings.enableSync) {
                this.plugin.settings.enableSync = true;
                await this.plugin.saveSettings();
                this.plugin.enableSync();
            }
            else {
                this.plugin.sync.startSync();
            }
        });
        this.statusContainter.prepend(this.statusIcon);

        this.statusText = document.createElement("div");
        this.statusText.classList.add(styles.syncStatusText);
        this.statusContainter.appendChild(this.statusText);

        this.fileExplorer.containerEl.getElementsByClassName("nav-files-container")[0].after(this.statusContainter);
    }

    private statesBuffer: Map<string, SyncState> = new Map();
    private async nodeStateChanged(node: SyncNode) {
        const path = node.path === "" ? "/" : node.path.slice(1); // remove leading slash

        const item = this.fileItems[path];
        if (item) {
            await this.renderFileItem(item, node.state);
        }
        else {
            this.statesBuffer.set(path, node.state);
        }

        // Update status if files modified
        if (path === "/" && node.state.type === "init" && this.statusIcon && this.isStatusSynced) {
            setIcon(this.statusIcon, "refresh-cw");
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
            wrapper.textContent = "";
        }
        else if (state.type === "upload") {
            setIcon(wrapper, "upload-cloud");
        }
        else if (state.type === "init") {
            setIcon(wrapper, "refresh-cw");
        }
        else if (state.type === "download") {
            setIcon(wrapper, "download-cloud");
        }
        else {
            wrapper.textContent = state.type;
        }
        wrapper.setAttribute("state", state.type);
    }

    syncStatusChanged(status: SyncStatus): void {
        if (!this.statusIcon) return;

        if (status.type == "idle") {
            setIcon(this.statusIcon, "check");
            this.isStatusSynced = true;
        }
        else if (status.type == "busy") {
            if (status.message == "fetch" || status.message == "download")
                setIcon(this.statusIcon, "download-cloud");
            else if (status.message == "upload")
                setIcon(this.statusIcon, "upload-cloud");
        }
        else if (status.type == "stop") {
            if (status.message == "error")
                setIcon(this.statusIcon, "alert-circle");
            else
                setIcon(this.statusIcon, "refresh-cw-off");
        }
    }

    onPluginUnload() {
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