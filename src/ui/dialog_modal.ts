import { App, ButtonComponent, Modal, Setting } from "obsidian";

export default class Dialog extends Modal {
	constructor(app: App, private title: string, private message: string, private onConfirm?: () => void, private onCancel?: () => void) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.textContent = this.title;
		const p = contentEl.createEl("p", { text: this.message });
		p.style.whiteSpace = "pre-wrap";

		let yesBtn: ButtonComponent, noBtn: ButtonComponent;
		new Setting(contentEl)
			.addButton(btn => {
				yesBtn = btn;
				btn.setButtonText("Yes");
				btn.setWarning();
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