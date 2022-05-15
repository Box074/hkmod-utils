import { spawnSync } from "child_process";
import { program } from "commander";
import { zip } from "compressing";
import { createHash } from "crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join, parse, resolve } from "path";
import { BuildManager } from "./project/build.js";
import { CSProjectManager } from "./project/csproj.js";
import { GlobalConfigManager } from "./globalConfig.js";
import { HKToolManager } from "./project/hktool.js";
import { CSProjectItem, CSProjectTemplate, Project, ProjectDependenciesManager, ProjectDependency, ProjectManager } from "./project/project.js";
import { copyTemplateTo } from "./project/projectTemplate.js";
import { ModLogTrack } from "./utils/modlogTrack.js";
program.version("0.0.1");
program.command("modlog [modlogPath]")
    .option("-P, --project <projectFile>", undefined, "./modProject.json")
    .option("-WS, --webSocket")
    .action((path, options) => {
    ModLogTrack.Init(path, options);
});
let c_redirect = program.command("redirect");
c_redirect.command("url")
    .argument("<url>")
    .argument("<toPath>")
    .action(async (url, toPath) => {
    let config = GlobalConfigManager.loadConfig();
    let p = resolve(toPath);
    if (!existsSync(p)) {
        program.error("Not find file '${p}'");
    }
    config.redirectDependency = config.redirectDependency || {};
    config.redirectDependency[url] = resolve(toPath);
    GlobalConfigManager.saveConfig(config);
});
c_redirect.command("host")
    .argument("<host>")
    .argument("<toHost>")
    .action(async (host, toHost) => {
    let config = GlobalConfigManager.loadConfig();
    config.redirectHost = config.redirectHost || {};
    config.redirectHost[new URL(host).host] = new URL(toHost).host;
    GlobalConfigManager.saveConfig(config);
});
program.command("build [projectFile]")
    .option("-CZ, --CreateZip", "", false)
    .option("-H256, --SHA256", "", false)
    .action(async (projectFile, options) => {
    let project = ProjectManager.loadProject(projectFile);
    let cache = ProjectManager.loadProjectCache(projectFile);
    ProjectDependenciesManager.cleanupCache(cache, project);
    project.csproj = project.csproj || new CSProjectTemplate();
    let outDir = resolve(projectFile || ".", "Output");
    try {
        if (existsSync(outDir))
            rmSync(outDir, { recursive: true });
    }
    catch (e) {
    }
    mkdirSync(outDir, { recursive: true });
    let csprojDir = await BuildManager.generateBuildEnv(project, cache, outDir);
    let result = spawnSync("dotnet", ["build"], {
        cwd: csprojDir,
        encoding: "ascii"
    });
    rmSync(csprojDir, { recursive: true });
    if (result.status === 0) {
        let outDLL = join(outDir, project.modName + ".dll");
        HKToolManager.onModifyIL(outDLL, project, cache);
        if (options["CreateZip"]) {
            //zip.compressDir(outDir, resolve(projectFile || ".", "Output.zip"));
            let zipS = new zip.Stream();
            let files = readdirSync(outDir);
            for (let i = 0; i < files.length; i++) {
                const file = resolve(outDir, files[i]);
                zipS.addEntry(file, {
                    relativePath: parse(file).base
                });
            }
            let zipP = resolve(projectFile || ".", "Output.zip");
            let outZip = createWriteStream(zipP);
            zipS.pipe(outZip);
            outZip.on("finish", () => {
                if (options["SHA256"]) {
                    console.log(parse(zipP).base + ": " + createHash("sha256").update(readFileSync(zipP)).digest("hex"));
                }
            });
        }
        if (options["SHA256"]) {
            console.log(parse(outDLL).base + ": " + createHash("sha256").update(readFileSync(outDLL)).digest("hex"));
        }
    }
    else {
        console.dir(result);
        program.error(result.stderr + "\nBuild failed");
    }
});
program.command("generateCsproj [outProject]")
    .option("-P, --project <projectFile>", undefined, "./modProject.json")
    .action(async (outProject, options) => {
    var project = ProjectManager.loadProject(options["project"]);
    outProject = outProject || join(dirname(resolve(options["project"])), project.modName + ".csproj");
    var cache = ProjectManager.loadProjectCache(options["project"]);
    ProjectDependenciesManager.cleanupCache(cache, project);
    project.csproj = project.csproj || new CSProjectTemplate();
    var items = project.csproj.itemGroup.content;
    items = items.splice(0);
    var ps = project.csproj.propertyGroup.content;
    ps = ps.splice(0);
    await CSProjectManager.addDevOption(items, ps, project, cache);
    writeFileSync(outProject, CSProjectManager.generateCSproj([new CSProjectItem("PropertyGroup", ps), new CSProjectItem("ItemGroup", items)]));
    ProjectManager.saveProjectCache(cache, options["project"]);
    ProjectManager.saveProject(project, options["project"]);
});
program.command("new")
    .argument("<name>")
    .option("-P, --project <projectFile>", undefined, "./modProject.json")
    .action((name, options) => {
    var project = new Project();
    project.modName = name;
    ProjectManager.saveProject(project, options["project"]);
});
program.command("initTemplate [projectFile]")
    .action((proj) => {
    proj = proj || "./modProject.json";
    let project = ProjectManager.loadProject(proj);
    copyTemplateTo(dirname(resolve(proj)), project);
});
var c_dep = program.command("dependency");
c_dep.command("add")
    .argument("<url>")
    .option("-N, --name <name>")
    .option("-P, --project <projectFile>", undefined, "./modProject.json")
    .action(async (url, options) => {
    var item = new ProjectDependency();
    item.url = url;
    item.name = options["name"] || url;
    var project = ProjectManager.loadProject(options["project"]);
    var cache = ProjectManager.loadProjectCache(options["project"]);
    project.dependencies = project.dependencies || [];
    var dep = project.dependencies.find((val, i, obj) => val.name == item.name);
    if (dep != null) {
        dep.url = item.url;
    }
    else {
        project.dependencies.push(item);
    }
    await ProjectDependenciesManager.checkProject(cache, project);
    ProjectManager.saveProjectCache(cache, options["project"]);
    ProjectManager.saveProject(project, options["project"]);
});
c_dep.command("remove")
    .argument("<name>")
    .option("-P, --project <projectFile>", undefined, "./modProject.json")
    .action((name, options) => {
    var project = ProjectManager.loadProject(options["project"]);
    var cache = ProjectManager.loadProjectCache(options["project"]);
    project.dependencies = project.dependencies || [];
    var newList = [];
    project.dependencies.forEach(element => {
        if (element == null)
            return;
        if (element.name != name)
            newList.push(element);
    });
    project.dependencies = newList;
    ProjectDependenciesManager.cleanupCache(cache, project);
    ProjectManager.saveProjectCache(cache, options["project"]);
    ProjectManager.saveProject(project, options["project"]);
});
program.parse(process.argv);
