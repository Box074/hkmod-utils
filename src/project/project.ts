import { program } from "commander";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rm, readdirSync, copyFileSync, rmdirSync, rmSync, statSync } from "fs";
import { dirname, extname, join, parse, resolve } from "path";
import { URL } from "url";
import { createHash, randomUUID } from "crypto";
import { tmpdir } from "os";
import * as compressing from "compressing";
import { HKToolConfig, HKToolManager } from "./hktool.js";
import got from "got";
import { GlobalConfigManager } from "../globalConfig.js";
import { exec, spawn, spawnSync } from "child_process";
import { rejects } from "assert";
import { url } from "inspector";

async function downloadFile(url: string) {
    let g = GlobalConfigManager.tryGet(url);
    if (g !== null) return g;
    return new Promise<Buffer>(async (resolve, rejects) => {
        let g = await got({
            url: GlobalConfigManager.tryGetUrl(url),
            responseType: "buffer"
        });
        if (g.statusCode == 200) {
            resolve(g.body);
        } else {
            rejects(g.statusMessage);
        }

    });

}


export class ProjectDependency {
    public name: string = "";
    public url: string = "";
    public ignoreFiles: string[] | undefined;
}

export class CSProjectItem {
    public constructor(name: string = "", content: string | CSProjectItem[] | undefined = undefined, attr: {} = {}) {
        this.name = name;
        this.content = content;
        this.attr = attr;
    }
    public name: string = "";
    public content: string | CSProjectItem[] | undefined = undefined;
    public attr: {};
}

export class CSProjectTemplate {
    public itemGroup: CSProjectItem = { name: "ItemGroup", content: [], attr: {} };
    public propertyGroup: CSProjectItem = { name: "PropertyGroup", content: [], attr: {} };
}

export class Project {
    public modName: string = "";
    public modVersion: string = "0.0.0.0";
    public codeDir: string = "./scripts";
    public libraryDir: string | undefined = "./library";
    public csCompileInfo: boolean = true;
    public hktool: HKToolConfig | undefined = undefined;
    public enableNullableCheck: boolean = true;
    public resources: {} = {};
    public dependencies: ProjectDependency[] = [];
    public csproj: CSProjectTemplate = new CSProjectTemplate();
    public bindingLogger: string[] = []
}

export class ProjectDependencyCache {
    public name: string = "";
    public url: string = "";
    public md5: {} = {};
    public files: {} = {};
    public hooks: {} = {};
}

export class ProjectCache {
    public cacheRoot: string = "";
    public dependencies: ProjectDependencyCache[] = [];
}

