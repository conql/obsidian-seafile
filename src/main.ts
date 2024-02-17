import { Notice, Plugin } from 'obsidian';
import { SettingTab, Settings, loadSettings } from './settings';
import Server from './server';
import { SyncController } from './sync/controller';
import { SyncNode } from './sync/node';
import { debug, disableDebug } from './utils';
import { DATA_DIR, HEAD_COMMIT_PATH, setApp } from './config';
import { ExplorerView } from './ui/explorer';
import Dialog from './ui/dialog';

export default class SeafilePlugin extends Plugin {
	settings: Settings;
	server: Server;
	sync: SyncController;
	explorerView: ExplorerView;

	async onload() {
		setApp(this.app);
		(window as any)['seafile'] = this;

		this.settings = await loadSettings(this);
		this.addSettingTab(new SettingTab(this.app, this));

		this.server = new Server(
			this.settings.host,
			this.settings.repoName,
			this.settings.account,
			this.settings.password,
			this.settings.deviceName,
			this.settings.deviceId
		);

		try {
			await this.server.login();
		}
		catch (e) {
			new Notice('[Seafile] Login failed: ' + e.message, 10000);
			debug.error(e);
			return;
		}

		await this.afterLogin();
	}

	private async afterLogin() {
		this.sync = new SyncController(this.app.vault.adapter, this.settings.interval, this.server, this.settings.ignore);
		this.explorerView = new ExplorerView(this, this.sync);
		debug.time("Load SyncNodes");
		await this.sync.init();
		debug.timeEnd("Load SyncNodes");

		if (this.settings.devMode) {
			this.addRibbonIcon("dice", "Clear Vault", async () => {
				await this.clearVault();
			});
			this.addRibbonIcon("dice", "Start Sync", async () => {
				await this.sync.startSync();
			});

			this.addRibbonIcon("dice", "Stop Sync", async () => {
				await this.sync.stopSync();
			});
		}
		else {
			disableDebug();
			await this.sync.startSync();
		}


		this.registerEvent(this.app.vault.on("create", (file) => {
			this.sync.notifyChange("/" + file.path, "create");
		}));
		this.registerEvent(this.app.vault.on("delete", (file) => {
			this.sync.notifyChange("/" + file.path, "delete");
		}));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			this.sync.notifyChange("/" + oldPath, "delete");
			this.sync.notifyChange("/" + file.path, "create");
		}));
		this.registerEvent(this.app.vault.on("modify", (file) => {
			this.sync.notifyChange("/" + file.path, "modify");
		}));
	}

	async clearVault() {
		await (app as any).plugins.disablePlugin("seafile");

		const root = await this.app.vault.adapter.list("");
		for (const file of root.files) {
			await this.app.vault.adapter.remove(file);
		}
		for (const folder of root.folders) {
			if (folder === app.vault.configDir) {
				continue;
			}
			else
				await this.app.vault.adapter.rmdir(folder, true);
		}
		if (await this.app.vault.adapter.exists(DATA_DIR)) {
			await this.app.vault.adapter.rmdir(DATA_DIR, true);
		}
		if (await this.app.vault.adapter.exists(HEAD_COMMIT_PATH)) {
			await this.app.vault.adapter.remove(HEAD_COMMIT_PATH);
		}

		await (this.app as any).plugins.enablePlugin("seafile");
	}

	onunload() {
		if (this.sync)
			this.sync.stopSync();
	}

}