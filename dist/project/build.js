import { randomUUID } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { CSProjectManager } from "./csproj.js";
import { HKToolManager } from "./hktool.js";
import { CSProjectItem, CSProjectTemplate } from "./project.js";
export class BuildManager {
    static async generateCSProj(project, cache, output, res, extCS, isBuild) {
        project.csproj = project.csproj || new CSProjectTemplate();
        var items = project.csproj.itemGroup.content;
        items = items.splice(0);
        for (let i = 0; i < res.length; i++) {
            const element = res[i];
            items.push(new CSProjectItem("EmbeddedResource", undefined, {
                "Include": element
            }));
        }
        for (let i = 0; i < extCS.length; i++) {
            const element = extCS[i];
            items.push(new CSProjectItem("Compile", undefined, {
                "Include": element
            }));
        }
        var ps = project.csproj.propertyGroup.content;
        ps = ps.splice(0);
        await CSProjectManager.addDevOption(items, ps, project, cache, isBuild);
        ps.push(new CSProjectItem("RootNamespace", ""), new CSProjectItem("ModOutput", output));
        return CSProjectManager.generateCSproj([
            new CSProjectItem("PropertyGroup", ps), new CSProjectItem("ItemGroup", items), new CSProjectItem("Target", [
                new CSProjectItem("Copy", undefined, {
                    "SourceFiles": "$(TargetPath)",
                    "DestinationFolder": "$(ModOutput)"
                }),
                new CSProjectItem("Copy", undefined, {
                    "SourceFiles": "$(TargetDir)$(TargetName).pdb",
                    "DestinationFolder": "$(ModOutput)"
                })
            ], {
                "Name": "PostBuild",
                "AfterTargets": "PostBuildEvent"
            })
        ]);
    }
    static async generateBuildEnv(project, cache, output) {
        let dir = join(tmpdir(), randomUUID());
        mkdirSync(dir, { recursive: true });
        let root = dirname(cache.cacheRoot);
        let res = [];
        let extCS = [];
        let hktoolCS = join(dir, "hktool.cs");
        writeFileSync(hktoolCS, HKToolManager.onGenerateCS(project), "utf-8");
        extCS.push(hktoolCS);
        if (project?.hktool) {
            let resPath = join(output, project.modName + ".modres");
            let names = [];
            let offsets = [];
            let size = [];
            let compress = [];
            let embeddedModRes = !project.hktool.externRes;
            let cache = [];
            let offset = 0;
            for (let key in project.resources) {
                let p = join(root, key);
                if (!existsSync(p))
                    continue;
                let data = readFileSync(p);
                if (data.length >= 1024 * 1024 * 16) {
                    data = HKToolManager.onProcessingResourcesEx(project.hktool, data);
                    compress.push(true);
                }
                else {
                    compress.push(false);
                }
                names.push("\"" + project.resources[key] + "\"");
                offsets.push(offset);
                size.push(data.length);
                cache.push(data);
                offset += data.length;
            }
            if (embeddedModRes) {
                let rp = resolve(dir, "modres");
                writeFileSync(rp, HKToolManager.onProcessingResourcesEx(project.hktool, Buffer.concat(cache)));
                res.push("modres");
            }
            else {
                writeFileSync(resPath, HKToolManager.onProcessingResourcesEx(project.hktool, Buffer.concat(cache)));
            }
            let modResList = join(dir, "modResList.cs");
            writeFileSync(modResList, ("[assembly: HKTool.Attributes.ModResourcesListAttribute(new string[]{ " + names.join(",") +
                "}, new int[]{ " + offsets.join(",") +
                "}, new int[]{ " + size.join(",") +
                "}, new bool[]{ " + compress.join(",") +
                "}, " + (embeddedModRes ? "true" : "false") + ")]\n"), "utf-8");
            extCS.push(modResList);
        }
        else {
            for (let key in project.resources) {
                let p = join(root, key);
                if (!existsSync(p))
                    continue;
                let op = project.resources[key].replaceAll(".", "/");
                let rp = resolve(dir, op);
                mkdirSync(dirname(rp), { recursive: true });
                copyFileSync(p, rp);
                HKToolManager.onProcessingResources(project.hktool, rp);
                res.push(op);
            }
        }
        writeFileSync(join(dir, "build.csproj"), await this.generateCSProj(project, cache, output, res, extCS, true));
        return dir;
    }
}
//# sourceMappingURL=build.js.map