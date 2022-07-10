import { existsSync, readFileSync, writeFileSync } from "fs";
import { platform } from "os";
import { dirname, join, parse } from "path";

function readlineSync() {
    return new Promise<string>((resolve, reject) => {
        process.stdin.resume();
        process.stdin.setEncoding("utf8");
        process.stdin.on('data', function (data) {
            process.stdin.pause(); // stops after one line reads
            resolve(data.toString());
        });
    });
}

export class GlobalConfig {
    public steamLocation: string = "";
    public redirectDependency: {} = {};
    public redirectHost: {} = {};
    public debugPort: number = 9955;
}
export class GlobalConfigManager {
    public static configPath: string = join(dirname(new URL(import.meta.url).pathname.substring(1)), "..", "config.json");
    //public static configPath: string = join((process.env["APPDATA"] || platform() == "linux" ?  "/etc" : dirname(dirname(new URL(import.meta.url).pathname.substring(1)))), "hkmodUtils.json");
    public static loadConfig(): GlobalConfig {
        return existsSync(this.configPath) ? JSON.parse(readFileSync(this.configPath, "utf-8")) : new GlobalConfig();
    }
    public static saveConfig(config: GlobalConfig) {
        writeFileSync(this.configPath, JSON.stringify(config, undefined, 4), "utf-8");
    }
    public static tryGet(url: string): Buffer | null {
        let config = this.loadConfig();
        let f = config.redirectDependency[url] as string | undefined;
        if(f == undefined) return null;
        if(!existsSync(f)) return null;
        return readFileSync(f);
    }
    public static tryGetUrl(url: string): URL {
        let config = this.loadConfig();
        let u = new URL(url);
        let f = config.redirectHost[u.host] as string | undefined;
        if(f == undefined) return u;
        u.host = f;
        return u;
    }
    public static async getSteamPath(): Promise<string> {
        function invaildPath(path: string)
        {
            console.error("Invalid steam install location: " + path);
            throw "Invalid steam install location: " + path;
        }
        let config = this.loadConfig();
        let steamPath = config.steamLocation;
        if(steamPath && existsSync(steamPath)) return steamPath;
        console.log("Please enter the steam installation location");
        steamPath = (await readlineSync()).trim();
        console.log(steamPath);
        if(steamPath == "") invaildPath(steamPath);
        let p = parse(steamPath);
        if(p.ext == ".exe") {
            if(!existsSync(steamPath)) invaildPath(steamPath);
            config.steamLocation = steamPath;
        }
        if(p.name == "Steam")
        {
            steamPath = join(steamPath, "steam.exe");
            if(!existsSync(steamPath)) invaildPath(steamPath);
            config.steamLocation = steamPath;
        }
        this.saveConfig(config);
        return steamPath;
    }
}
