import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { HKToolManager } from "./hktool.js";
import { generateCSInfo } from "./infocs.js";
import { CSProjectItem, ProjectManager } from "./project.js";
export class ResourceInfo {
    name;
    path;
}
export class CSProjectManager {
    static generateCSproj(items) {
        var proj = '<Project Sdk="Microsoft.NET.Sdk">';
        function parseItem(item, space) {
            var s = "\n" + space + "<" + item.name;
            if (item.attr != null) {
                var keys = Object.keys(item.attr);
                if (keys.length > 0) {
                    for (let i = 0; i < keys.length; i++) {
                        const n = keys[i];
                        s += " " + n + "=\"" + item.attr[n] + "\"";
                    }
                }
            }
            if (item.content == undefined) {
                s += "/>\n";
            }
            else {
                s += ">";
                if (typeof (item.content) == "string") {
                    s += item.content;
                }
                else {
                    var sp = space + "  ";
                    for (let i = 0; i < item.content.length; i++) {
                        const element = item.content[i];
                        s += parseItem(element, sp);
                    }
                    s += "\n" + space;
                }
                s += "</" + item.name + ">";
            }
            return s;
        }
        for (let index = 0; index < items.length; index++) {
            const element = items[index];
            proj += parseItem(element, "  ");
        }
        proj += "\n</Project>";
        return proj;
    }
    static async addDevOption(itemGroup, propertyGroup, project, cache, isBuild) {
        propertyGroup.push(new CSProjectItem("AssemblyName", project.modName), new CSProjectItem("TargetFramework", "net472"), new CSProjectItem("Version", project.modVersion), new CSProjectItem("EnableDefaultItems", "false"), new CSProjectItem("EnableDefaultCompileItems", "false"), new CSProjectItem("Nullable", project.enableNullableCheck ? "enable" : "disable"), new CSProjectItem("DebugType", "portable"), new CSProjectItem("OutputType", "Library"), new CSProjectItem("LangVersion", "preview"), new CSProjectItem("DebugSymbols", "true"), new CSProjectItem("Optimize", "true"));
        let dep = await ProjectManager.getLibraries(project, cache);
        for (let i = 0; i < dep.length; i++) {
            const element = dep[i];
            //console.dir(element);
            itemGroup.push(new CSProjectItem("Reference", [
                new CSProjectItem("HintPath", element.path),
                new CSProjectItem("Private", element.copy ? "true" : "false")
            ], {
                "Include": element.name
            }));
        }
        let root = dirname(cache.cacheRoot);
        if (project.csCompileInfo) {
            let compileInfo = resolve(project.codeDir || "./scripts", "..", "caches", "CompileInfo.cs");
            let modRes = resolve(project.codeDir || "./scripts", "..", "caches", "ModResInfo.cs");
            writeFileSync(compileInfo, generateCSInfo(project), "utf-8");
            writeFileSync(modRes, HKToolManager.generateResInfo(project, isBuild), "utf-8");
            itemGroup.push(new CSProjectItem("Compile", undefined, {
                "Include": resolve(project.codeDir || "./scripts", "**", "*.cs")
            }), new CSProjectItem("Compile", undefined, {
                "Include": compileInfo
            }), new CSProjectItem("Compile", undefined, {
                "Include": modRes
            }));
        }
    }
}
//# sourceMappingURL=csproj.js.map