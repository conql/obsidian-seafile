import { describe, jest, test } from "@jest/globals";
import Server, { Commit } from "../server";
import * as utils from "../utils";
import * as env from "./env";
import { posix as Path } from "path-browserify";

describe("Server", () => {
    
	const server = new Server(env.host, env.repoName, env.account, env.password, env.deviceName, env.deviceId);

	test("Login", async () => {
		await server.login();
	});

	let headCommitId = "";
	test("Get Head commit Id", async () => {
		headCommitId = await server.getHeadCommitId();
	});

	let headCommit: Commit;
	test("Get commit", async () => {
		headCommit = await server.getCommitInfo(headCommitId);
	});

	test("Get fs", async () => {
		const fs = await server.getFs(headCommit.root_id);
	});

	let files = [];
	test("List all", async () => {
		const tree = await server.getDirInfo("/", true);
		files = tree.map((file) => {
			return {
				path: Path.join(file.parent_dir, file.name),
				mtime: file.mtime,
				size: file.size ?? -1,
			};
		});
		// console.log(files);
	});

	test("Upload file", async () => {
		await server.uploadFile("/test.txt", new TextEncoder().encode("Hello World!"), false);
		await server.uploadFile("/test.txt", new TextEncoder().encode("Test 2"), false);
	});

	test("Revert to commit", async () => {
		await server.revertToCommit(headCommitId);
	});

});