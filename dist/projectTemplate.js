import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
const template = join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "template");
export function copyTemplateTo(dest, project) {
    dest = resolve(dest);
    writeFileSync(join(dest, ".gitignore"), readFileSync(join(template, "gitignore"), "utf-8"), "utf-8");
    let packageJson = join(dest, "package.json");
    let pj = existsSync(packageJson) ? JSON.parse(readFileSync(packageJson, "utf-8")) : {};
    pj.devDependencies = pj.devDependencies || {};
    pj.devDependencies["hkmod-utils"] = "^0.1.0";
    pj.scripts = pj.scripts || {};
    pj.scripts.build = "hkmod build -CZ -H256 > Info.txt";
    pj.scripts.csproj = "hkmod generateCsproj";
    writeFileSync(packageJson, JSON.stringify(pj, undefined, 4), "utf-8");
    let gha = join(dest, ".github", "workflows");
    mkdirSync(gha, { recursive: true });
    writeFileSync(join(gha, "build.yml"), readFileSync(join(template, "githubAction.yml"), "utf-8"), "utf-8");
    let readme = join(dest, "README.md");
    writeFileSync(join(readme), readFileSync(join(template, "README.md"), "utf-8").replaceAll("{{modName}}", project.modName), "utf-8");
}
