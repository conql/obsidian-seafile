import { App, PluginSettingTab, Setting, TextComponent, arrayBufferToHex } from "obsidian";
import SeafilePlugin from "./main";
import Dialog from "./ui/dialog";
import { debug } from "./utils";

const manifestJson = require('../manifest.json') ?? { id: "obsidian-seafile", version: "0.0.0" };

export interface Settings {
    host: string,
    account: string,
    password: string,
    repoName: string,
    deviceName: string,
    deviceId: string,
    interval: number,
    ignore: string,
    devMode: boolean
}

export const DEFAULT_SETTINGS: Settings = {
    host: "",
    account: "",
    password: "",
    repoName: "",
    deviceName: "obsidian-seafile",
    deviceId: "",
    interval: 15000,
    ignore: "",
    devMode: false
}

function generateDeviceId() {
    // generate a random device id (sha1 hash of random bytes)
    const bytes = new Uint8Array(20);
    window.crypto.getRandomValues(bytes);
    return arrayBufferToHex(bytes);
}

export class SettingTab extends PluginSettingTab {

    constructor(public app: App, private plugin: SeafilePlugin) {
        super(app, plugin);
    }

    display() {
        let settings = { ...this.plugin.settings };
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Host')
            .setDesc('Server URL')
            .addText(text => text
                .setPlaceholder("https://example.com")
                .setValue(settings.host)
                .onChange(async (value) => {
                    settings.host = value;
                })
            );
        new Setting(containerEl)
            .setName('Account')
            .addText(text => text
                .setPlaceholder("email@domain.com")
                .setValue(settings.account)
                .onChange(async (value) => {
                    settings.account = value;
                })
            );
        new Setting(containerEl)
            .setName('Password')
            .addText(text => text
                .setPlaceholder("password")
                .setValue(settings.password)
                .onChange(async (value) => {
                    settings.password = value;
                })
            );
        new Setting(containerEl)
            .setName('Repo name')
            .addText(text => text
                .setPlaceholder("repo_name")
                .setValue(settings.repoName)
                .onChange(async (value) => {
                    settings.repoName = value;
                })
            );
        new Setting(containerEl)
            .setName('Device name')
            .addText(text => text
                .setPlaceholder("obsidian-seafile")
                .setValue(settings.deviceName)
                .onChange(async (value) => {
                    settings.deviceName = value;
                })
            );
        let deviceIdText: TextComponent;
        new Setting(containerEl)
            .setName('Device ID')
            .addText(text => {
                text.setValue(settings.deviceId)
                    .setDisabled(true);
                deviceIdText = text;
            }
            )
            .addButton(button => button
                .setButtonText('Generate')
                .onClick(() => {
                    const newDeviceId = generateDeviceId();
                    deviceIdText.setValue(newDeviceId);
                    settings.deviceId = newDeviceId;
                })
            );
        new Setting(containerEl)
            .setName('Sync interval')
            .setDesc('in seconds')
            .addText(text => text
                .setPlaceholder("15")
                .setValue(Math.floor(settings.interval / 1000).toString())
                .onChange(async (value) => {
                    settings.interval = parseInt(value) * 1000;
                })
            );
        new Setting(containerEl)
            .setName('Ignore')
            .setDesc('Use gitignore syntax.')
            .addTextArea(text => text
                .setValue(settings.ignore)
                .onChange(async (value) => {
                    settings.ignore = value;
                })
            );
        new Setting(containerEl)
            .setName('Dev mode')
            .setDesc('Enable development mode')
            .addToggle(toggle => toggle
                .setValue(settings.devMode)
                .onChange(async (value) => {
                    settings.devMode = value;
                })
            );
        new Setting(containerEl)
            .setName('Clear vault')
            .setDesc('Delete all local files and data.')
            .addButton(button => button
                .setButtonText('Clear')
                .onClick(async () => {
                    await this.askClearVault();
                })
            );
        new Setting(containerEl)
            .setName('Save settings')
            .addButton(button => button
                .setButtonText('Save & Restart')
                .onClick(async () => {
                    await saveSettings(settings, this.plugin)
                    await (app as any).plugins.disablePlugin("obsidian-seafile");
                    await (app as any).plugins.enablePlugin("obsidian-seafile");
                })
            );
    }

    private async askClearVault() {
        await new Promise<boolean>((resolve) => {
            new Dialog(this.app,
                "Clear Vault",
                "Are you sure you want to clear all local files and data? This action cannot be undone. \nThis will not delete any files under obsidian config directory.",
                async () => {
                    await this.plugin.clearVault();
                    resolve(true);
                },
                async () => {
                    resolve(false);
                }
            ).open();
        });
    }


}

export async function loadSettings(plugin: SeafilePlugin) {
    const settings = Object.assign({}, DEFAULT_SETTINGS, await plugin.loadData());
    if (settings.deviceId.length < 40) {
        settings.deviceId = generateDeviceId();
        await plugin.saveData(settings);
    }
    return settings;
}

export async function saveSettings(settings: Settings, plugin: SeafilePlugin) {
    await plugin.saveData(settings);
}