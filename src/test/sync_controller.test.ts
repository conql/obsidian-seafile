import { describe, expect, jest, test } from '@jest/globals';
import Server, { Commit, DirInfo } from '../server';
import fs from 'fs'
import * as env from "./env";
import { NodeChange, SyncController } from '../sync/controller';
import { SyncNode } from '../sync/node';
import { Path } from '../utils';

describe("Basic test", () => {
    const server = new Server(env.host, env.repoName, env.account, env.password, env.deviceName, env.deviceId);
    let sync: SyncController;
    const initCommitId = env.initCommitId;
    let localHead = "";
    let rootNode: SyncNode;
    let changes: NodeChange[] = [];
    let dirInfo: DirInfo[];

    const pullHead = async (upload = false, root = rootNode) => {
        dirInfo = await server.getDirInfo("", true);
        fs.writeFileSync("temp_remote.json", JSON.stringify(dirInfo, null, 4));

        const remoteHead = await server.getHeadCommitId();
        const remoteRoot = await server.getCommitRoot(remoteHead);
        changes = [];
        await sync.pull(changes, "", root, remoteRoot);
        localHead = remoteHead;

        fs.writeFileSync("temp_local.json", JSON.stringify(rootNode.toJson(), null, 4));

        if (!upload) {
            expect(rootNode.next).toBeUndefined();
            expect(rootNode.prev!.id).toBe(remoteRoot.id);
            expect(rootNode.prevDirty).toBeFalsy();
            expect(rootNode.state.type).toBe("sync");
        }
    }

    const findRandomFile = (): string => {
        const files = dirInfo.filter(info => info.type == "file");
        const index = Math.floor(Math.random() * files.length);
        const file = files[index];
        return Path.join(file.parent_dir, file.name)
    }

    const findRandomFolder = (): string => {
        const folders = dirInfo.filter(info => info.type == "dir");
        const index = Math.floor(Math.random() * folders.length);
        const folder = folders[index];
        return Path.join(folder.parent_dir, folder.name)
    }

    test('Preparation', async () => {
        // init vault by removing all files
        if (fs.existsSync("temp"))
            fs.rmSync("temp", { recursive: true });
        fs.mkdirSync("temp");

        await server.login();
        await server.revertToCommit(initCommitId);
        sync = new SyncController(15000, server);
    })

    test('Pull initial', async () => {
        await pullHead();
    }, 10000);

    // test('Load SyncNode from disk', async () => {
    //     const newRoot = await SyncNode.init();
    //     expect(newRoot.prev?.id).toBe(rootNode.prev?.id);
    //     const path = findRandomFile();
    //     expect(newRoot.find(path)!.prev?.id).toBe(rootNode.find(path)!.prev?.id);

    //     sync = new SyncController(15000, server, newRoot);
    //     rootNode = newRoot;
    // });

    test('Restart pull', async () => {
        await pullHead();
    }, 10000);

    test('Pull and Push', async () => {
        // Remote move
        const srcFolder = findRandomFolder();
        let dstFolder = findRandomFolder();
        while (dstFolder.includes(srcFolder)) dstFolder = findRandomFolder();
        console.log(`Remote moved from ${srcFolder} to ${dstFolder}`);
        await server.batchMove(Path.dirname(srcFolder), [Path.basename(srcFolder)], dstFolder);

        // Local edit
        const testContent = "Hello world!";
        const localEditPath = Path.join(dstFolder, "test_local.md");
        await app.vault.adapter.write(localEditPath, testContent);
        console.log(`Local edit ${localEditPath}`)
        sync.notifyChange(localEditPath, "modify");

        // Remote edit
        const remoteEditPath = Path.join(dstFolder, "test_remote.md");
        console.log(`Remote edit ${remoteEditPath}`)
        await server.uploadFile(remoteEditPath, new TextEncoder().encode(testContent), false);

        console.log("Pulling head")
        await pullHead(true);

        console.log("Pushing")
        localHead = await sync.push(rootNode, changes, localHead);

        expect(rootNode.state.type).toBe("sync");
        expect(rootNode.prevDirty).toBeFalsy();

        const localContent = await app.vault.adapter.read(remoteEditPath);
        expect(localContent).toBe(testContent);

        const remoteContent = new TextDecoder().decode(await server.getFileContent(localEditPath));
        expect(remoteContent).toBe(testContent);
    }, 15000);
})