# obsidian-seafile

## Introduction

This is an Obsidian plugin, designed to synchronize notes across devices using Seafile as the backend.

### Features
- Support for both desktop and mobile
- Utilizes Seafile's internal syncing API for full synchronization functionality
- Fast sync speed. Runs well even on low-end Android phones

#### Why Seafile:
- Git-like system with file versioning
- Efficient synchronization through delta downloads and uploads
- User-friendly web UI and great syncing clients across multiple operating systems

## Usage
<img src="https://github.com/conql/obsidian-seafile/assets/49243542/26399e88-d054-41cf-ae19-7bc82b178522" width="300">

1. Open settings.
2. Fill the URL of your server. Log into your seafile account.
3. Choose the repo you want to sync.
4. Click "Enable" to start syncing.
5. Now the plugin will sync your files after a given interval. The syncing status will be shown in the file explorer.

<img src="https://github.com/conql/obsidian-seafile/assets/49243542/87ff3636-f79e-4393-849b-d59d933050a1" width="300">

A status icon will be shown in the bottom of the file explorer. When clicked, the syncing process will start immediately without a wait interval.

## Notes
1. **Use it at your own risk:** This plugin is currently in development. There is a risk of *data corruption or loss* when using the plugin. Ensure you have backups of your important data.
2. **No large files:** Due to limitations of Obsidian's API, downloading or uploading large files (e.g. bigger than 50MB) *may take a long time or crash the app*. Please do not use the plugin for files that are too large.
3. **Clear vault:** If you encounter any problems in using, you could try *Clear vault* and restart syncing.
4. **Don't interrupt:** Do not close Obsidian when syncing, especially when uploading data to sever (an upload icon will be shown). Otherwise data corruption or loss should be expected.

## Contribution

Your feedback and suggestions are highly appreciated. If you want to:
- Report bugs or issues
- Submit feature requests or enhancements

Please open a [Github issue](https://github.com/conql/obsidian-seafile/issues).
