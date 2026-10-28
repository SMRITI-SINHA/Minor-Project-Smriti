import { Router, type IRouter } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { spawnSync } from "node:child_process";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);
const root = process.cwd();

router.get("/benchmark/status", (_req, res) => {
  res.json({
    available: ["yosys", "iverilog", "sta"].every((tool) => spawnSync("which", [tool]).status === 0),
    library: path.join(root, ".cache/eda/NangateOpenCellLibrary_typical.lib"),
    scope: "Adder RTL, 8/16/24/32-bit, three architectures",
  });
});

router.post("/benchmark/run", async (_req, res) => {
  try {
    const { stdout } = await execFileAsync("python3", [
      path.join(root, "src/eda/benchmark.py"),
    ], { cwd: root, timeout: 600_000, maxBuffer: 5_000_000 });
    res.json(JSON.parse(stdout));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ status: "error", error: detail.slice(-4000) });
  }
});

export default router;
