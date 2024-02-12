import { App, Command, Component, EditorSuggest, EventRef, HoverLinkSource, MarkdownPostProcessor, MarkdownPostProcessorContext, ObsidianProtocolHandler, Plugin, PluginManifest, PluginSettingTab, ViewCreator } from "obsidian";

export class MockPlugin implements Plugin {
    app: App;
    manifest: PluginManifest;
    addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => any): HTMLElement {
        throw new Error("Method not implemented.");
    }
    addStatusBarItem(): HTMLElement {
        throw new Error("Method not implemented.");
    }
    addCommand(command: Command): Command {
        throw new Error("Method not implemented.");
    }
    addSettingTab(settingTab: PluginSettingTab): void {
        throw new Error("Method not implemented.");
    }
    registerView(type: string, viewCreator: ViewCreator): void {
        throw new Error("Method not implemented.");
    }
    registerHoverLinkSource(id: string, info: HoverLinkSource): void {
        throw new Error("Method not implemented.");
    }
    registerExtensions(extensions: string[], viewType: string): void {
        throw new Error("Method not implemented.");
    }
    registerMarkdownPostProcessor(postProcessor: MarkdownPostProcessor, sortOrder?: number | undefined): MarkdownPostProcessor {
        throw new Error("Method not implemented.");
    }
    registerMarkdownCodeBlockProcessor(language: string, handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void | Promise<any>, sortOrder?: number | undefined): MarkdownPostProcessor {
        throw new Error("Method not implemented.");
    }
    registerObsidianProtocolHandler(action: string, handler: ObsidianProtocolHandler): void {
        throw new Error("Method not implemented.");
    }
    registerEditorSuggest(editorSuggest: EditorSuggest<any>): void {
        throw new Error("Method not implemented.");
    }
    loadData(): Promise<any> {
        throw new Error("Method not implemented.");
    }
    saveData(data: any): Promise<void> {
        throw new Error("Method not implemented.");
    }
    load(): void {
        throw new Error("Method not implemented.");
    }
    onload(): void {
        throw new Error("Method not implemented.");
    }
    unload(): void {
        throw new Error("Method not implemented.");
    }
    onunload(): void {
        throw new Error("Method not implemented.");
    }
    addChild<T extends Component>(component: T): T {
        throw new Error("Method not implemented.");
    }
    removeChild<T extends Component>(component: T): T {
        throw new Error("Method not implemented.");
    }
    register(cb: () => any): void {
        // do nothing
    }
    registerEvent(eventRef: EventRef): void {
        throw new Error("Method not implemented.");
    }
    registerDomEvent<K extends keyof WindowEventMap>(el: Window, type: K, callback: (this: HTMLElement, ev: WindowEventMap[K]) => any, options?: boolean | AddEventListenerOptions | undefined): void;
    registerDomEvent<K extends keyof DocumentEventMap>(el: Document, type: K, callback: (this: HTMLElement, ev: DocumentEventMap[K]) => any, options?: boolean | AddEventListenerOptions | undefined): void;
    registerDomEvent<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions | undefined): void;
    registerDomEvent(el: unknown, type: unknown, callback: unknown, options?: unknown): void {
        throw new Error("Method not implemented.");
    }
    registerInterval(id: number): number {
        throw new Error("Method not implemented.");
    }
    registerCodeMirror(callback: (cm: CodeMirror.Editor) => any): void {

    }
    registerEditorExtension(extension: any): void {

    }
}