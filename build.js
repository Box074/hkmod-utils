#!/usr/bin/env node
import { execSync } from "child_process";

let root = join(dirname(new URL(import.meta.url).pathname.substring(1)), "..");
execSync("dotnet build HKModUtils.sln", {
    cwd: root
});