export class ProjectDependenciesManager {
    public static getMD5(path: string): string {
        if (!existsSync(path)) return "";
        return createHash("md5").update(readFileSync(path)).digest("hex");
    }
    public static getMD5FromBuffer(buffer: Buffer) {
        return createHash("md5").update(buffer).digest("hex");
    }
    public static async genHook(project: Project, cache: ProjectDependencyCache, cacheRoot: string) {
        if (!project?.hktool?.inlineHook) return;
        cache.hooks = cache.hooks || {};
        return new Promise((resolve, rejects) => {
            let count = 0;
            for (const key in cache.files) {
                if (Object.prototype.hasOwnProperty.call(cache.files, key)) {
                    const element = cache.files[key];
                    if(parse(key).ext != ".dll") continue;
                    count++;
                    let ls = spawn("dotnet",
                        [join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "..", "bin", "monomod", "MonoMod.RuntimeDetour.HookGen.dll"), "--orig", "--private", element]);
                    ls.on("exit", (code) => {
                        let hookFile = join(parse(element).dir, "MMHOOK_" + parse(element).name + ".dll");
                        
                        if (existsSync(hookFile)) {
                            cache.hooks["MMHOOK_" + key] = hookFile;
                            spawn("dotnet", [join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "..", "bin", "net5.0", "ILModify.dll"), "2", hookFile])
                            .on("exit", (code2) => {
                                count--;
                                console.error(hookFile);
                                console.error("HookGen(" + count + "):" + key);
                                if (count <= 0) resolve(undefined);
                            });
                            /*console.log(
                                spawnSync("dotnet", [join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "..", "bin", "net6.0", "ILModify.dll"), "2", hookFile], 
                                {
                                    "encoding": "ascii"
                                }).output
                            );*/
                        }

                    });

                }
            }
        });
    }
    public static async downloadDependencies(project: Project, item: ProjectDependency, cache: ProjectDependencyCache, cacheRoot: string) {
        cache.url = item.url;
        console.error("downloading: " + item.url);
        var data = await downloadFile(cache.url);
        console.error("download finished: " + item.url);
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
                if (status.isDirectory()) continue;
                if (ignoreFiles.indexOf(parse(v).base) != -1 || (project.hktool?.inlineHook && parse(v).base.startsWith("MMHOOK_"))) {
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
        await this.genHook(project, cache, cacheRoot);
    }
    public static findCache(cache: ProjectCache, dep: ProjectDependency): ProjectDependencyCache | undefined {
        return cache.dependencies.find((val, i, obj) => {
            if (val.name == dep.name) return true;
            return false;
        });
    }
    public static async checkProject(cache: ProjectCache, project: Project) {
        return new Promise<void>((resolve, rejects) => {
            this.cleanupCache(cache, project);
            let count = 0;
            let allCount = 0;
            async function missing(item: ProjectDependencyCache, element: ProjectDependency) {
                ProjectDependenciesManager.removeDependency(item);
                count++;
                allCount++;
                await ProjectDependenciesManager.downloadDependencies(project, element, item, cache.cacheRoot);
                count--;
                console.error("complete("+ (allCount - count) +"/" + allCount +"): " + element.name);
                if (count == 0) {
                    resolve();
                }
            }
            var apiU = project.dependencies.find((val) => val.name == "Modding API");
            if (apiU == null) {
                apiU = new ProjectDependency();
                project.dependencies.push(apiU);
                apiU.name = "Modding API";
                apiU.url = "https://github.com/hk-modding/api/releases/latest/download/ModdingApiWin.zip";
                apiU.ignoreFiles = [
                    "MMHOOK_PlayMaker.dll",
                    "Mono.Cecil.dll",
                    "MonoMod.RuntimeDetour.dll",
                    "MonoMod.Utils.dll"
                ];

            }

            var baseU = project.dependencies.find((val) => val.name == "Vanilla");
            if (baseU == null) {
                baseU = new ProjectDependency();
                project.dependencies.push(baseU);
                baseU.name = "Vanilla";
                baseU.url = "https://files.catbox.moe/i4sdl6.zip";
                baseU.ignoreFiles = [
                    "Assembly-CSharp.dll",
                    "mscorlib.dll",
                    "Newtonsoft.Json.dll"
                ];

            }

            HKToolManager.onCheckDependencies(project);
            project.dependencies.forEach(async element => {
                var dep = cache.dependencies.find((val, i, obj) => {
                    if (val.name == element.name) return true;
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
            if (count == 0) resolve();
        });
    }
    public static removeDependency(cache: ProjectDependencyCache) {
        if (cache == null) return;
        Object.keys(cache.md5).forEach((val, i, array) => {
            if (existsSync(val)) {
                rm(val, (err) => { });
            }
        });
        if (cache.hooks) Object.keys(cache.hooks).forEach((val, i, array) => {
            let fn = cache.hooks[val];
            if (existsSync(fn)) {
                rm(fn, (err) => { });
            }
        });
        cache.md5 = {};
        cache.files = {};
        cache.hooks = {};
    }
    public static cleanupCache(cache: ProjectCache, project: Project) {
        var newTable: any[] = [];
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
    public static async getLibraries(project: Project, cache: ProjectCache): Promise<{ name: string; path: string; copy: boolean; }[]> {
        var refs: { name: string; path: string; copy: boolean; }[] = [];
        //Dependencies

        await ProjectDependenciesManager.checkProject(cache, project);

        for (let index = 0; index < project.dependencies.length; index++) {
            const element = project.dependencies[index];

            let c = cache.dependencies.find((val) => val.name == element.name);
            if (c != null) {
                for (let v in c.files) {
                    let p = parse(v);
                    if (p.ext == ".dll") {
                        refs.push({
                            name: p.name,
                            path: c.files[v],
                            copy: false
                        });
                    }
                }
                if (c.hooks) {
                    for (let v in c.hooks) {
                        let p = parse(v);
                        if (p.ext == ".dll") {
                            refs.push({
                                name: p.name,
                                path: c.hooks[v],
                                copy: false
                            });
                        }
                    }
                }
            }
        }
        if (project.libraryDir && existsSync(project.libraryDir)) {
            let files = readdirSync(project.libraryDir, "utf8");
            for (let i = 0; i < files.length; i++) {
                const file = resolve(project.libraryDir, files[i]);
                refs.push({
                    name: parse(file).name,
                    path: file,
                    copy: true
                });
            }
        }
        return refs;
    }
    public static loadProject(path: string | null = null): Project {
        if (path == null) {
            path = "./modProject.json";
        }
        return JSON.parse(readFileSync(resolve(path), "utf-8"));
    }
    public static saveProject(project: Project, path: string | null = null) {
        if (path == null) {
            path = "./modProject.json";
        }
        project["$schema"] = "https://github.com/HKLab/hkmod-utils/raw/master/schemca/modProject.json";
        writeFileSync(resolve(path), JSON.stringify(project, null, 4));
    }
    public static loadProjectCache(path: string | null = null): ProjectCache {
        if (path == null) {
            path = "./modProject.json";
        }
        var cachePath = resolve(join(dirname(resolve(path)), "projectCache.json"));
        var cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf-8")) as ProjectCache : new ProjectCache();
        cache.cacheRoot = resolve(join(dirname(cachePath), "caches"));
        mkdirSync(cache.cacheRoot, { recursive: true });
        return cache;
    }
    public static saveProjectCache(cache: ProjectCache, path: string | null = null) {
        if (path == null) {
            path = "./modProject.json";
        }
        writeFileSync(resolve(join(dirname(resolve(path)), "projectCache.json")), JSON.stringify(cache, null, 4));
    }
}
