import { App, arrayBufferToHex, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import { server } from "src/config";
import { debug } from "src/utils";

export type LoginCallback = (account: string, token: string, deviceName: string, deviceId: string) => void;

export default class LoginModal extends Modal {
	private deviceName: string = "obsidian-seafile";
	constructor(app: App,
        private callback: LoginCallback,
        private account?: string, private password?: string) {
		super(app);
	}

	async login(account: string, password: string, deviceName: string): Promise<string> {
		const notice = new Notice("Log in to Seafile...");
		try {
			const deviceIdBuffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(deviceName));
			const deviceId = arrayBufferToHex(deviceIdBuffer);

			const authToken = await server.getAuthToken(account, password, deviceName, deviceId);
			if (!authToken) throw new Error("Failed to get auth token");

			await this.callback(account, authToken, deviceName, deviceId);

			return authToken;
		}
		finally {
			notice.hide();
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.textContent = "Login to Seafile";

		let loginButton: ButtonComponent;
		new Setting(contentEl)
			.setName("Device name")
			.addText(text => {
				text.setPlaceholder(this.deviceName);
				text.onChange(value => {
					this.deviceName = value;
					if (this.account && this.password && this.deviceName) loginButton.setDisabled(false);
					else loginButton.setDisabled(true);
				});
			});
		new Setting(contentEl)
			.setName("Account")
			.addText(text => text.setPlaceholder("email@example.com").onChange(value => {
				this.account = value;
				if (this.account && this.password && this.deviceName) loginButton.setDisabled(false);
				else loginButton.setDisabled(true);
			}));
		new Setting(contentEl)
			.setName("Password")
			.addText(password => {
				password.inputEl.type = "password";
				password.setPlaceholder("password")
					.onChange(value => {
						this.password = value;
						if (this.account && this.password && this.deviceName) loginButton.setDisabled(false);
						else loginButton.setDisabled(true);
					});
			});

		new Setting(contentEl)
			.addButton(button => {
				loginButton = button;
				button.setButtonText("Log in");
				button.onClick(async () => {
					if (!this.account || !this.password || !this.deviceName) return;
					try {
						const result = await this.login(this.account, this.password, this.deviceName);
						if (result) this.close();
					}
					catch (error) {
						new Notice("Login failed: " + error.message);
						debug.error(error);
					}
				});
			})
			.addButton(button => button.setButtonText("Cancel")
				.onClick(() => this.close()));
	}
}