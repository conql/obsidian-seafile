import { RequestUrlParam, RequestUrlResponse, RequestUrlResponsePromise, requestUrl } from "obsidian";
import pRetry from "p-retry";
import pThrottle from "p-throttle";
import pTimeout from "p-timeout";
import * as utils from "./utils";
const pako = require('pako');
const manifestJson = require('../manifest.json') ?? { id: "obsidian-seafile", version: "0.0.0" };


export const ZeroFs = "0000000000000000000000000000000000000000";
export type SeafFs = FileSeafFs | DirSeafFs;
export type SeafFsResult = [string, SeafFs | null];

export type MODE_FILE = 33188;
export type MODE_DIR = 16384;
export const MODE_FILE = 33188;
export const MODE_DIR = 16384;

export const TYPE_FILE = 1;
export const TYPE_DIR = 3;

export interface FileSeafFs {
    block_ids: Array<string>;
    size: number
    type: number;
    version: number;
}

export interface DirSeafFs {
    dirents: Array<SeafDirent>;
    type: number;
    version: number;
}

export type SeafDirent = DirSeafDirent | FileSeafDirent;

export interface DirSeafDirent {
    id: string;
    mode: MODE_DIR;
    mtime: number; // timestamp in seconds!
    name: string;
}

export interface FileSeafDirent {
    id: string;
    mode: MODE_FILE;
    modifier: string;
    mtime: number; // timestamp in seconds!
    name: string;
    size: number;
}

export class RequestParam {
    url: string;
    method?: string;
    contentType?: string;
    responseType?: "json" | "binary" | "text";
    body?: string | ArrayBuffer;
    headers?: Record<string, string>;
    retry?: number;
}

export interface Commit {
    commit_id: string;
    root_id: string;
    repo_id: string;
    creator_name: string;
    creator: string;
    description: string;
    ctime: number;
    parent_id: string;
    second_parent_id?: string;
    repo_name: string;
    repo_desc: string;
    repo_category?: string;
    device_name: string;
    client_version: string;
    version: number;
}
export interface Repo {
    type: string;
    id: string;
    owner: string;
    owner_name: string;
    owner_contact_email: string;
    name: string;
    mtime: number;
    modifier_email: string;
    modifier_contact_email: string;
    modifier_name: string;
    mtime_relative: string;
    size: number;
    size_formatted: string;
    encrypted: boolean;
    permission: string;
    virtual: boolean;
    root: string;
    head_commit_id: string;
    version: number;
    salt: string;
}

export interface DirInfo {
    type: 'dir' | 'file',
    parent_dir: string,
    id: string,
    name: string,
    mtime: number,
    permission: 'rw',
    modifier_email?: string,
    size?: number,
    modifier_contact_email?: string,
    modifier_name?: string,
}

export type CommitChanges = {
    addedFiles: string[];
    removedFiles: string[];
    renamedFiles: string[];
    modifiedFiles: string[];
    addedDirectories: string[];
    removedDirectories: string[];
    renamedDirectories: string[];
};

export default class Server {
    private authToken: string;
    private repoId: string;
    private repoToken: string;

    public constructor(
        private host: string, private repoName: string,
        private account: string, private password: string,
        private deviceName: string, private deviceId: string) {
    }

    public getAccount() {
        return this.account;
    }

    public async login(): Promise<void> {
        await pTimeout((async () => {
            this.authToken = await this.getAuthToken();
            this.repoId = await this.getRepoId(this.repoName);
            this.repoToken = await this.getRepoToken(this.repoId);
        })(), { milliseconds: 10 * 1000 });
    }


    request(req: RequestUrlParam & RequestParam): RequestUrlResponsePromise {
        return pTimeout(requestUrl(req), { milliseconds: 120 * 1000 }) as any as RequestUrlResponsePromise;
    }

