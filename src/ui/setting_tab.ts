import { App, ButtonComponent, Notice, PluginSettingTab, Setting, TextAreaComponent, TextComponent, ToggleComponent } from "obsidian";
import { server } from "src/config";
import SeafilePlugin from "src/main";
import { Repo } from "src/server";
import { debug } from "src/utils";
import Dialog from "./dialog_modal";
import LoginModal from "./login_modal";
import RepoModal from "./repo_modal";

export class SeafileSettingTab extends PluginSettingTab {

    constructor(public app: App, private plugin: SeafilePlugin) {
        super(app, plugin);
    }

    display() {
        let settings = this.plugin.settings;
        const { containerEl } = this;
        containerEl.empty();

        let hostText: TextComponent;
        new Setting(containerEl)
            .setName('Host')
            .setDesc('Server URL')
            .addText(text => {
                hostText = text;
                text.setPlaceholder("https://example.com");
                text.setValue(settings.host);
            })
            .addButton(button => button
                .setButtonText('Save')
                .onClick(async () => {
                    try {
                        const url = new URL(hostText.getValue());
                        if (url.protocol != "http:" && url.protocol != "https:") throw new Error("Invalid protocol");
                        settings.host = url.origin;
                        await this.plugin.saveSettings();
                        new Notice("Host saved");
                    }
                    catch (error) {
                        new Notice(error.message);
                    }
                    hostText.setValue(settings.host);
                })
            );
        let accountButton: ButtonComponent;
        const accountSetting = new Setting(containerEl)
            .setName('Account')
            .setDesc(settings.account)
            .addButton(button => {
                accountButton = button;
                if (settings.account)
                    button.setButtonText('Logout');
                else
                    button.setButtonText('Login');

                button.onClick(async () => {
                    if (settings.account) {
                        // Logout
                        const result = await this.askClearVault("To logout, you need to clear your vault first.\n\n");
                        if (!result) return;

                        settings.account = "";
                        settings.authToken = "";
                        settings.deviceName = "";
                        settings.deviceId = "";
                        settings.repoName = "";
                        settings.repoId = "";
                        settings.repoToken = "";
                        await this.plugin.saveSettings();
                        accountButton.setButtonText('Login');
                        accountSetting.setDesc("");
                        repoSetting.setDesc("");
                    }
                    else {
                        // Login
                        new LoginModal(this.app, async (account, token, deviceName, deviceId) => {
                            settings.account = account;
                            settings.authToken = token;
                            settings.deviceName = deviceName;
                            settings.deviceId = deviceId;
                            await this.plugin.saveSettings();

                            accountButton.setButtonText('Logout');
                            accountSetting.setDesc(account);
                        }).open();
                    }
                });
            });
        const repoSetting = new Setting(containerEl)
            .setName('Repo')
            .setDesc(settings.repoName)
            .addButton(button => {
                button.setButtonText('Select');
                button.onClick(async () => {
                    if (!settings.authToken) {
                        new Notice("Login first before selecting a repo");
                        return;
                    }
                    if (settings.repoToken) {
                        const result = await this.askClearVault("To change repo, you need to clear your vault first.\n\n");
                        if (!result) return;

                        settings.repoName = "";
                        settings.repoId = "";
                        settings.repoToken = "";
                        repoSetting.setDesc("");
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
        const enableSyncSetting = new Setting(containerEl)
            .setName('Sync status')
            .setDesc(settings.enableSync ? 'Enabled' : 'Disabled')
            .addButton(button => {
                button.setButtonText(settings.enableSync ? 'Disable' : 'Enable');
                button.onClick(async () => {
                    button.setDisabled(true);
                    if (settings.enableSync) {
                        settings.enableSync = false;
                        await this.plugin.saveSettings();

                        // Disable sync
                        await this.plugin.disableSync();
                        new Notice("Sync disabled");
                        button.setButtonText('Enable');
                        enableSyncSetting.setDesc('Disabled');
                    }
                    else {
                        // Enable sync
                        if (this.plugin.checkSyncReady()) {
                            settings.enableSync = true;
                            await this.plugin.saveSettings();

                            await this.plugin.enableSync();
                            new Notice("Sync enabled");
                            button.setButtonText('Disable');
                            enableSyncSetting.setDesc('Enabled');
                        }
                        else {
                            new Notice("Login and select a repo first before enabling sync")
                        }
                    }
                    button.setDisabled(false);
                });
            });


        let intervalText: TextComponent;
        new Setting(containerEl)
            .setName('Sync interval')
            .setDesc('in seconds')
            .addText(text => {
                intervalText = text;
                text.setPlaceholder("15")
                text.setValue(Math.floor(settings.interval / 1000).toString())
            })
            .addButton(button => button
                .setButtonText('Save')
                .onClick(async () => {
                    const interval = parseInt(intervalText.getValue()) * 1000;
                    if (isNaN(interval) || interval < 5) {
                        new Notice("Sync interval must be at least 5 seconds");
                        intervalText.setValue(Math.floor(settings.interval / 1000).toString());
                    }
                    else {
                        settings.interval = interval;
                        await this.plugin.saveSettings();

                        await this.plugin.sync.stopSyncAsync();
                        this.plugin.sync.startSync();
                        new Notice("Sync interval saved");
                    }
                })
            );

        let ignoreText: TextAreaComponent;
        new Setting(containerEl)
            .setName('Ignore')
            .setDesc('Use gitignore syntax.')
            .addTextArea(text => {
                ignoreText = text;
                text.setValue(settings.ignore);
            })
            .addButton(button => button
                .setButtonText('Save')
                .onClick(async () => {
                    button.setDisabled(true);
                    settings.ignore = ignoreText.getValue();
                    this.plugin.sync.setIgnorePattern(settings.ignore);
                    await this.plugin.saveSettings();
                    new Notice("Ignore pattern saved");
                    button.setDisabled(false);
                }));

        new Setting(containerEl)
            .setName('Dev mode')
            .setDesc('Enable development mode. Need restart to take effect.')
            .addToggle(toggle => toggle
                .setValue(settings.devMode)
                .onChange(async (value) => {
                    settings.devMode = value;
                })
            );
        new Setting(containerEl)
            .setName('Clear vault')
            .setDesc('Delete all local files and data. Try this if you encounter any issues.')
            .addButton(button => button
                .setButtonText('Clear')
                .onClick(async () => {
                    await this.askClearVault();
                })
            );
    }

    private async askClearVault(info: string = ""): Promise<boolean> {
        return await new Promise<boolean>((resolve) => {
            new Dialog(this.app,
                "Clear Vault",
                info + "Are you sure you want to remove all local files and data? This action cannot be undone. \n\nThis will not delete any files that are in the ignore list.",
                async () => {
                    try {
                        await this.plugin.clearVault();
                    }
                    catch (error) {
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