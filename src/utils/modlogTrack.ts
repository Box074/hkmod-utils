import { readFileSync, watchFile } from "fs";
import { platform } from "os";
import { join } from "path";
import { Project, ProjectManager } from "../project/project.js";
import colors from "colors";

var modlogPath: string;
switch (platform()) {
    case "linux":
        modlogPath = "~/.config/unity3d/Team Cherry/Hollow Knight/ModLog.txt"
        break;
    case "win32":
    default:
        modlogPath = join(process.env["AppData"] || "", "..", "LocalLow", "Team Cherry", "Hollow Knight", "ModLog.txt");
        break;
}
colors.enable();
const levels = {
    "[FINE]:": (text: string) => console.log(text.grey),
    "[INFO]:": (text: string) => console.log(text),
    "[DEBUG]:": (text: string) => console.log(text.grey),
    "[ERROR]:": (text: string) => console.log(text.red),
    "[WARN]:": (text: string) => console.log(text.yellow)
};



export class ModLogTrack {
    public static currentWord: number = 0;
    public static Init(path: string | undefined = undefined, options: {}) {
        watchFile(path || modlogPath,
            {
                "interval": 100
            }, (curr, prev) => {

            if (curr.mtime.getTime() <= prev.mtime.getTime()) return;

            try {
                let willExit = false;
                let data = readFileSync(modlogPath, "utf-8");
                let nextP = data.length;
                if(nextP < this.currentWord)
                {
                    this.currentWord = 0;
                    console.clear();
                }
                let lines = data.substring(this.currentWord).trim().split("\n");
                this.currentWord = nextP;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    let l = Object.keys(levels).find(val => line.startsWith(val));
                    if (l == undefined) continue;
                    let body = line.substring(l.length).trim();
                    let name = "";
                    let info = body;
                    if (body[0] == "[") {
                        name = body.substring(1, body.indexOf("]"));
                        info = body.substring(5 + name.length);
                    }
                    info = info.trim();
                    levels[l](line);
                    if(options["autoExit"] && line.indexOf("[INFO]:[UNITY] - Shutting down Steam API.") != -1) willExit = true;
                }
                if(willExit)
                {
                    process.exit(0);
                }

            } catch (e) {

            }
        });
    }
}
