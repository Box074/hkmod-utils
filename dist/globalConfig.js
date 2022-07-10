import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, parse } from "path";
function readlineSync() {
    return new Promise((resolve, reject) => {
        process.stdin.resume();
        process.stdin.setEncoding("utf8");
        process.stdin.on('data', function (data) {
            process.stdin.pause(); // stops after one line reads
            resolve(data.toString());
        });
    });
}
export class GlobalConfig {
    steamLocation = "";
    redirectDependency = {};
    redirectHost = {};
    debugPort = 9955;
}
export class GlobalConfigManager {
    static configPath = join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "config.json");
    //public static configPath: string = join((process.env["APPDATA"] || platform() == "linux" ?  "/etc" : dirname(dirname(new URL(import.meta.url).pathname.substring(1)))), "hkmodUtils.json");
    static loadConfig() {
        return existsSync(this.configPath) ? JSON.parse(readFileSync(this.configPath, "utf-8")) : new GlobalConfig();
    }
    static saveConfig(config) {
        writeFileSync(this.configPath, JSON.stringify(config, undefined, 4), "utf-8");
    }
    static tryGet(url) {
        let config = this.loadConfig();
        let f = config.redirectDependency[url];
        if (f == undefined)
            return null;
        if (!existsSync(f))
            return null;
        return readFileSync(f);
    }
    static tryGetUrl(url) {
        let config = this.loadConfig();
        let u = new URL(url);
        let f = config.redirectHost[u.host];
        if (f == undefined)
            return u;
        u.host = f;
        return u;
    }
    static async getSteamPath() {
        function invaildPath(path) {
            console.error("Invalid steam install location: " + path);
            throw "Invalid steam install location: " + path;
        }
        let config = this.loadConfig();
        let steamPath = config.steamLocation;
        if (steamPath && existsSync(steamPath))
            return steamPath;
        console.log("Please enter the steam installation location");
        steamPath = (await readlineSync()).trim();
        console.log(steamPath);
        if (steamPath == "")
            invaildPath(steamPath);
        let p = parse(steamPath);
        if (p.ext == ".exe") {
            if (!existsSync(steamPath))
                invaildPath(steamPath);
            config.steamLocation = steamPath;
        }
        if (p.name == "Steam") {
            steamPath = join(steamPath, "steam.exe");
            if (!existsSync(steamPath))
                invaildPath(steamPath);
            config.steamLocation = steamPath;
        }
        this.saveConfig(config);
        return steamPath;
    }
}
//# sourceMappingURL=globalConfig.js.map