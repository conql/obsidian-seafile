import { App } from "obsidian";

export let PLUGIN_DIR: string;
export let DATA_DIR: string;
export let HEAD_COMMIT_PATH: string;
export let app: App;

export function setApp(app_: App) {
    app = app_
    PLUGIN_DIR = app.vault.configDir + "/plugins/seafile"
    DATA_DIR = PLUGIN_DIR + "/" + "data"
    HEAD_COMMIT_PATH = PLUGIN_DIR + "/" + "head_commit"
}