import { setIcon } from "obsidian";
import { ExplorerLeaf, FileItem } from "src/@types/obsidian";
import SeafilePlugin from "src/main";
import { SyncController } from "src/sync/controller";
import { SyncNode, SyncState } from "src/sync/node";
import { debug } from "src/utils";
import styles from "./explorer.module.css";

export class ExplorerView {

    constructor(private plugin: SeafilePlugin, private sync: SyncController) {
        this.plugin.register(() => this.onPluginUnload);
        this.plugin.app.workspace.onLayoutReady(() => {
            this.registerFileExplorer();
        });

        sync.onNodeStateChanged = node => this.onSyncStateUpdate(node);
    }

    private fileExplorer: ExplorerLeaf;
    private fileItems: Record<string, FileItem> = {};

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
                this.onFileItemUpdate(value, prop as string);
                return ret;
            }
        });

        // Init all file items
        for (let path in this.fileItems) {
            this.onFileItemUpdate(this.fileItems[path], path);
        }
    }

    private statesBuffer: Map<string, SyncState> = new Map();
    private async onSyncStateUpdate(node: SyncNode) {
        const path = node.path === "" ? "/" : node.path.slice(1); // remove leading slash
        // debug.log("Sync state update", path, node.state);
        const item = this.fileItems[path];
        if (item) {
            await this.renderFileItem(item, node.state);
        }
        else {
            this.statesBuffer.set(path, node.state);
        }
    }

    private async onFileItemUpdate(item: FileItem, path: string) {
        if (this.statesBuffer.has(path)) {
            await this.renderFileItem(item, this.statesBuffer.get(path)!);
        }
        else {
            // debug.log("No state found for", path);
            await this.renderFileItem(item, { type: "init" });
        }
    }

    private async renderFileItem(item: FileItem, state: SyncState) {
        if (!item.iconWrapper) {
            // Create icon wrapper div
            const iconWrapper = document.createElement('div');
            iconWrapper.classList.add(styles.syncState);
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


    onPluginUnload() {
        for (let [path, item] of Object.entries(this.fileItems)) {
            if (item.iconWrapper) {
                item.iconWrapper.remove();
                delete item.iconWrapper;
            }
        }
        this.fileExplorer.view.fileItems = this.fileItems;
    }
}