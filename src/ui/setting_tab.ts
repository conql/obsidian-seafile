import { type App, type ButtonComponent, Notice, PluginSettingTab, Setting, type TextAreaComponent, type TextComponent } from "obsidian";
import type SeafilePlugin from "src/main";
import { debug } from "src/utils";
import Dialog from "./dialog_modal";
import LoginModal from "./login_modal";
import RepoModal from "./repo_modal";

export class SeafileSettingTab extends PluginSettingTab {
	constructor(public app: App, private readonly plugin: SeafilePlugin) {
		super(app, plugin);
	}

	display(): void {
		const settings = this.plugin.settings;
		const { containerEl } = this;
		containerEl.empty();

		let hostText: TextComponent;
		new Setting(containerEl)
			.setName("Host")
			.setDesc("Server URL.")
			.addText(text => {
				hostText = text;
				text.setPlaceholder("https://example.com");
				text.setValue(settings.host);
			})
			.addButton(button => button
				.setButtonText("Save")
				.onClick(async () => {
					try {
						const url = new URL(hostText.getValue());
						if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Invalid protocol");
						settings.host = url.origin;
						await this.plugin.saveSettings();
						new Notice("Host saved");
					} catch (error) {
						new Notice(error.message as string);
					}
					hostText.setValue(settings.host);
				})
			);
		const accountDefaultDesc = "Not logged in.";
		let accountButton: ButtonComponent;
		const accountSetting = new Setting(containerEl)
			.setName("Account")
			.setDesc(settings.account ? settings.account : accountDefaultDesc)
			.addButton(button => {
				accountButton = button;
				if (settings.account) { button.setButtonText("Log out"); } else { button.setButtonText("Log in"); }

				button.onClick(async () => {
					if (settings.account) {
						// Log out
						const result = await this.askClearVault("To log out, you need to clear your vault first.\n\n");
						if (!result) return;

						settings.account = "";
						settings.authToken = "";
						settings.deviceName = "";
						settings.deviceId = "";
						settings.repoName = "";
						settings.repoId = "";
						settings.repoToken = "";
						await this.plugin.saveSettings();
						accountButton.setButtonText("Log in");
						accountSetting.setDesc(accountDefaultDesc);
						repoSetting.setDesc(repoDefaultDesc);
					} else {
						// Login
						new LoginModal(this.app, async (account, token, deviceName, deviceId) => {
							settings.account = account;
							settings.authToken = token;
							settings.deviceName = deviceName;
							settings.deviceId = deviceId;
							await this.plugin.saveSettings();

							accountButton.setButtonText("Log out");
							accountSetting.setDesc(account);
						}).open();
					}
				});
			});

		const repoDefaultDesc = "Choose a repository to sync.";
		const repoSetting = new Setting(containerEl)
			.setName("Repository")
			.setDesc(settings.repoName ? settings.repoName : repoDefaultDesc)
			.addButton(button => {
				button.setButtonText("Choose");
				button.onClick(async () => {
					if (!settings.authToken) {
						new Notice("Log in first before choosing a repository");
						return;
					}
					if (settings.repoToken) {
						const result = await this.askClearVault("To change repository, you need to clear your vault first.\n\n");
						if (!result) return;

						settings.repoName = "";
						settings.repoId = "";
						settings.repoToken = "";
						repoSetting.setDesc(repoDefaultDesc);
						await this.plugin.saveSettings();
					}
					new RepoModal(this.app, async (repoName, repoId, repoToken) => {
						settings.repoName = repoName;
						settings.repoId = repoId;
						settings.repoToken = repoToken;
						repoSetting.setDesc(repoName);
						await this.plugin.saveSettings();

						if (settings.enableSync) this.plugin.sync.startSync();
					}).open();
				});
			});
		let enableSyncButton: ButtonComponent;
		const enableSyncSetting = new Setting(containerEl)
			.setName("Sync status")
			.setDesc(settings.enableSync ? "Enabled" : "Disabled")
			.addButton(button => {
				enableSyncButton = button;
				button.setButtonText(settings.enableSync ? "Disable" : "Enable");
				button.onClick(async () => {
					button.setDisabled(true);
					if (settings.enableSync) {
						// Disable sync
						await this.plugin.disableSync();
						new Notice("Sync disabled");
						button.setButtonText("Enable");
						enableSyncSetting.setDesc("Disabled");
					} else {
						// Enable sync
						if (this.plugin.checkSyncReady()) {
							await this.plugin.enableSync();
							new Notice("Sync enabled");
							button.setButtonText("Disable");
							enableSyncSetting.setDesc("Enabled");
						} else {
							if (settings.authToken) {
								if (!settings.repoToken) {
									new Notice("Choose a repository first before enabling sync");
								} else {
									new Notice("Sync is not ready");
								}
							} else {
								new Notice("Log in first before enabling sync");
							}
						}
					}
					button.setDisabled(false);
				});
			});

		let intervalText: TextComponent;
		new Setting(containerEl)
			.setName("Sync interval")
			.setDesc("in seconds.")
			.addText(text => {
				intervalText = text;
				text.setPlaceholder("30");
				text.setValue(Math.floor(settings.interval / 1000).toString());
			})
			.addButton(button => button
				.setButtonText("Save")
				.onClick(async () => {
					const seconds = parseInt(intervalText.getValue());
					if (isNaN(seconds) || seconds < 5) {
						new Notice("Sync interval must be at least 5 seconds");
					} else {
						settings.interval = seconds * 1000;
						await this.plugin.saveSettings();
						if (this.plugin.sync.status.type === "idle") { this.plugin.sync.startSync(); }
						new Notice("Sync interval saved");
					}
					intervalText.setValue(Math.floor(settings.interval / 1000).toString());
				})
			);

		let ignoreText: TextAreaComponent;
		new Setting(containerEl)
			.setName("Ignore")
			.setDesc("Use gitignore syntax.")
			.addTextArea(text => {
				ignoreText = text;
				text.setValue(settings.ignore);
			})
			.addButton(button => button
				.setButtonText("Save")
				.onClick(async () => {
					button.setDisabled(true);
					settings.ignore = ignoreText.getValue();
					this.plugin.sync.setIgnorePattern(settings.ignore);
					await this.plugin.saveSettings();
					new Notice("Ignore pattern saved");
					button.setDisabled(false);
				}));

		new Setting(containerEl)
			.setName("Dev mode")
			.setDesc("Enable development mode. Need restart to take effect.")
			.addToggle(toggle => toggle
				.setValue(settings.devMode)
				.onChange(async (value) => {
					settings.devMode = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName("Use fetch")
			.setDesc("Use fetch instead of Obsidian API. Need CORS enabled on the server.")
			.addToggle(toggle => toggle
				.setValue(settings.useFetch)
				.onChange(async (value) => {
					settings.useFetch = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName("Clear vault")
			.setDesc("Delete all local files and data. Try this if you encounter any issues.")
			.addButton(button => button
				.setButtonText("Clear")
				.setWarning()
				.onClick(async () => {
					const success = await this.askClearVault();
					if (success) {
						// Sync has been disabled, update the UI
						enableSyncSetting.setDesc("Disabled");
						enableSyncButton.setButtonText("Enable");
					}
				})
			);
	}

	private async askClearVault(info: string = ""): Promise<boolean> {
		return await new Promise<boolean>((resolve) => {
			new Dialog(this.app,
				"Clear vault",
				info + "Are you sure you want to remove all local files and data? This action cannot be undone. \n\nThis will not delete any files that are in the ignore list.",
				async () => {
					try {
						await this.plugin.clearVault();
					} catch (error) {
						new Notice(`Failed to clear vault: ${error.message}`);
						debug.error(error);
					}
					resolve(true);
				},
				async () => {
					resolve(false);
				}
			).open();
		});
	}
}
