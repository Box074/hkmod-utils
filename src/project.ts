import { program } from "commander";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rm, readdirSync, copyFileSync, rmdirSync, rmSync, statSync } from "fs";
import { dirname, extname, join, parse, resolve } from "path";
import { URL } from "url";
import { createHash, randomUUID } from "crypto";
import { tmpdir } from "os";
import * as compressing from "compressing";
import { HKToolConfig, HKToolManager } from "./hktool.js";
import got from "got";
import { GlobalConfigManager } from "./globalConfig.js";

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
    public ignoreFiles: string[] | undefined = undefined;
    public copyToOutput: boolean | undefined = true;
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
    public csCompileInfo: boolean = true;
    public dependencies: ProjectDependency[] = [];
    public hktool: HKToolConfig | null = null;
    public csproj: CSProjectTemplate = new CSProjectTemplate();
    public enableNullableCheck: boolean = true;
    public resources: {} = {};
}

export class ProjectDependencyCache {
    public name: string = "";
    public url: string = "";
    public md5: {} = {};
    public files: {} = {};
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
    public static async downloadDependencies(item: ProjectDependency, cache: ProjectDependencyCache, cacheRoot: string) {
        cache.url = item.url;

        var data = await downloadFile(cache.url);
        var ignoreFiles = item.ignoreFiles || [];
        var path = new URL(cache.url).pathname;
        console.log(cache.url);
        if (path.endsWith(".zip")) {
            var temp = join(tmpdir(), randomUUID());
            mkdirSync(temp);
            
            console.log(temp);
            var zipFile = join(tmpdir(), randomUUID() + ".zip");
            writeFileSync(zipFile, data);
            console.log(zipFile);
            await compressing.zip.uncompress(zipFile, temp);
            
            let files = readdirSync(temp);
            for (let i = 0; i < files.length; i++) {
                let v = files[i];
                console.log(v);
                let p = resolve(temp, v);
                let status = statSync(p);
                if (status.isDirectory()) continue;
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
    public static async checkProject(cache: ProjectCache, project: Project) {
        return new Promise<void>((resolve, rejects) => {
            this.cleanupCache(cache, project);
            var count = 0;
            async function missing(item: ProjectDependencyCache, element: ProjectDependency) {
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
        cache.md5 = {};
        cache.files = {};
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
