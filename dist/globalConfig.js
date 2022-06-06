import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
export class GlobalConfig {
    redirectDependency = {};
    redirectHost = {};
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
}
//# sourceMappingURL=globalConfig.js.map