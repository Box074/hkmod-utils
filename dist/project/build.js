import { randomUUID } from "crypto";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { CSProjectManager } from "./csproj.js";
import { HKToolManager } from "./hktool.js";
import { CSProjectItem, CSProjectTemplate } from "./project.js";
export class BuildManager {
    static async generateCSProj(project, cache, output, res, extCS) {
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
        await CSProjectManager.addDevOption(items, ps, project, cache);
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
        let extCS = join(dir, "hktool.cs");
        writeFileSync(extCS, HKToolManager.onGenerateCS(project), "utf-8");
        writeFileSync(join(dir, "build.csproj"), await this.generateCSProj(project, cache, output, res, [extCS]));
        return dir;
    }
}
