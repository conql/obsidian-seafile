import { describe, expect, jest, test } from '@jest/globals';
import { RequestUrlParam, RequestUrlResponse, RequestUrlResponsePromise, requestUrl } from "obsidian";
import Server, { Commit, RequestParam } from '../server';
import Filesystem from '../filesystem';
import * as env from "./env";
import * as utils from "../utils";

jest.mock("../filesystem");

describe('Server', () => {
    let server = new Server(env.host, env.repoName, env.account, env.password, env.deviceName, env.deviceId, new Filesystem());

    test('Login', async () => {
        await server.login();
    });

    let headCommitId = "";
    test('Get Head commit Id', async () => {
        headCommitId = await server.getHeadCommit();
    });

    let headCommit: Commit;
    test('Get commit', async () => {
        headCommit = await server.getCommitInfo(headCommitId);
    });

    test('Get fs', async () => {
        let fs = await server.getFs(headCommit.root_id);
    });

    let files = [];
    test('List all', async () => {
        const tree = await server.getDirInfo("/", true);
        files = tree.map((file) => {
            return {
                path: utils.Path.join(file.parent_dir, file.name),
                mtime: file.mtime,
                size: file.size ?? -1,
            }
        });
        // console.log(files);
    });

    test('Upload file', async () => {
        await server.uploadFile("/test.txt", new TextEncoder().encode("Hello World!"), false);
        await server.uploadFile("/test.txt", new TextEncoder().encode("Test 2"), false);
    });

    test('Revert to commit', async () => {
        await server.revertToCommit(headCommitId);
    });

});