    private requestThrottled = pThrottle({ interval: 1000, limit: 15 })(this.request);
    async sendRequest(param: RequestParam) {
        let req: RequestUrlParam & RequestParam = { ...param };
        req.throw = false;
        req.retry = req.retry || 1;
        req.method = req.method || "GET";

        let resp = await pRetry(async () => this.requestThrottled(req), { retries: param.retry });
        let status = resp.status.toString();
        let ret = null;

        if (req.responseType === "text") {
            ret = await resp.text;
        } else if (req.responseType === "binary") {
            ret = await resp.arrayBuffer;
        } else {
            ret = await resp.json;
            if (ret.error_msg)
                throw new Error(ret.error_msg);
        }

        if (!status.startsWith("2") && !status.startsWith("3")) {
            throw new Error(`HTTP ${status}. Response: ${JSON.stringify(ret)}`);
        }

        return ret;
    }

    async requestSeafHttp(req: RequestParam) {
        if (!req.headers) req.headers = {};
        req.headers["Seafile-Repo-Token"] = this.repoToken;
        req.url = `${this.host}/seafhttp/${req.url}`

        return this.sendRequest(req);
    }

    async requestAPIv20(req: RequestParam) {
        if (!req.headers) req.headers = {};
        req.headers["Authorization"] = `Token ${this.authToken}`;
        req.url = `${this.host}/api2/${req.url}`
        return this.sendRequest(req);
    }

    async requestAPIv21(req: RequestParam) {
        if (!req.headers) req.headers = {};
        req.headers["Authorization"] = `Token ${this.authToken}`;
        req.url = `${this.host}/api/v2.1/${req.url}`
        return this.sendRequest(req);
    }

    async getAuthToken(): Promise<string> {
        let params = new URLSearchParams();
        params.append("username", this.account);
        params.append("password", this.password);
        params.append("device_name", this.deviceName);
        params.append("device_id", this.deviceId);
        params.append("client_version", "obsidian_plugin");
        params.append("platform", "windows");

        let resp = await this.request({
            url: `${this.host}/api2/auth-token/`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString(),
            throw: false
        });

        if (resp.status != 200) {
            throw new Error(`Failed to get token: HTTP ${resp.status}`);
        }

        let data = await resp.json;
        return data.token;
    }

    async getRepoId(name: string) {
        let resp = await this.requestAPIv20({ url: `repos/` }) as Array<Repo>;
        let repo = resp.find((repo) => repo.name == name);
        if (!repo)
            throw new Error("Repo not found");
        return repo.id;
    }

    async getRepoInfo(repoId: string) {
        let resp = await this.requestAPIv20({ url: `repos/${repoId}/download-info/` });
        return resp;
    }

    async getRepoToken(repoId: string): Promise<string> {
        return this.getRepoInfo(repoId).then(resp => resp.token);
    }

    async getDirInfo(path: string, recursive = false): Promise<DirInfo[]> {
        path = encodeURIComponent(path);
        let resp = await this.requestAPIv20({ url: `repos/${this.repoId}/dir/?p=${path}&recursive=${recursive ? 1 : 0}` });
        return resp;
    }

    async getFileDownloadLink(remotePath: string): Promise<string> {
        remotePath = encodeURIComponent(remotePath);
        let downloadUrl = await this.requestAPIv20({ url: `repos/${this.repoId}/file/?p=${remotePath}` });
        return downloadUrl;
    }

    async getFileContent(remotePath: string): Promise<ArrayBuffer> {
        const fileDownloadLink = await this.getFileDownloadLink(remotePath);
        const downloadResp = await this.request({ url: fileDownloadLink, method: "GET", responseType: "binary", throw: false });
        return await downloadResp.arrayBuffer;
    }

    async renameFile(oldPath: string, newName: string) {
        // oldPath = encodeURIComponent(oldPath);
        // newName = encodeURIComponent(newName);
        let resp = await this.requestAPIv20(
            {
                url: `repos/${this.repoId}/file/?p=${oldPath}`,
                method: 'POST',
                body: `operation=rename&newname=${newName}`,
                contentType: 'application/x-www-form-urlencoded'
            });
        return resp;
    }

