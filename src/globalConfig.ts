import { existsSync, readFileSync, writeFileSync } from "fs";
import { platform } from "os";
import { dirname, join } from "path";

export class GlobalConfig {
    public redirectDependency: {} = {};
    public redirectHost: {} = {};
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
}
