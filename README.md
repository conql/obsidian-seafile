# obsidian-seafile

## Introduction

This is an ![Obsidian](https://obsidian.md/) plugin designed to synchronize notes across devices using Seafile.

![obsidian-seafile-demo](https://github.com/conql/obsidian-seafile/assets/49243542/5b8ac9aa-4180-4ca4-9abe-0b94134fd0c1)

### What is Seafile?
- [Seafile](https://www.seafile.com/) is an open source, self-hosted file sync and share solution with high performance and reliability. It supports efficient synchronization through delta downloads and uploads. Also, it provides user-friendly web UI and excellent syncing clients across multiple operating systems.

### Features
- Supports both desktop and mobile.
- Utilizes Seafile's internal syncing API for full synchronization functionality.
- Fast sync speed, performs well even on low-end Android phones.

## Usage
<img src="https://github.com/conql/obsidian-seafile/assets/49243542/26399e88-d054-41cf-ae19-7bc82b178522" width="300">

1. Open settings.
2. Enter the URL of your server and log into your Seafile account.
3. Choose the repository you want to sync.
4. *Optional*: Specify the files you want to ignore. This uses [gitignore syntax](https://git-scm.com/docs/gitignore). The path to the plugin itself and Obsidian configurations are prepended to the user-defined ignore list.
5. Click "Enable" to start syncing.
6. The plugin will now sync your files at intervals. 

For each individual file, the syncing status will be displayed next to file names. Additionally, an icon will appear in the bottom right corner of the File Explorer. Clicking on this icon initiates the syncing process immediately, without the need to wait for the next interval.

## Notes
1. **Does not support encrypted repositories:** This feature has not been implemented yet but will be considered for addition.
2. **Use it at your own risk:** This plugin is currently in development. There is a risk of *data corruption or loss* when using the plugin. Ensure you have backups of your important data.
3. **No large files:** Due to limitations of Obsidian's API, downloading or uploading large files (e.g., larger than 50MB) *may take a long time or cause the app to crash*. Please do not use the plugin for files that are too large.
4. **Clear vault:** If you encounter any problems, you could try to *Clear vault* and restart syncing.
5. **Don't interrupt:** Do not close Obsidian while syncing, especially when uploading data to the server (an upload icon will be shown). Otherwise, expect data corruption or loss.

## Contribution & Support

Your feedback and suggestions are highly appreciated. If you want to:
- Report bugs or issues
- Submit feature requests or enhancements

Please open a [GitHub issue](https://github.com/conql/obsidian-seafile/issues). You can also contact me (@conql) on official Obsidian discord server.