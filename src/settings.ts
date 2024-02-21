import { App, arrayBufferToHex, PluginSettingTab, Setting, TextComponent } from "obsidian";
import SeafilePlugin from "./main";
import Dialog from "./ui/dialog_modal";

const manifestJson = require('../manifest.json') ?? { id: "seafile", version: "0.0.0" };

export interface SeafileSettings {
    host: string,
    account: string,
    authToken: string,
    repoName: string,
    repoId: string,
    repoToken: string,
    deviceName: string,
    deviceId: string,
    interval: number,
    ignore: string,
    devMode: boolean
    enableSync: boolean,
}

export const DEFAULT_SETTINGS: SeafileSettings = {
    host: "",
    account: "",
    authToken: "",
    repoName: "",
    repoId: "",
    repoToken: "",
    deviceName: "obsidian-seafile",
    deviceId: "",
    interval: 15000,
    ignore: "",
    devMode: false,
    enableSync: false,
}