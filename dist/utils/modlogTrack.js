import { readFileSync, watchFile } from "fs";
import { platform } from "os";
import { join } from "path";
import { ProjectManager } from "../project/project.js";
import colors from "colors";
var modlogPath;
switch (platform()) {
    case "linux":
        modlogPath = "~/.config/unity3d/Team Cherry/Hollow Knight/ModLog.txt";
        break;
    case "win32":
    default:
        modlogPath = join(process.env["AppData"] || "", "..", "LocalLow", "Team Cherry", "Hollow Knight", "ModLog.txt");
        break;
}
colors.enable();
const levels = {
    "[FINE]:": (text) => console.log(text.grey),
    "[INFO]:": (text) => console.log(text),
    "[DEBUG]:": (text) => console.log(text.grey),
    "[ERROR]:": (text) => console.log(text.red),
    "[WARN]:": (text) => console.log(text.yellow)
};
export class ModLogTrack {
    static currentWord = 0;
    static Init(path = undefined, options) {
        let project = ProjectManager.loadProject(options["project"]);
        let wsa = options["webSocket"];
        let ws;
        if (wsa != undefined) {
            ws = new WebSocket("ws://" + wsa);
        }
        watchFile(path || modlogPath, (curr, prev) => {
            if (curr.mtime.getTime() <= prev.mtime.getTime())
                return;
            try {
                project = ProjectManager.loadProject(options["project"]);
                let data = readFileSync(modlogPath, "utf-8");
                let nextP = data.length;
                let lines = data.substring(this.currentWord).trim().split("\n");
                this.currentWord = nextP;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    let l = Object.keys(levels).find(val => line.startsWith(val));
                    if (l == undefined)
                        continue;
                    let body = line.substring(l.length).trim();
                    let name = "";
                    let info = body;
                    if (body[0] == "[") {
                        name = body.substring(1, body.indexOf("]"));
                        info = body.substring(5 + name.length);
                    }
                    info = info.trim();
                    if (project.bindingLogger.includes(name)) {
                        if (ws != undefined) {
                            ws.send(JSON.stringify(({
                                name: name,
                                body: body,
                                info: info,
                                full: line
                            })));
                        }
                        levels[l](line);
                    }
                }
            }
            catch (e) {
            }
        });
    }
}
//# sourceMappingURL=modlogTrack.js.map