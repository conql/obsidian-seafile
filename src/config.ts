import { App, DataAdapter } from "obsidian";
import Server from "./server";

export let PLUGIN_DIR: string;
export let SYNC_DLOG_PATH: string;
export let SYNC_DATA_PATH: string;
export let HEAD_COMMIT_PATH: string;
export let DEFAULT_IGNORE = `
CONFIG_DIR/plugins/seafile
CONFIG_DIR/plugins/hot-reload

CONFIG_DIR/*.json
`;
export let app: App;
export let adapter: DataAdapter;
export let server: Server;

export function initConfig(app_: App, server_: Server) {
	app = app_;
	server = server_;
	adapter = app.vault.adapter;
	PLUGIN_DIR = app.vault.configDir + "/plugins/seafile";
	SYNC_DLOG_PATH = PLUGIN_DIR + "/" + "sync_dlog";
	SYNC_DATA_PATH = PLUGIN_DIR + "/" + "sync_data";
	HEAD_COMMIT_PATH = PLUGIN_DIR + "/" + "head_commit";

	DEFAULT_IGNORE = DEFAULT_IGNORE.replace(/CONFIG_DIR/g, app.vault.configDir);
}