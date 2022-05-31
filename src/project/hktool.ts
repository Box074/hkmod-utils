import { execSync, spawnSync } from "child_process";
import { gzip } from "compressing";
import { existsSync, readFileSync, write, writeFileSync } from "fs";
import { dirname, join } from "path";
import { execArgv } from "process";
import { text } from "stream/consumers";
import { gzipSync } from "zlib";
import { Project, ProjectCache, ProjectDependency, ProjectManager } from "./project.js";

export class HKToolConfig {
    public needVersion: string | undefined;
    public referenceLib: boolean = true;
    public compressResources: boolean = true;
    public modifyIL: boolean = true;
    public inlineHook: boolean = true;
    public modRes: {} = {};
}

export class SpriteConfig {
    public name: string = "";
    public uv: number[] | undefined;
    public pixel: number[] | undefined;
    public pivot: number[] | undefined;
    public pixelsPerUnit: number | undefined;
}

export class ResConfig {
    public name: string = "";
    public type: string = "byte";
    public spriteCollectionName: string | undefined;
    public sprites: SpriteConfig[] | undefined;
}

var resTypes = {
    tex: function (n: string, sn: string, cfg: ResConfig) {
        let s = "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static UnityEngine.Texture2D __{sn} = null!;\n" +
            "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static UnityEngine.Texture2D {sn}\n    {\n" +
            "        get {\n" +
            "            if(__{sn} == null) {\n" +
            "                __{sn} = new UnityEngine.Texture2D(1, 1);\n" +
            "                __{sn}.LoadImage(typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\"));\n" +
            "            }\n" +
            "            return __{sn};\n" +
            "        }\n    }\n";

        if (cfg != null) {
            let sprites: string = "";
            let isFirst: boolean = true;
            if (cfg.sprites) {
                for (let i = 0; i < cfg.sprites.length; i++) {
                    const sprite = cfg.sprites[i];
                    s += ("    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static UnityEngine.Sprite _SR_{spn} = null!;\n" +
                        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static UnityEngine.Sprite {spn}\n    {\n" +
                        "        get {\n" +
                        "            if(_SR_{spn} == null) {\n" +
                        "                 var tex = {sn};\n"+
                        "                _SR_{spn} = UnityEngine.Sprite.Create(tex, new UnityEngine.Rect("+ (sprite.uv ? (sprite.uv[0] == 0 ? "0f" : "tex.width * " + sprite.uv[0] + "f") : (sprite.pixel ? sprite.pixel[0] + "f" : "0f")) +
                        ", "+ (sprite.uv ? (sprite.uv[1] == 0 ? "0f" : "tex.height * " + sprite.uv[1] + "f") : (sprite.pixel ? sprite.pixel[1] + "f" : "0f")) +
                        ", "+ (sprite.uv ? (sprite.uv[2] == 0 ? "0f" : "tex.width * " + sprite.uv[2] + "f") : (sprite.pixel ? sprite.pixel[2] + "f" : "0f")) +
                        ", "+ (sprite.uv ? (sprite.uv[3] == 0 ? "0f" : "tex.height * " + sprite.uv[3] + "f") : (sprite.pixel ? sprite.pixel[3] + "f" : "0f")) +
                        "), new UnityEngine.Vector2("+ (sprite.pivot ? sprite.pivot[0] : "0.5") +"f, "+ (sprite.pivot ? sprite.pivot[1] : "0.5") +"f), " + 
                            (sprite.pixelsPerUnit ? sprite.pixelsPerUnit : "64") +"f);\n" +
                        "            }\n" +
                        "            return _SR_{spn};\n" +
                        "        }\n    }\n")
                            .replaceAll("{spn}", sprite.name);
                    if(!isFirst) sprites += ", ";
                    isFirst = true;
                    sprites += sprite.name;
                }
            }
            if(cfg.spriteCollectionName) {
                s += ("    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static UnityEngine.Sprite[] __{sn} = null!;\n" +
                "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static UnityEngine.Sprite[] {sn}\n    {\n" +
                "        get {\n" +
                "            if(__{sn} == null) {\n" +
                "                __{sn} = new UnityEngine.Sprite[]{ " + sprites +" };\n" +
                "            }\n" +
                "            return __{sn};\n" +
                "        }\n    }\n").replaceAll("{sn}", cfg.spriteCollectionName)
            }
        }

        return s.replaceAll("{sn}", sn).replaceAll("{n}", n)
    },
    assetbundle: (n: string, sn: string) => (
        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static UnityEngine.AssetBundle __{sn} = null!;\n" +
        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static UnityEngine.AssetBundle {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = UnityEngine.AssetBundle.LoadFromStream(typeof(ModRes).Assembly.GetManifestResourceStream(\"{n}\"));\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    bytes: (n: string, sn: string) => (
        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static byte[] __{sn} = null!;\n" +
        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static byte[] {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\");\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    text: (n: string, sn: string) => (
        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static string __{sn} = null!;\n" +
        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static string {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = System.Text.Encoding.UTF8.GetString(typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\"));\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    stream: (n: string, sn: string) => (
        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static System.IO.Stream {sn} => typeof(ModRes).Assembly.GetManifestResourceStream(\"{n}\");\n"
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
        if(config.needVersion == undefined) s += "[assembly: HKTool.Attributes.NeedHKToolVersionAttribute(HKTool.ModBase.compileVersion)]\n";
        else s += "[assembly: HKTool.Attributes.NeedHKToolVersionAttribute(\"" + config.needVersion + "\")]\n";
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
        let args = [ join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "..", "bin", "net6.0", "ILModify.dll"), project.hktool.inlineHook ? "1" : "0", outpath];
        for (let i = 0; i < libraries.length; i++) {
            args.push(libraries[i].path);
        }
        let result = spawnSync("dotnet", args, {
            encoding: "ascii"
        });
        if(result.status != 0)
        {
            console.error(result.stderr);
        }
    }
    public static generateResInfo(project: Project): string {
        if (!project.hktool?.modRes) return "";
        let res = project.hktool?.modRes;
        let sb = `[System.Runtime.CompilerServices.CompilerGeneratedAttribute]\ninternal static class ModRes\n{\n    static ModRes()\n{        HKTool.InitManager.CheckInit();\n    }\n`;
        for (const key in res) {
            let info = res[key];
            let typeName: string;
            let csName: string;
            let cfg: ResConfig | undefined;
            if (typeof (info) == "string") {
                typeName = info;
                csName = key.replaceAll('.', '_').toUpperCase();
            } else {
                cfg = info as ResConfig;
                typeName = cfg.type;
                csName = cfg.name ?? key.replaceAll('.', '_').toUpperCase();
            }
            let type = resTypes[typeName.toLocaleLowerCase()] as Function | undefined;
            if (!type) continue;
            sb += type.call(this, key, csName, cfg);
        }
        sb += "\n}";
        return sb;
    }
}