    async renameDir(oldPath: string, newName: string) {
        oldPath = encodeURIComponent(oldPath);
        newName = encodeURIComponent(newName);
        let resp = await this.requestAPIv20({
            url: `repos/${this.repoId}/dir/?p=${oldPath}`,
            method: 'POST',
            body: `operation=rename&newname=${newName}`,
            contentType: 'application/x-www-form-urlencoded'
        });
        return resp;
    }

    async batchMove(srcParentDir: string, srcDirents: string[], dstParentDir: string) {
        await this.requestAPIv21({
            url: `repos/sync-batch-move-item/`,
            method: 'POST',
            body: JSON.stringify({
                src_repo_id: this.repoId, src_parent_dir: srcParentDir, src_dirents: srcDirents,
                dst_repo_id: this.repoId, dst_parent_dir: dstParentDir
            }),
            contentType: 'application/json'
        });
    }

    async dirExists(path: string): Promise<boolean> {
        try {
            let dirInfo = await this.getDirInfo(path, false);
            return dirInfo ? true : false;
        }
        catch (e) {
            return false;
        }
    }

    async makeDir(path: string, checkExists = true) {

        if (!path.startsWith("/")) {
            throw new Error("Invalid path. Must start with a slash.");
        }

        if (path == "/")
            return;

        if (checkExists && await this.dirExists(path)) {
            return;
        }

        let baseDir = utils.Path.dirname(path);
        if (await this.dirExists(baseDir) == false) {
            await this.makeDir(baseDir, false);
        }

        path = encodeURIComponent(path);

        let resp = await this.requestAPIv20(
            {
                url: `repos/${this.repoId}/dir/?p=${path}`,
                method: 'POST',
                body: `operation=mkdir`,
                contentType: 'application/x-www-form-urlencoded'
            });
        return resp;
    }

    public async uploadFile(remotePath: string, content: ArrayBuffer, exists: boolean): Promise<RequestUrlResponse> {
        let baseDir = utils.Path.dirname(remotePath);
        let fileName = utils.Path.basename(remotePath);

        let mode = exists ? "update" : "upload";

        let uploadLink: any = {};
        try {
            uploadLink = await this.requestAPIv20({
                url: `repos/${this.repoId}/${mode}-link/?p=${baseDir}`,
                method: "GET"
            });

            try {
                new URL(uploadLink);
            }
            catch (e) {
                throw new Error("Invalid upload link: " + JSON.stringify(uploadLink));
            }
        }
        catch (e) {
            throw new Error("Failed to get upload link. " + e.message);
        }


        const formData = new utils.FormData();
        formData.append("file", content, fileName);
        if (mode == "update") {
            formData.append("target_file", utils.Path.join(baseDir, fileName));
        }
        else if (mode == "upload") {
            formData.append("parent_dir", baseDir);
            formData.append("replace", "1");
        }

        const response = await this.request({
            url: uploadLink + "?ret-json=1",
            method: "POST",
            headers: {
                Authorization: `Token ${this.authToken}`,
                "Content-Type": formData.getContentType(),
            },
            body: await formData.getArrayBuffer(),
            throw: false
        });
        if (response.status != 200) {
            throw new Error("Upload error. " + response.text);
        }
        return await response
    }

    async getHeadCommitId(): Promise<string> {
        let resp = await this.requestSeafHttp({ url: `repo/${this.repoId}/commit/HEAD` });
        return resp.head_commit_id;
    }

    getCommitInfo = utils.memoizeWithLimit(async (commit: string) => {
        let resp = await this.requestSeafHttp({ url: `repo/${this.repoId}/commit/${commit}` });
        return resp as Commit;
    }, 1000)

