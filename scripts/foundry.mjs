// Resolves Foundry binaries from PATH or the default ~/.foundry/bin install folder.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function foundryBin(name) {
  const dir = process.env.FOUNDRY_BIN ?? join(homedir(), ".foundry", "bin");
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const local = join(dir, exe);
  return existsSync(local) ? local : name;
}
