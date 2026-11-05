// Deploys the contracts with Foundry, then regenerates the ABI/address package.
//   node scripts/deploy.mjs --network anvil              (uses the public Anvil dev keys)
//   node scripts/deploy.mjs --network arbitrum_sepolia   (needs DEPLOYER_PRIVATE_KEY etc. in .env)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mnemonicToAccount } from "viem/accounts";
import { foundryBin } from "./foundry.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const network = process.argv[process.argv.indexOf("--network") + 1] ?? "anvil";

// Load the root .env without extra dependencies.
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const env = { ...process.env };
if (network === "anvil") {
  // Anvil's well-known development mnemonic. Never use these keys on a public network.
  const mnemonic = "test test test test test test test test test test test junk";
  const account = (i) => mnemonicToAccount(mnemonic, { addressIndex: i });
  const deployer = account(0);
  env.DEPLOYER_PRIVATE_KEY = `0x${Buffer.from(deployer.getHdKey().privateKey).toString("hex")}`;
  env.ADMIN_ADDRESS = account(0).address;
  env.OFFICER_ADDRESS = account(1).address;
  env.OPERATOR_ADDRESS = account(2).address;
  env.VALUATOR_ADDRESS = account(3).address;
  env.TREASURY_ADDRESS = account(4).address;
  env.REGISTRAR_ADDRESS = account(5).address;
} else if (!env.DEPLOYER_PRIVATE_KEY) {
  console.error("Set DEPLOYER_PRIVATE_KEY (and the role addresses) in .env first. See .env.example.");
  process.exit(1);
}

const args = ["script", "script/Deploy.s.sol:Deploy", "--rpc-url", network, "--broadcast", "-vv"];
if (network !== "anvil" && env.ETHERSCAN_API_KEY) args.push("--verify");

const run = (cmd, cmdArgs, cwd) => {
  const result = spawnSync(cmd, cmdArgs, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(foundryBin("forge"), args, join(root, "contracts"));
run(process.execPath, [join(root, "scripts", "export-abi.mjs")], root);
