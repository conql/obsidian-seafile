import { Modal, Setting } from "obsidian";

export default class Dialog extends Modal {
    constructor(app: any, private title: string, private message: string, private onConfirm?: () => any, private onCancel?: () => any) {
        super(app);
    }

    private state: "yes" | "no" = "no";
    onOpen() {
        let { contentEl } = this;
        contentEl.empty();
        contentEl.setText("Seafile");
        contentEl.createEl("h2", { text: this.title });
        contentEl.createEl("p", { text: this.message });

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText("Yes");
                btn.onClick(() => {
                    this.state = "yes";
                    this.close();
                });
            })
            .addButton(btn => {
                btn.setButtonText("No");
                btn.onClick(() => {
                    this.state = "no";
                    this.close();
                });
            });
    }

    onClose(): void {
        if (this.state === "yes" && this.onConfirm) {
            this.onConfirm();
        }
        else if (this.onCancel) {
            this.onCancel();
        }
    }
}