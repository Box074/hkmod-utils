import * as ws from "nodejs-websocket";
import colors from "colors";
colors.enable();
const levels = {
    "[FINE]:": (text) => console.log(text.grey),
    "[INFO]:": (text) => console.log(text),
    "[DEBUG]:": (text) => console.log(text.grey),
    "[ERROR]:": (text) => console.log(text.red),
    "[WARN]:": (text) => console.log(text.yellow)
};
export class DebugServer {
    static port;
    static init() {
        ws.createServer(conn => {
            if (conn.path == "/modlog") {
                this.modLogTrack(conn);
            }
        }).listen(DebugServer.port);
    }
    static modLogTrack(conn) {
        conn.on("text", (text) => {
            let lines = text.split("\n");
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
                levels[l](line);
            }
        });
    }
}
//# sourceMappingURL=Server.js.map