    async getCommitRoot(commit: string): Promise<DirSeafDirent> {
        const commitInfo = await this.getCommitInfo(commit);
        const rootFs = await this.getFs(commitInfo.root_id);
        return {
            id: commitInfo.root_id,
            mode: MODE_DIR,
            mtime: commitInfo.ctime,
            name: "",
        }
    }
    async createCommit(root_id: string, description: string, parent_id: string, ctime?: number): Promise<Commit> {
        if (!ctime) ctime = Math.floor(Date.now() / 1000);

        const repoId = this.repoId;
        const commit: Commit = {
            commit_id: "",
            root_id,
            repo_id: repoId,
            creator_name: this.account,
            creator: this.deviceId,
            description,
            ctime,
            parent_id,
            repo_name: this.repoName,
            repo_desc: "",
            device_name: this.deviceName,
            client_version: `${manifestJson.id}-${manifestJson.version}`,
            version: 1
        };
        const commit_id = await utils.computeCommitId(commit);
        commit.commit_id = commit_id;

        return commit;
    }

    describeCommit(changes: CommitChanges): string {
        let summary = '';

        // Helper function to format messages
        const formatChange = (count: number, entity: string, isDirectory: boolean = false) => {
            const entityStr = isDirectory ? "directory " : "";
            if (count === 1) {
                return `${entityStr}"${entity}".\n`;
            } else {
                return `${entityStr}"${entity}" and ${count - 1} more ${isDirectory ? "directories" : "files"}.\n`;
            }
        };

        if (changes.addedFiles.length > 0) {
            summary += "Added " + formatChange(changes.addedFiles.length, changes.addedFiles[0]);
        }
        if (changes.modifiedFiles.length > 0) {
            summary += "Modified " + formatChange(changes.modifiedFiles.length, changes.modifiedFiles[0]);
        }
        if (changes.removedFiles.length > 0) {
            summary += "Deleted " + formatChange(changes.removedFiles.length, changes.removedFiles[0]);
        }
        if (changes.renamedFiles.length > 0) {
            summary += "Renamed " + formatChange(changes.renamedFiles.length, changes.renamedFiles[0]);
        }
        if (changes.addedDirectories.length > 0) {
            summary += "Added " + formatChange(changes.addedDirectories.length, changes.addedDirectories[0], true);
        }
        if (changes.removedDirectories.length > 0) {
            summary += "Removed " + formatChange(changes.removedDirectories.length, changes.removedDirectories[0], true);
        }
        if (changes.renamedDirectories.length > 0) {
            summary += "Renamed " + formatChange(changes.renamedDirectories.length, changes.renamedDirectories[0], true);
        }

        return summary.trim();
    }

    async uploadCommit(commit: Commit) {
        await this.requestSeafHttp({ url: `repo/${this.repoId}/commit/${commit.commit_id}`, method: "PUT", body: JSON.stringify(commit), retry: 0, responseType: "text" });
    }

    async setHeadCommit(commit_id: string): Promise<void> {
        await this.requestSeafHttp({ url: `repo/${this.repoId}/commit/HEAD/?head=${commit_id}`, method: "PUT", retry: 0, responseType: "text" });
    }

    async revertToCommit(commit_id: string): Promise<void> {
        await this.requestAPIv21({ url: `repos/${this.repoId}/commits/${commit_id}/revert/`, method: "POST" });
    }

    async getPackFs(fsList: string[]): Promise<Map<string, SeafFsResult>> {
        let result: Map<string, SeafFsResult> = new Map();

        fsList = fsList.filter(id => {
            if (id == ZeroFs) {
                result.set(id, [ZeroFs, null]);
                return false;
            }
            return true;
        });

        if (fsList.length == 0) return result;

        let data = await this.requestSeafHttp({
            url: `repo/${this.repoId}/pack-fs/`,
            method: 'POST',
            body: JSON.stringify(fsList),
            responseType: "binary"
        });

        const utf8Decoder = new TextDecoder('utf-8');
        while (data.byteLength > 0) {
            const id = utf8Decoder.decode(data.slice(0, 40));
            const size = new DataView(data.slice(40, 44)).getUint32(0, false)
            const content: ArrayBuffer = data.slice(44, 44 + size);
            const decompressed = pako.inflate(content);
            const text = utf8Decoder.decode(decompressed);
            const fs = JSON.parse(text) as SeafFs;
            result.set(id, [id, fs]);
            data = data.slice(44 + size);
        }
        return result;
    }
    getFs = utils.memoizeWithLimit<[fs: string], SeafFsResult>(
        utils.packRequest<string, SeafFsResult>(this.getPackFs.bind(this), 10, 200, 100)
        , 1000);

