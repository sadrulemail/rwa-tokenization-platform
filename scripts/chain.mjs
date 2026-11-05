// Starts a local Anvil node whose clock begins in the past, so `pnpm seed` can replay
// about a year of valuations, distributions and redemptions with realistic dates.
import { spawn } from "node:child_process";
import { foundryBin } from "./foundry.mjs";

const backdateDays = Number(process.env.CHAIN_BACKDATE_DAYS ?? 400);
const genesis = Math.floor(Date.now() / 1000) - backdateDays * 86_400;

const args = [
  "--chain-id", "31337",
  "--accounts", "12",
  "--balance", "100000",
  "--timestamp", String(genesis),
  "--port", process.env.ANVIL_PORT ?? "8545",
];
if (process.env.ANVIL_STATE) args.push("--state", process.env.ANVIL_STATE);

console.log(`anvil ${args.join(" ")}`);
const child = spawn(foundryBin("anvil"), args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
