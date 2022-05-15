import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { gzipSync } from "zlib";
import { ProjectDependency, ProjectManager } from "./project.js";
export class HKToolConfig {
    referenceLib = true;
    compressResources = true;
    modifyIL = true;
    modRes = {};
}
var resTypes = {
    tex: (n, sn) => ("    [System.Runtime.CompilerServices.DiscardableAttribute] private static UnityEngine.Texture2D? __{sn} = null;\n" +
        "    [System.Runtime.CompilerServices.DiscardableAttribute] public static UnityEngine.Texture2D {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = new UnityEngine.Texture2D(1, 1);\n" +
        "                __{sn}.LoadImage(typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\"));\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    assetbundle: (n, sn) => ("    [System.Runtime.CompilerServices.DiscardableAttribute] private static UnityEngine.AssetBundle? __{sn} = null;\n" +
        "    [System.Runtime.CompilerServices.DiscardableAttribute] public static UnityEngine.AssetBundle {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = AssetBundle.LoadFromStream(typeof(ModRes).Assembly.GetManifestResourceStream(\"{n}\"));\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    bytes: (n, sn) => ("    [System.Runtime.CompilerServices.DiscardableAttribute] private static byte[]? __{sn} = null;\n" +
        "    [System.Runtime.CompilerServices.DiscardableAttribute] public static byte[] {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\");\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    text: (n, sn) => ("    [System.Runtime.CompilerServices.DiscardableAttribute] private static string? __{sn} = null;\n" +
        "    [System.Runtime.CompilerServices.DiscardableAttribute] public static string {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = Encoding.UTF8.GetString(typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\"));\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    stream: (n, sn) => ("    [System.Runtime.CompilerServices.DiscardableAttribute] public static System.IO.Stream {sn} => typeof(ModRes).Assembly.GetManifestResourceStream(\"{n}\");\n").replaceAll("{sn}", sn).replaceAll("{n}", n)
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
        let args = [join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "..", "bin", "net6.0", "ILModify.dll"), outpath];
        for (let i = 0; i < libraries.length; i++) {
            args.push(libraries[i].path);
        }
        spawnSync("dotnet", args, {
            encoding: "binary"
        });
    }
    static generateResInfo(project) {
        if (!project.hktool?.modRes)
            return "";
        let res = project.hktool?.modRes;
        let sb = `[System.Runtime.CompilerServices.CompilerGeneratedAttribute]\ninternal static class ModRes\n{`;
        for (const key in res) {
            let info = res[key];
            let typeName;
            let csName;
            if (typeof (info) == "string") {
                typeName = info;
                csName = key.replaceAll('.', '_').toUpperCase();
            }
            else {
                typeName = info.type;
                csName = info.name ?? key.replaceAll('.', '_').toUpperCase();
            }
            let type = resTypes[typeName.toLocaleLowerCase()];
            if (!type)
                continue;
            sb += type.call(this, key, csName);
        }
        sb += "\n}";
        return sb;
    }
}
