import { Router, type IRouter } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);
const root = process.cwd();
const historyPath = path.join(root, ".cache/eda/runs.json");
let runInProgress = false;

async function getRunHistory() {
  try {
    return JSON.parse(await readFile(historyPath, "utf8")) as Array<Record<string, unknown>>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

router.get("/benchmark/runs", async (_req, res) => {
  try {
    res.json({ runs: await getRunHistory() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/benchmark/status", (_req, res) => {
  res.json({
    available: ["yosys", "iverilog", "sta"].every((tool) => spawnSync("which", [tool]).status === 0),
    library: path.join(root, ".cache/eda/NangateOpenCellLibrary_typical.lib"),
    scope: "Adder RTL, 8/16/24/32-bit, three architectures",
  });
});

router.post("/benchmark/run", async (_req, res) => {
  if (runInProgress) {
    res.status(409).json({ status: "running", error: "An EDA sweep is already in progress." });
    return;
  }
  runInProgress = true;
  try {
    const { stdout } = await execFileAsync("python3", [
      path.join(root, "src/eda/benchmark.py"),
    ], { cwd: root, timeout: 600_000, maxBuffer: 5_000_000 });
    const result = JSON.parse(stdout) as Record<string, unknown>;
    result.id = randomUUID();
    result.createdAt = new Date().toISOString();
    const prior = await getRunHistory();
    const history = [result, ...prior].slice(0, 50);
    await mkdir(path.dirname(historyPath), { recursive: true });
    const temporaryPath = `${historyPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(history, null, 2), "utf8");
    await rename(temporaryPath, historyPath);
    result.history = history.map((run) => ({ ...run, history: undefined }));
    res.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({ status: "error", error: detail.slice(-4000) });
  } finally {
    runInProgress = false;
  }
});

export default router;
