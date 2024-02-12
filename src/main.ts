import { Plugin } from 'obsidian';
import { SettingTab, Settings, loadSettings } from './settings';
import Server from './server';
import { SyncController } from './sync_controller';
import { SyncNode } from './sync_node';

export default class PluginSeafile extends Plugin {
	settings: Settings;
	server: Server;
	sync: SyncController;

	async onload() {
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
		await this.server.login();

		const rootNode = await SyncNode.init();
		this.sync = new SyncController(this.settings.interval, this.server, rootNode, this.settings.ignore);

		this.addRibbonIcon("dice", "Clear Vault", async () => {
			const listedFiles = await this.app.vault.adapter.list("");
			for (const file of listedFiles.files) {
				await this.app.vault.adapter.remove(file);
			}
			for (const folder of listedFiles.folders) {
				if (folder === ".obsidian") continue;
				await this.app.vault.adapter.rmdir(folder, true);
			}
		});

		this.addRibbonIcon("dice", "Start Sync", async () => {
			await this.sync.startSync();
		});

		this.addRibbonIcon("dice", "Stop Sync", async () => {
			await this.sync.stopSync();
		});
	}

	onunload() {

	}

}