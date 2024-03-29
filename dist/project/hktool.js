import { spawn, spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, parse } from "path";
import { gzipSync } from "zlib";
import { ProjectDependency, ProjectManager } from "./project.js";
export const bindir = join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "..", "bin", "net6.0");
export class HKToolConfig {
    needVersion;
    referenceLib = true;
    compressResources = true;
    modifyIL = true;
    inlineHook = true;
    externRes = true;
    allPublic = false;
    modRes = {};
}
export class SpriteConfig {
    name = "";
    uv;
    pixel;
    pivot;
    pixelsPerUnit;
}
export class ResConfig {
    name = "";
    type = "byte";
    assets;
    spriteCollectionName;
    sprites;
}
var resTypes = {
    tex: function (n, sn, cfg) {
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
            let sprites = "";
            let isFirst = true;
            if (cfg.sprites) {
                for (let i = 0; i < cfg.sprites.length; i++) {
                    const sprite = cfg.sprites[i];
                    s += ("    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static UnityEngine.Sprite _SR_{spn} = null!;\n" +
                        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static UnityEngine.Sprite {spn}\n    {\n" +
                        "        get {\n" +
                        "            if(_SR_{spn} == null) {\n" +
                        "                 var tex = {sn};\n" +
                        "                _SR_{spn} = UnityEngine.Sprite.Create(tex, new UnityEngine.Rect(" + (sprite.uv ? (sprite.uv[0] == 0 ? "0f" : "tex.width * " + sprite.uv[0] + "f") : (sprite.pixel ? sprite.pixel[0] + "f" : "0f")) +
                        ", " + (sprite.uv ? (sprite.uv[1] == 0 ? "0f" : "tex.height * " + sprite.uv[1] + "f") : (sprite.pixel ? sprite.pixel[1] + "f" : "0f")) +
                        ", " + (sprite.uv ? (sprite.uv[2] == 0 ? "0f" : "tex.width * " + sprite.uv[2] + "f") : (sprite.pixel ? sprite.pixel[2] + "f" : "0f")) +
                        ", " + (sprite.uv ? (sprite.uv[3] == 0 ? "0f" : "tex.height * " + sprite.uv[3] + "f") : (sprite.pixel ? sprite.pixel[3] + "f" : "0f")) +
                        "), new UnityEngine.Vector2(" + (sprite.pivot ? sprite.pivot[0] : "0.5") + "f, " + (sprite.pivot ? sprite.pivot[1] : "0.5") + "f), " +
                        (sprite.pixelsPerUnit ? sprite.pixelsPerUnit : "64") + "f);\n" +
                        "            }\n" +
                        "            return _SR_{spn};\n" +
                        "        }\n    }\n")
                        .replaceAll("{spn}", sprite.name);
                    if (!isFirst)
                        sprites += ", ";
                    isFirst = true;
                    sprites += sprite.name;
                }
            }
            if (cfg.spriteCollectionName) {
                s += ("    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static UnityEngine.Sprite[] __{sn} = null!;\n" +
                    "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static UnityEngine.Sprite[] {sn}\n    {\n" +
                    "        get {\n" +
                    "            if(__{sn} == null) {\n" +
                    "                __{sn} = new UnityEngine.Sprite[]{ " + sprites + " };\n" +
                    "            }\n" +
                    "            return __{sn};\n" +
                    "        }\n    }\n").replaceAll("{sn}", cfg.spriteCollectionName);
            }
        }
        return s.replaceAll("{sn}", sn).replaceAll("{n}", n);
    },
    assetbundle: function (n, sn, cfg) {
        let s = ("    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static UnityEngine.AssetBundle __{sn} = null!;\n" +
            "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static UnityEngine.AssetBundle {sn}\n    {\n" +
            "        get {\n" +
            "            if(__{sn} == null) {\n" +
            "                __{sn} = UnityEngine.AssetBundle.LoadFromMemory(typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\"));\n" +
            "            }\n" +
            "            return __{sn};\n" +
            "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n);
        if (cfg.assets) {
            for (const key in cfg.assets) {
                if (Object.prototype.hasOwnProperty.call(cfg.assets, key)) {
                    const el = cfg.assets[key];
                    s += ("    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static {type} __{sn}__{assetName} = null!;\n" +
                        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static {type} {sn}_{assetName}\n    {\n" +
                        "        get {\n" +
                        "            if(__{sn}__{assetName} == null) {\n" +
                        "                __{sn}__{assetName} = {sn}.LoadAsset<{type}>(\"{n}\");\n" +
                        "            }\n" +
                        "            return  __{sn}__{assetName};\n" +
                        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{assetName}", parse(key).name).replaceAll("{type}", el).replaceAll("{n}", key);
                }
            }
        }
        return s;
    },
    bytes: (n, sn) => ("    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static byte[] __{sn} = null!;\n" +
        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static byte[] {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\");\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    text: (n, sn) => ("    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] private static string __{sn} = null!;\n" +
        "    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static string {sn}\n    {\n" +
        "        get {\n" +
        "            if(__{sn} == null) {\n" +
        "                __{sn} = System.Text.Encoding.UTF8.GetString(typeof(ModRes).Assembly.GetManifestResourceBytes(\"{n}\"));\n" +
        "            }\n" +
        "            return __{sn};\n" +
        "        }\n    }\n").replaceAll("{sn}", sn).replaceAll("{n}", n),
    stream: (n, sn) => ("    [System.Runtime.CompilerServices.CompilerGeneratedAttribute] public static System.IO.Stream {sn} => typeof(ModRes).Assembly.GetManifestResourceStream(\"{n}\");\n").replaceAll("{sn}", sn).replaceAll("{n}", n)
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
    static onProcessingResourcesEx(config, res) {
        if (config == null)
            return res;
        if (config.compressResources) {
            return gzipSync(res);
        }
        return res;
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
        let args = [join(bindir, "ILModify.dll"), project.hktool.inlineHook ? "1" : "0", outpath];
        for (let i = 0; i < libraries.length; i++) {
            args.push(libraries[i].path);
        }
        let result = spawnSync("dotnet", args, {
            encoding: "utf-8"
        });
        if (result.status != 0) {
            console.log(args.join(' '));
            console.error(result.stderr);
        }
    }
    static async setAllPublic(path, project) {
        return new Promise((resolve, reject) => {
            if ((!project.hktool?.allPublic) || (parse(path).ext != ".dll")) {
                resolve(false);
                return;
            }
            let args = [join(bindir, "ILModify.dll"), "3", path];
            let result = spawn("dotnet", args);
            result.stderr.setEncoding("utf-8");
            result.on("exit", (code) => {
                if (code != 0) {
                    reject(result.stderr.read());
                }
                console.error(result.stderr.read());
                resolve(true);
            });
        });
    }
    static async onGenRefHelper(outpath, project, cache) {
        if (!project.hktool?.modifyIL)
            return;
        let libraries = await ProjectManager.getLibraries(project, cache);
        let args = [join(bindir, "RefHelperGen.dll"), join(outpath, "RefHelper.dll")];
        for (let i = 0; i < libraries.length; i++) {
            if (libraries[i].name.startsWith("MMHOOK_") || libraries[i].name.startsWith("RefHelper"))
                continue;
            args.push(libraries[i].path);
        }
        let result = spawnSync("dotnet", args, {
            encoding: "utf-8"
        });
        if (result.status != 0) {
            console.error(result.stderr);
        }
        cache.refHelper = join(outpath, "RefHelper.dll");
    }
    static generateResInfo(project, isBuild) {
        if (!project.hktool?.modRes)
            return "";
        let res = project.hktool?.modRes;
        let sb = `[System.Runtime.CompilerServices.CompilerGeneratedAttribute]\ninternal static class ModRes\n{\n    static ModRes()\n{        HKTool.InitManager.CheckInit();\n    }\n`;
        for (const key in res) {
            let info = res[key];
            let typeName;
            let csName;
            let cfg;
            if (typeof (info) == "string") {
                typeName = info;
                csName = key.replaceAll('.', '_').toUpperCase();
            }
            else {
                cfg = info;
                typeName = cfg.type;
                csName = cfg.name ?? key.replaceAll('.', '_').toUpperCase();
            }
            let type = resTypes[typeName.toLocaleLowerCase()];
            if (!type)
                continue;
            sb += type.call(this, key, csName, cfg);
        }
        sb += "\n}";
        return sb;
    }
}
//# sourceMappingURL=hktool.js.map