import { randomUUID } from "crypto";
import { copyFileSync, existsSync, mkdirSync, open, openSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { CSProjectManager } from "./csproj.js";
import { HKToolManager } from "./hktool.js";
import { CSProjectItem, CSProjectTemplate, Project, ProjectCache } from "./project.js";

export class BuildManager {
    private static async generateCSProj(project: Project, cache: ProjectCache, output: string, res: String[], extCS: String[], isBuild: Boolean): Promise<string> {
        project.csproj = project.csproj || new CSProjectTemplate();
        var items = project.csproj.itemGroup.content as CSProjectItem[];
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
        var ps = project.csproj.propertyGroup.content as CSProjectItem[];
        ps = ps.splice(0);
        await CSProjectManager.addDevOption(items, ps, project, cache, isBuild);
        ps.push(
            new CSProjectItem("RootNamespace", ""),
            new CSProjectItem("ModOutput", output)
        );

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
    public static async generateBuildEnv(project: Project, cache: ProjectCache, output: string): Promise<string> {
        let dir = join(tmpdir(), randomUUID());
        mkdirSync(dir, { recursive: true });
        let root = dirname(cache.cacheRoot);
        let res: String[] = [];
        let extCS: string[] = [];

        let hktoolCS = join(dir, "hktool.cs");
        writeFileSync(hktoolCS, HKToolManager.onGenerateCS(project), "utf-8");
        extCS.push(hktoolCS);

        if (project?.hktool?.externRes) {
            let resPath = join(output, project.modName + ".modres");
            let names: string[] = [];
            let offsets: number[] = [];
            let size: number[] = [];

            let cache: Buffer[] = [];
            let offset = 0;
            for (let key in project.resources) {
                let p = join(root, key);
                if (!existsSync(p)) continue;
                let data = readFileSync(p);

                names.push("\"" + project.resources[key] + "\"");
                offsets.push(offset);
                size.push(data.length);

                cache.push(data);
                offset += data.length;
            }
            writeFileSync(resPath, Buffer.concat(cache));
            HKToolManager.onProcessingResources(project.hktool, resPath);

            let modResList = join(dir, "modResList.cs");
            writeFileSync(modResList, (
                "[assembly: HKTool.Attributes.ModResourcesListAttribute(new string[]{ " + names.join(",") + 
                "}, new int[]{ " + offsets.join(",") + 
                "}, new int[]{ " + size.join(",") + "})]\n"
            ), "utf-8");
            extCS.push(modResList);
            
        }
        else {
            for (let key in project.resources) {
                let p = join(root, key);
                if (!existsSync(p)) continue;
                let op = (project.resources[key] as String).replaceAll(".", "/");
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