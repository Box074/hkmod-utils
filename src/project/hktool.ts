import { execSync, spawnSync } from "child_process";
import { gzip } from "compressing";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { execArgv } from "process";
import { gzipSync } from "zlib";
import { Project, ProjectCache, ProjectDependency, ProjectManager } from "./project.js";

export class HKToolConfig {
    public referenceLib: boolean = true;
    public compressResources: boolean = true;
    public modifyIL: boolean = true;
}

export class HKToolManager {
    public static onProcessingResources(config: HKToolConfig | null, res: string) {
        if (config == null) return;
        if (!existsSync(res)) return;
        if (config.compressResources) {
            writeFileSync(res, gzipSync(readFileSync(res)));
        }
    }
    public static onGenerateCS(project: Project): string {
        
        let config = project.hktool;
        let s = "";
        /*s += `[assembly: System.Reflection.AssemblyVersionAttribute("${project.modVersion}")]\n
                [assembly: System.Reflection.AssemblyFileVersion("${project.modVersion}")]\n
                `;*/
        
        if(config == null) return "";
        if(config.compressResources) {
            s += "[assembly: HKTool.Attributes.EmbeddedResourceCompressionAttribute()]\n";
        }
        return s;
    }
    public static onCheckDependencies(project: Project) {
        let config = project.hktool;
        if (config == null) return;
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
    public static async onModifyIL(outpath: string, project: Project, cache: ProjectCache) {
        if(!project.hktool?.modifyIL) return;
        let libraries = await ProjectManager.getLibraries(project, cache);
        let args = [ join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "bin", "net6.0", "ILModify.dll"), outpath ];
        for(let i = 0 ; i < libraries.length ; i++) {
            args.push(libraries[i].path);
        }
        spawnSync("dotnet", args, {
            encoding: "utf-8"
        });
    }
}
