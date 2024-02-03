import { describe, expect, jest, test } from '@jest/globals';
import Storage from '../storage';
import Server, { Commit } from '../server';
import fs from 'fs'
import * as env from "./env";
import { Sync, SyncNode } from '../sync';

jest.mock("../storage");

describe("Basic test", () => {
    const storage = new Storage();
    const server = new Server(env.host, env.repoName, env.account, env.password, env.deviceName, env.deviceId, storage);
    const sync = new Sync(server, storage, env.account);

    test('Preparation', async () => {
        // init vault by removing all files
        if (fs.existsSync("temp"))
            fs.rmSync("temp", { recursive: true });
        fs.mkdirSync("temp");

        await server.login();
        const dirInfo = await server.getDirInfo("", true);
        fs.writeFileSync("temp_remote.json", JSON.stringify(dirInfo, null, 4));
    })

    let rootNode: SyncNode | undefined = undefined;
    let initCommitId = "";
    test('Fresh pull', async () => {
        const uploads = new Set<SyncNode>();
        const headCommitId = await server.getHeadCommit();
        initCommitId = headCommitId;
        let remoteRoot = await server.getCommitRoot(headCommitId);
        const newRoot = (await sync.pull(uploads, "", rootNode, remoteRoot))![0];

        fs.writeFileSync("temp_local.json", JSON.stringify(newRoot.toJson(), null, 4));

        expect(newRoot.cache!.id).toBe(remoteRoot.id);
        expect(newRoot.dirty).toBeFalsy();
        expect(newRoot.state.type).toBe("sync");

        rootNode = newRoot;

    });

    test('Remote upload', async () => {
        await server.uploadFile("/test.txt", new TextEncoder().encode("Hello world!"), false);
        const dirInfo = await server.getDirInfo("", true);
        fs.writeFileSync("temp_remote.json", JSON.stringify(dirInfo, null, 4));
        const headCommitId = await server.getHeadCommit();
        let remoteRoot = await server.getCommitRoot(headCommitId);
        const newRoot = (await sync.pull(new Set<SyncNode>(), "", rootNode, remoteRoot))![0];

        fs.writeFileSync("temp_local.json", JSON.stringify(newRoot.toJson(), null, 4));

        expect(newRoot.cache!.id).toBe(remoteRoot.id);
        expect(newRoot.dirty).toBeFalsy();
        expect(newRoot.state.type).toBe("sync");

        rootNode = newRoot;
    });

    test('Remote move', async () => {
        await server.batchMove("/.obsidian", ["plugins"], "/abc");
        const dirInfo = await server.getDirInfo("", true);
        fs.writeFileSync("temp_remote.json", JSON.stringify(dirInfo, null, 4));
        const headCommitId = await server.getHeadCommit();
        let remoteRoot = await server.getCommitRoot(headCommitId);
        const newRoot = (await sync.pull(new Set<SyncNode>(), "", rootNode, remoteRoot))![0];

        fs.writeFileSync("temp_local.json", JSON.stringify(newRoot.toJson(), null, 4));

        expect(newRoot.cache!.id).toBe(remoteRoot.id);
        expect(newRoot.dirty).toBeFalsy();
        expect(newRoot.state.type).toBe("sync");

        rootNode = newRoot;
    });

    test('Clean up', async () => {
        await server.revertToCommit(initCommitId);
    });


})