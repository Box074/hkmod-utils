import { execSync, spawnSync } from "child_process";
import { gzip } from "compressing";
import { existsSync, readFileSync, write, writeFileSync } from "fs";
import { dirname, join } from "path";
import { execArgv } from "process";
import { text } from "stream/consumers";
import { gzipSync } from "zlib";
import { Project, ProjectCache, ProjectDependency, ProjectManager } from "./project.js";

export class HKToolConfig {
    public referenceLib: boolean = true;
    public compressResources: boolean = true;
    public modifyIL: boolean = true;
    public modRes: {} = {};
}

var resTypes = {
    tex: (n: string, sn: string) => (
        "    [System.Runtime.CompilerServices.DiscardableAttribute] private static UnityEngine.Texture2D? __{sn} = null;\n" +
        "    [System.Runtime.CompilerServices.DiscardableAttribute] public static UnityEngine.Texture2D {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = new UnityEngine.Texture2D(1, 1);\n" +
        "                __{sn}.LoadImage(typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\"));\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    assetbundle: (n: string, sn: string) => (
        "    [System.Runtime.CompilerServices.DiscardableAttribute] private static UnityEngine.AssetBundle? __{sn} = null;\n" +
        "    [System.Runtime.CompilerServices.DiscardableAttribute] public static UnityEngine.AssetBundle {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = AssetBundle.LoadFromStream(typeof(ModRes).Assembly.GetManifestResourceStream(\"{n}\"));\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    bytes: (n: string, sn: string) => (
        "    [System.Runtime.CompilerServices.DiscardableAttribute] private static byte[]? __{sn} = null;\n" +
        "    [System.Runtime.CompilerServices.DiscardableAttribute] public static byte[] {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\");\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    text: (n: string, sn: string) => (
        "    [System.Runtime.CompilerServices.DiscardableAttribute] private static string? __{sn} = null;\n" +
        "    [System.Runtime.CompilerServices.DiscardableAttribute] public static string {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = Encoding.UTF8.GetString(typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\"));\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    stream: (n: string, sn: string) => (
        "    [System.Runtime.CompilerServices.DiscardableAttribute] public static System.IO.Stream {sn} => typeof(ModRes).Assembly.GetManifestResourceStream(\"{n}\");\n" 
    ).replaceAll("{sn}", sn).replaceAll("{n}", n)
};
resTypes["tex2d"] = resTypes.tex;
resTypes["texture"] = resTypes.tex;
resTypes["texture2d"] = resTypes.tex;
resTypes["utf8"] = resTypes.text;
resTypes["binary"] = resTypes.bytes;
resTypes["bin"] = resTypes.bytes;
resTypes["ab"] = resTypes.assetbundle;
resTypes["asset"] = resTypes.assetbundle;

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

        if (config == null) return "";
        if (config.compressResources) {
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
        if (!project.hktool?.modifyIL) return;
        let libraries = await ProjectManager.getLibraries(project, cache);
        let args = [join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "..", "bin", "net6.0", "ILModify.dll"), outpath];
        for (let i = 0; i < libraries.length; i++) {
            args.push(libraries[i].path);
        }
        spawnSync("dotnet", args, {
            encoding: "binary"
        });
    }
    public static generateResInfo(project: Project): string {
        if (!project.hktool?.modRes) return "";
        let res = project.hktool?.modRes;
        let sb = `[System.Runtime.CompilerServices.CompilerGeneratedAttribute]\ninternal static class ModRes\n{`;
        for (const key in res) {
            let info = res[key];
            let typeName: string;
            let csName: string;
            if(typeof(info) == "string") {
                typeName = info;
                csName = key.replaceAll('.', '_').toUpperCase();
            } else {
                typeName = info.type;
                csName = info.name ?? key.replaceAll('.', '_').toUpperCase();
            }
            let type = resTypes[typeName.toLocaleLowerCase()] as Function | undefined;
            if (!type) continue;
            sb += type.call(this, key, csName);
        }
        sb += "\n}";
        return sb;
    }
}
