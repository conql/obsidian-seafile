import { ButtonComponent, Modal, Setting } from "obsidian";

export default class Dialog extends Modal {
    constructor(app: any, private title: string, private message: string, private onConfirm?: () => any, private onCancel?: () => any) {
        super(app);
    }

    onOpen() {
        let { contentEl } = this;
        contentEl.empty();
        contentEl.setText(this.title);
        const p = contentEl.createEl("p", { text: this.message });
        p.style.whiteSpace = "pre-wrap";

        let yesBtn: ButtonComponent, noBtn: ButtonComponent;
        new Setting(contentEl)
            .addButton(btn => {
                yesBtn = btn;
                btn.setButtonText("Yes");
                btn.onClick(async () => {
                    yesBtn.setDisabled(true);
                    noBtn.setDisabled(true);
                    await this.onConfirm?.();
                    this.close();
                });
            })
            .addButton(btn => {
                noBtn = btn;
                btn.setButtonText("No");
                btn.onClick(() => {
                    this.close();
                });
            });
    }

    onClose(): void {
        this.onCancel?.();
    }
}