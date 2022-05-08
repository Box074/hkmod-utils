import { readFileSync, writeFileSync, mkdirSync, existsSync, rm, readdirSync, copyFileSync, rmSync, statSync } from "fs";
import { dirname, extname, join, parse, resolve } from "path";
import { URL } from "url";
import { createHash, randomUUID } from "crypto";
import { tmpdir } from "os";
import * as compressing from "compressing";
import { HKToolManager } from "./hktool.js";
import got from "got";
import { GlobalConfigManager } from "../globalConfig.js";
async function downloadFile(url) {
    let g = GlobalConfigManager.tryGet(url);
    if (g !== null)
        return g;
    return new Promise(async (resolve, rejects) => {
        let g = await got({
            url: GlobalConfigManager.tryGetUrl(url),
            responseType: "buffer"
        });
        if (g.statusCode == 200) {
            resolve(g.body);
        }
        else {
            rejects(g.statusMessage);
        }
    });
}
export class ProjectDependency {
    name = "";
    url = "";
    ignoreFiles = undefined;
    copyToOutput = true;
}
export class CSProjectItem {
    constructor(name = "", content = undefined, attr = {}) {
        this.name = name;
        this.content = content;
        this.attr = attr;
    }
    name = "";
    content = undefined;
    attr;
}
export class CSProjectTemplate {
    itemGroup = { name: "ItemGroup", content: [], attr: {} };
    propertyGroup = { name: "PropertyGroup", content: [], attr: {} };
}
export class Project {
    modName = "";
    modVersion = "0.0.0.0";
    codeDir = "./scripts";
    csCompileInfo = true;
    hktool = null;
    enableNullableCheck = true;
    resources = {};
    dependencies = [];
    csproj = new CSProjectTemplate();
    bindingLogger = [];
}
export class ProjectDependencyCache {
    name = "";
    url = "";
    md5 = {};
    files = {};
}
export class ProjectCache {
    cacheRoot = "";
    dependencies = [];
}
export class ProjectDependenciesManager {
    static getMD5(path) {
        if (!existsSync(path))
            return "";
        return createHash("md5").update(readFileSync(path)).digest("hex");
    }
    static getMD5FromBuffer(buffer) {
        return createHash("md5").update(buffer).digest("hex");
    }
    static async downloadDependencies(item, cache, cacheRoot) {
        cache.url = item.url;
        var data = await downloadFile(cache.url);
        var ignoreFiles = item.ignoreFiles || [];
        var path = new URL(cache.url).pathname;
        if (path.endsWith(".zip")) {
            var temp = join(tmpdir(), randomUUID());
            mkdirSync(temp);
            var zipFile = join(tmpdir(), randomUUID() + ".zip");
            writeFileSync(zipFile, data);
            await compressing.zip.uncompress(zipFile, temp);
            let files = readdirSync(temp);
            for (let i = 0; i < files.length; i++) {
                let v = files[i];
                let p = resolve(temp, v);
                let status = statSync(p);
                if (status.isDirectory())
                    continue;
                if (ignoreFiles.indexOf(parse(v).base) != -1) {
                    continue;
                }
                var md5 = this.getMD5(p);
                var destpath = join(cacheRoot, md5 + extname(v));
                cache.md5[destpath] = md5;
                cache.files[parse(p).base] = destpath;
                copyFileSync(p, destpath);
            }
            rmSync(zipFile);
            rmSync(temp, { recursive: true });
        }
        else {
            var md5 = this.getMD5FromBuffer(data);
            var p = join(cacheRoot, md5 + extname(path));
            cache.md5[p] = md5;
            cache.files[parse(path).base] = p;
            writeFileSync(p, data);
        }
    }
    static async checkProject(cache, project) {
        return new Promise((resolve, rejects) => {
            this.cleanupCache(cache, project);
            var count = 0;
            async function missing(item, element) {
                ProjectDependenciesManager.removeDependency(item);
                count++;
                await ProjectDependenciesManager.downloadDependencies(element, item, cache.cacheRoot);
                count--;
                if (count == 0) {
                    resolve();
                }
            }
            var apiU = project.dependencies.find((val) => val.name == "Modding API");
            if (apiU == null) {
                apiU = new ProjectDependency();
                project.dependencies.push(apiU);
            }
            apiU.name = "Modding API";
            apiU.url = "https://github.com/hk-modding/api/releases/latest/download/ModdingApiWin.zip";
            apiU.ignoreFiles = [
                "MMHOOK_PlayMaker.dll",
                "Mono.Cecil.dll",
                "MonoMod.RuntimeDetour.dll",
                "MonoMod.Utils.dll"
            ];
            apiU.copyToOutput = false;
            var baseU = project.dependencies.find((val) => val.name == "Vanilla");
            if (baseU == null) {
                baseU = new ProjectDependency();
                project.dependencies.push(baseU);
            }
            baseU.name = "Vanilla";
            baseU.url = "https://files.catbox.moe/i4sdl6.zip";
            baseU.ignoreFiles = [
                "Assembly-CSharp.dll",
                "mscorlib.dll",
                "Newtonsoft.Json.dll"
            ];
            baseU.copyToOutput = false;
            HKToolManager.onCheckDependencies(project);
            project.dependencies.forEach(async (element) => {
                var dep = cache.dependencies.find((val, i, obj) => {
                    if (val.name == element.name)
                        return true;
                    return false;
                });
                if (!dep) {
                    dep = new ProjectDependencyCache();
                    dep.name = element.name;
                    cache.dependencies.push(dep);
                }
                if (dep.url != element.url || Object.keys(dep.files).length == 0) {
                    missing(dep, element);
                }
                for (var v in dep.md5) {
                    if (!existsSync(v)) {
                        missing(dep, element);
                        break;
                    }
                    if (this.getMD5(v) != dep.md5[v]) {
                        missing(dep, element);
                        break;
                    }
                }
            });
            if (count == 0)
                resolve();
        });
    }
    static removeDependency(cache) {
        if (cache == null)
            return;
        Object.keys(cache.md5).forEach((val, i, array) => {
            if (existsSync(val)) {
                rm(val, (err) => { });
            }
        });
        cache.md5 = {};
        cache.files = {};
    }
    static cleanupCache(cache, project) {
        var newTable = [];
        for (var i = 0; i < cache.dependencies.length; i++) {
            var val = cache.dependencies[i];
            if (project.dependencies.findIndex((v) => v != null && v.name == val.name) == -1) {
                this.removeDependency(val);
            }
            else {
                newTable.push(val);
            }
        }
        cache.dependencies = newTable;
    }
}
export class ProjectManager {
    static async getLibraries(project, cache) {
        var refs = [];
        //Dependencies
        await ProjectDependenciesManager.checkProject(cache, project);
        for (let index = 0; index < project.dependencies.length; index++) {
            const element = project.dependencies[index];
            if (element.copyToOutput == undefined) {
                element.copyToOutput = true;
            }
            let c = cache.dependencies.find((val) => val.name == element.name);
            if (c != null) {
                for (let v in c.files) {
                    let p = parse(v);
                    if (p.ext == ".dll") {
                        refs.push({
                            name: p.name,
                            path: c.files[v],
                            copy: element.copyToOutput
                        });
                    }
                }
            }
        }
        return refs;
    }
    static loadProject(path = null) {
        if (path == null) {
            path = "./modProject.json";
        }
        return JSON.parse(readFileSync(resolve(path), "utf-8"));
    }
    static saveProject(project, path = null) {
        if (path == null) {
            path = "./modProject.json";
        }
        writeFileSync(resolve(path), JSON.stringify(project, null, 4));
    }
    static loadProjectCache(path = null) {
        if (path == null) {
            path = "./modProject.json";
        }
        var cachePath = resolve(join(dirname(resolve(path)), "projectCache.json"));
        var cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf-8")) : new ProjectCache();
        cache.cacheRoot = resolve(join(dirname(cachePath), "caches"));
        mkdirSync(cache.cacheRoot, { recursive: true });
        return cache;
    }
    static saveProjectCache(cache, path = null) {
        if (path == null) {
            path = "./modProject.json";
        }
        writeFileSync(resolve(join(dirname(resolve(path)), "projectCache.json")), JSON.stringify(cache, null, 4));
    }
}
