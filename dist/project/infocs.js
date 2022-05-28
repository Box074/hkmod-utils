export function generateCSInfo(project) {
    function mkclass(name, obj, space = "", first = false, skip = []) {
        let s = space + "[System.Runtime.CompilerServices.CompilerGeneratedAttribute]\n\n";
        s += space + "internal static class " + name + "\n" + space + "{\n";
        let memberSpace = space + "    ";
        let hasElement = false;
        if (first) {
            let time = new Date();
            s += memberSpace + "internal const long COMPILE_TIME = " + time.getTime() + ";\n";
            s += memberSpace + "internal const string COMPILE_UTC_TIME = \"" + time.toUTCString() + "\";\n";
        }
        for (let key in obj) {
            let v = obj[key];
            if (skip.includes(key))
                continue;
            let n = key.replaceAll(/[A-Z]/g, (match) => "_" + match)
                .replaceAll(" ", "")
                .replaceAll(".", "_")
                .toUpperCase();
            if (!isNaN(parseInt(n))) {
                n = "Item" + n;
            }
            if (typeof (v) == "string") {
                hasElement = true;
                s += memberSpace + "internal const string " + n + " = @\"" + v + "\";\n";
            }
            else if (typeof (v) == "number") {
                hasElement = true;
                s += memberSpace + "internal const int " + n + " = " + v + ";\n";
            }
            else if (typeof (v) == "boolean") {
                hasElement = true;
                s += memberSpace + "internal const bool " + n + " = " + v + ";\n";
            }
            else if (typeof (v) == "object") {
                hasElement = true;
                s += mkclass(n, v, memberSpace);
            }
        }
        s += "\n" + space + "}\n";
        return hasElement ? s : "";
    }
    return mkclass("CompileInfo", project, "", true, [
        "dependencies", "csproj", "csCompileInfo", "resources"
    ]);
}
