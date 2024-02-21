import { App, DataAdapter } from "obsidian";

export let PLUGIN_DIR: string;
export let SYNC_DLOG_PATH: string;
export let SYNC_DATA_PATH: string;
export let HEAD_COMMIT_PATH: string;
export let app: App;
export let adapter: DataAdapter;

export function setApp(app_: App) {
    app = app_
    adapter = app.vault.adapter
    PLUGIN_DIR = app.vault.configDir + "/plugins/seafile"
    SYNC_DLOG_PATH = PLUGIN_DIR + "/" + "sync_dlog"
    SYNC_DATA_PATH = PLUGIN_DIR + "/" + "sync_data"
    HEAD_COMMIT_PATH = PLUGIN_DIR + "/" + "head_commit"
}