    async sendPackFs(fsList: SeafFsResult[]): Promise<Map<SeafFsResult, boolean>> {
        let result = new Map<SeafFsResult, boolean>();

        // Prepare fs data
        const utf8Encoder = new TextEncoder();
        let data = new Uint8Array();
        for (let task of fsList) {
            const [fsId, fs] = task;
            if (!fs) {
                result.set(task, false);
            }
            else {
                result.set(task, true);
                const fsJson = utils.stringifySeafFs(fs);
                const compressed = pako.deflate(fsJson);
                const idData = utf8Encoder.encode(fsId);
                const sizeBuffer = new ArrayBuffer(4);
                new DataView(sizeBuffer).setUint32(0, compressed.byteLength);
                const combinedData = new Uint8Array(idData.byteLength + sizeBuffer.byteLength + compressed.byteLength);
                combinedData.set(new Uint8Array(idData), 0);
                combinedData.set(new Uint8Array(sizeBuffer), idData.byteLength);
                combinedData.set(new Uint8Array(compressed), idData.byteLength + sizeBuffer.byteLength);
                data = utils.concatTypedArrays(data, combinedData);
            }
        }

        // Send fs data
        const resp = await pRetry(() =>
            this.request({
                url: `${this.host}/seafhttp/repo/${this.repoId}/recv-fs/`,
                method: 'POST',
                headers: {
                    "Seafile-Repo-Token": this.repoToken,
                },
                body: data.buffer,
                throw: false
            }),
            { retries: 0 });

        if (resp.status != 200) {
            throw new Error(`Failed to send pack fs: HTTP ${resp.status}`);
        }

        return result;
    }
    sendFs = utils.packRequest<[string, SeafFs], void>(this.sendPackFs.bind(this), 1, 300, 1000);

    // check if the fs are in the server
    async checkFsList(fsList: string[]): Promise<Map<string, boolean>> {
        const result = new Map<string, boolean>(fsList.map((fsId: string) => [fsId, false]));
        const resp = await this.requestSeafHttp({ url: `repo/${this.repoId}/check-fs/`, method: "POST", body: JSON.stringify(fsList), retry: 0 });
        // resp is an array of not found fs
        resp.forEach((fsId: string) => result.set(fsId, true));
        return result;
    }
    checkFs = utils.packRequest<string, boolean>(this.checkFsList.bind(this), 1, 300, 1000);


    async getBlock(blockId: string): Promise<ArrayBuffer> {
        let resp = await this.requestSeafHttp(
            {
                url: `repo/${this.repoId}/block/${blockId}`,
                responseType: "binary",
                retry: 0
            });
        return resp;
    }

    async sendBlock(id: string, data: ArrayBuffer): Promise<void> {
        let needUpload = await this.checkBlock(id);
        if (needUpload) {
            let resp = await this.requestSeafHttp({ url: `repo/${this.repoId}/block/${id}`, method: "PUT", body: data, retry: 0, responseType: "text" });
        }
    }

    // check if the blocks are in the server
    // returns a map of block indicating whether it needs to be uploaded
    async checkBlocksList(blocksList: string[]): Promise<Map<string, boolean>> {
        let map = new Map<string, boolean>();
        for (let block of blocksList)
            map.set(block, false);

        let resp = await this.requestSeafHttp({ url: `repo/${this.repoId}/check-blocks/`, method: "POST", body: JSON.stringify(blocksList), retry: 0 });
        // resp is an array of not found blocks

        for (let block of resp)
            map.set(block, true);
        return map;
    }
    checkBlock = utils.packRequest<string, boolean>(this.checkBlocksList.bind(this), 1, 300, 1000);


} 
