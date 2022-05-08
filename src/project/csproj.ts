import { writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { generateCSInfo } from "./infocs.js";
import { CSProjectItem, Project, ProjectCache, ProjectManager } from "./project.js";

export class ResourceInfo {
    public name: string;
    public path: string;
}
export class CSProjectManager {
    public static generateCSproj(items: CSProjectItem[]): string {
        var proj = '<Project Sdk="Microsoft.NET.Sdk">';
        function parseItem(item: CSProjectItem, space: string): string {
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
            } else {
                s += ">";
                if (typeof (item.content) == "string") {
                    s += item.content;
                } else {
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
        proj += "\n</Project>"
        return proj;
    }
    public static async addDevOption(itemGroup: CSProjectItem[], propertyGroup: CSProjectItem[], project: Project, cache: ProjectCache) {
        propertyGroup.push(
            new CSProjectItem("AssemblyName", project.modName),
            new CSProjectItem("TargetFramework", "net472"),
            new CSProjectItem("Version", project.modVersion),
            new CSProjectItem("EnableDefaultItems", "false"),
            new CSProjectItem("EnableDefaultCompileItems", "false"),
            new CSProjectItem("Nullable", project.enableNullableCheck ? "enable" : "disable"),
            new CSProjectItem("DebugType", "portable"),
            new CSProjectItem("OutputType", "Library"),
            new CSProjectItem("LangVersion", "preview"),
            new CSProjectItem("DebugSymbols", "true")
        );
        let dep = await ProjectManager.getLibraries(project, cache);

        for (let i = 0; i < dep.length; i++) {
            const element = dep[i];
            //console.dir(element);
            itemGroup.push(
                new CSProjectItem("Reference", [
                    new CSProjectItem("HintPath", element.path),
                    new CSProjectItem("Private", element.copy ? "true" : "false")
                ], {
                    "Include": element.name
                })
            );
        }
        let root = dirname(cache.cacheRoot);

        if (project.csCompileInfo) {
            let compileInfo = resolve(project.codeDir || "./scripts", "..", "CompileInfo.cs");
            writeFileSync(compileInfo, generateCSInfo(project), "utf-8");
            itemGroup.push(
                new CSProjectItem("Compile", undefined, {
                    "Include": resolve(project.codeDir || "./scripts", "**", "*.cs")
                }),
                new CSProjectItem("Compile", undefined, {
                    "Include": compileInfo
                })
            );
        }

    }
}
