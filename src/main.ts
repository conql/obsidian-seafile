import { Notice, Plugin } from 'obsidian';
import { SettingTab, Settings, loadSettings } from './settings';
import Server from './server';
import { SyncController } from './sync/controller';
import { SyncNode } from './sync/node';
import { debug, disableDebug } from './utils';
import { DATA_DIR, HEAD_COMMIT_PATH } from './config';
import { ExplorerView } from './ui/explorer';

export default class SeafilePlugin extends Plugin {
	settings: Settings;
	server: Server;
	sync: SyncController;
	explorerView: ExplorerView;

	async onload() {
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
			debug.log('Seafile plugin loaded');
			await this.server.login();
			debug.log('Seafile plugin logged in');
		}
		catch (e) {
			new Notice('Failed to login to Seafile server: ' + e.message, 10000);
			throw e;
		}

		await this.afterLogin();
	}

	private async afterLogin() {
		this.sync = new SyncController(this.settings.interval, this.server, this.settings.ignore);
		await this.sync.init();
		this.explorerView = new ExplorerView(this, this.sync);

		if (this.settings.devMode) {
			this.addRibbonIcon("dice", "Clear Vault", async () => {
				const listedFiles = await this.app.vault.adapter.list("");
				for (const file of listedFiles.files) {
					await this.app.vault.adapter.remove(file);
				}
				for (const folder of listedFiles.folders) {
					if (folder === ".obsidian") continue;
					await this.app.vault.adapter.rmdir(folder, true);
				}
				if (await this.app.vault.adapter.exists(DATA_DIR)) {
					await this.app.vault.adapter.rmdir(DATA_DIR, true);
				}
				if (await this.app.vault.adapter.exists(HEAD_COMMIT_PATH)) {
					await this.app.vault.adapter.remove(HEAD_COMMIT_PATH);
				}
				await (this.app as any).plugins.disablePlugin("obsidian-seafile");
				await (this.app as any).plugins.enablePlugin("obsidian-seafile");
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
	}

	onunload() {
		this.sync.stopSync();
	}

}