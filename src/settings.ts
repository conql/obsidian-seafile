import { App, PluginSettingTab, Setting, TextComponent, arrayBufferToHex } from "obsidian";
import PluginSeafile from "./main";

const manifestJson = require('../manifest.json') ?? { id: "obsidian-seafile", version: "0.0.0" };

export interface Settings {
    host: string,
    account: string,
    password: string,
    repoName: string,
    deviceName: string,
    deviceId: string,
    interval: number,
    ignore: string
}

export const DEFAULT_SETTINGS: Settings = {
    host: "",
    account: "",
    password: "",
    repoName: "",
    deviceName: "obsidian-seafile",
    deviceId: "",
    interval: 15000,
    ignore: ""
}

function generateDeviceId() {
    // generate a random device id (sha1 hash of random bytes)
    const bytes = new Uint8Array(20);
    window.crypto.getRandomValues(bytes);
    return arrayBufferToHex(bytes);
}

export class SettingTab extends PluginSettingTab {

    constructor(public app: App, private plugin: PluginSeafile) {
        super(app, plugin);
    }

    display() {

        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Seafile Settings' });

        new Setting(containerEl)
            .setName('Host')
            .setDesc('Server URL')
            .addText(text => text
                .setPlaceholder("https://example.com")
                .setValue(this.plugin.settings.host)
                .onChange(async (value) => {
                    this.plugin.settings.host = value;
                })
            );
        new Setting(containerEl)
            .setName('Account')
            .setDesc('Account')
            .addText(text => text
                .setPlaceholder("email@domain.com")
                .setValue(this.plugin.settings.account)
                .onChange(async (value) => {
                    this.plugin.settings.account = value;
                })
            );
        new Setting(containerEl)
            .setName('Password')
            .setDesc('Password')
            .addText(text => text
                .setPlaceholder("password")
                .setValue(this.plugin.settings.password)
                .onChange(async (value) => {
                    this.plugin.settings.password = value;
                })
            );
        new Setting(containerEl)
            .setName('Repo Name')
            .setDesc('Repo Name')
            .addText(text => text
                .setPlaceholder("repo_name")
                .setValue(this.plugin.settings.repoName)
                .onChange(async (value) => {
                    this.plugin.settings.repoName = value;
                })
            );
        new Setting(containerEl)
            .setName('Device Name')
            .setDesc('Device Name')
            .addText(text => text
                .setPlaceholder("obsidian-seafile")
                .setValue(this.plugin.settings.deviceName)
                .onChange(async (value) => {
                    this.plugin.settings.deviceName = value;
                })
            );
        let deviceIdText: TextComponent;
        new Setting(containerEl)
            .setName('Device ID')
            .setDesc('Device ID')
            .addText(text => {
                text.setValue(this.plugin.settings.deviceId)
                    .setDisabled(true);
                deviceIdText = text;
            }
            )
            .addButton(button => button
                .setButtonText('Generate')
                .onClick(() => {
                    const newDeviceId = generateDeviceId();
                    deviceIdText.setValue(newDeviceId);
                    this.plugin.settings.deviceId = newDeviceId;
                })
            );
        new Setting(containerEl)
            .setName('Sync Interval')
            .setDesc('Sync Interval (seconds)')
            .addText(text => text
                .setPlaceholder("15")
                .setValue(Math.floor(this.plugin.settings.interval / 1000).toString())
                .onChange(async (value) => {
                    this.plugin.settings.interval = parseInt(value) * 1000;
                })
            );
        new Setting(containerEl)
            .setName('Ignore')
            .setDesc('Ignore Patterns. Gitignore syntax.')
            .addTextArea(text => text
                .setValue(this.plugin.settings.ignore)
                .onChange(async (value) => {
                    this.plugin.settings.ignore = value;
                })
            );
        new Setting(containerEl)
            .setName('Save Settings')
            .addButton(button => button
                .setButtonText('Save & Restart')
                .onClick(async () => {
                    await saveSettings(this.plugin.settings, this.plugin)
                    await (app as any).plugins.disablePlugin("obsidian-seafile");
                    await (app as any).plugins.enablePlugin("obsidian-seafile");
                })
            );
    }


}

export async function loadSettings(plugin: PluginSeafile) {
    const settings = Object.assign({}, DEFAULT_SETTINGS, await plugin.loadData());
    if (settings.deviceId.length < 40) {
        settings.deviceId = generateDeviceId();
        await plugin.saveData(settings);
    }
    return settings;
}

export async function saveSettings(settings: Settings, plugin: PluginSeafile) {
    await plugin.saveData(settings);
}