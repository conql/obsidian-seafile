import { Modal, Notice, Setting } from "obsidian";
import { server } from "src/config";
import { Repo } from "src/server";
import { debug } from "src/utils";

export default class RepoModal extends Modal {

    constructor(app: any, private callback: (repoName: string, repoId: string, repoToken: string) => void) {
        super(app);
    }

    async loadRepoToken(repo: Repo) {
        try {
            const repoToken = await server.getRepoToken(repo.repo_id);
            this.callback(repo.repo_name, repo.repo_id, repoToken);
        }
        catch (error) {
            new Notice("Failed to load repository token. " + error.message);
            debug.error(error);
        }
    }

    async loadRepos(contentEl: HTMLElement) {
        const repoList = await server.getRepoList();

        for (const repo of repoList) {
            new Setting(contentEl)
                .setName(repo.repo_name)
                .addButton(button => button.onClick(async () => {
                    button.setDisabled(true);
                    await this.loadRepoToken(repo);
                    this.close()
                }).setButtonText("Select"))
        }

        if (repoList.length == 0) {
            contentEl.createEl("p", { text: "No repositories found." });
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.setText("Choose a repository to sync")

        const loading = contentEl.createEl("p", { text: "Loading repositories..." });
        this.loadRepos(contentEl).then(() => loading.remove()).catch(error => {
            loading.textContent = "Failed to load repositories. " + error.message;
            debug.error(error);
        })
    }
}