import { describe, expect, jest, test } from '@jest/globals';
import Server, { Commit } from '../server';
import fs from 'fs'
import * as env from "./env";
import { SyncController } from '../sync_controller';
import { SyncNode } from '../sync_node';

describe("Basic test", () => {
    const server = new Server(env.host, env.repoName, env.account, env.password, env.deviceName, env.deviceId);
    let sync: SyncController;
    let initCommitId = "";
    let rootNode: SyncNode;

    const pullHead = async () => {
        const dirInfo = await server.getDirInfo("", true);
        fs.writeFileSync("temp_remote.json", JSON.stringify(dirInfo, null, 4));

        const remoteHead = await server.getHeadCommit();
        const remoteRoot = await server.getCommitRoot(remoteHead);
        await sync.pull("", rootNode, remoteRoot);

        fs.writeFileSync("temp_local.json", JSON.stringify(rootNode.toJson(), null, 4));

        expect(rootNode.prev!.id).toBe(remoteRoot.id);
        expect(rootNode.prevDirty).toBeFalsy();
        expect(rootNode.state.type).toBe("sync");
    }

    test('Preparation', async () => {
        // init vault by removing all files
        if (fs.existsSync("temp"))
            fs.rmSync("temp", { recursive: true });
        fs.mkdirSync("temp");

        await server.login();
        initCommitId = await server.getHeadCommit();
        rootNode = await SyncNode.init();
        sync = new SyncController(server, rootNode);
    })

    test('Pull initial', async () => {
        await pullHead();
        expect(sync.uploads.size).toBe(0);
    }, 1000000);

    test('Pull remote batch move', async () => {
        await server.batchMove("/abc", ["ttt"], "/asd");
        const uploads = await pullHead();
        expect(sync.uploads.size).toBe(0);
    });

    // test('Push local modify', async () => {
    //     await fs.writeFileSync("/abc/1231.txt", "Hello world!");

    // });

    test('Revert back', async () => {
        await server.revertToCommit(initCommitId);
    });
})