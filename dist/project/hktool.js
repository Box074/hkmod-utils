import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { gzipSync } from "zlib";
import { ProjectDependency, ProjectManager } from "./project.js";
export class HKToolConfig {
    referenceLib = true;
    compressResources = true;
    modifyIL = true;
}
export class HKToolManager {
    static onProcessingResources(config, res) {
        if (config == null)
            return;
        if (!existsSync(res))
            return;
        if (config.compressResources) {
            writeFileSync(res, gzipSync(readFileSync(res)));
        }
    }
    static onGenerateCS(project) {
        let config = project.hktool;
        let s = "";
        /*s += `[assembly: System.Reflection.AssemblyVersionAttribute("${project.modVersion}")]\n
                [assembly: System.Reflection.AssemblyFileVersion("${project.modVersion}")]\n
                `;*/
        if (config == null)
            return "";
        if (config.compressResources) {
            s += "[assembly: HKTool.Attributes.EmbeddedResourceCompressionAttribute()]\n";
        }
        return s;
    }
    static onCheckDependencies(project) {
        let config = project.hktool;
        if (config == null)
            return;
        if (config.referenceLib) {
            let hr = project.dependencies.find(x => x.name == "HKTool");
            if (hr == null) {
                hr = new ProjectDependency();
                project.dependencies.push(hr);
            }
            hr.name = "HKTool";
            hr.url = "https://github.com/HKLab/HollowKnightMod.Tool/releases/latest/download/Output.zip";
        }
    }
    static async onModifyIL(outpath, project, cache) {
        if (!project.hktool?.modifyIL)
            return;
        let libraries = await ProjectManager.getLibraries(project, cache);
        let args = [join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "bin", "net6.0", "ILModify.dll"), outpath];
        for (let i = 0; i < libraries.length; i++) {
            args.push(libraries[i].path);
        }
        spawnSync("dotnet", args, {
            encoding: "utf-8"
        });
    }
}
