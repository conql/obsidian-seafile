import { describe, expect, jest, test } from '@jest/globals';
import Server, { Commit, DirInfo } from '../server';
import fs from 'fs'
import * as env from "./env";
import { SyncController } from '../sync/controller';
import { SyncNode } from '../sync/node';
import { Path } from '../utils';
import { MockPlugin } from './mock_plugin';

describe("Daemon test", () => {
    const server = new Server(env.host, env.repoName, env.account, env.password, env.deviceName, env.deviceId);
    let sync: SyncController;
    const initCommitId = "972bc78ee451967aa782010a2114131073c3f6c5";
    test('Preparation', async () => {
        // init vault by removing all files
        if (fs.existsSync("temp"))
            fs.rmSync("temp", { recursive: true });
        fs.mkdirSync("temp");

        await server.login();
        await server.revertToCommit(initCommitId);
        const rootNode = await SyncNode.init();
        sync = new SyncController(15000, server, rootNode, ".obsidian");
    })

    test('Daemon', async () => {
        sync.startSync();
        // wait for 10 mins
        await new Promise(r => setTimeout(r, 10 * 60 * 1000));
    }, 10 * 60 * 1000);
})