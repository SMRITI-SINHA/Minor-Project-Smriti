import { Router, type IRouter } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { desc, inArray } from "drizzle-orm";
import { db, edaRunsTable } from "@workspace/db";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);
const root = process.cwd();
let runInProgress = false;

async function getRunHistory() {
  const rows = await db.select().from(edaRunsTable)
    .orderBy(desc(edaRunsTable.createdAt))
    .limit(50);
  return rows.map((row) => row.payload as Record<string, unknown>);
}

router.get("/benchmark/runs", async (_req, res) => {
  try {
    res.json({ runs: await getRunHistory() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/benchmark/model", async (_req, res) => {
  try {
    const runs = await getRunHistory();
    const rows = runs.flatMap((run) =>
      Array.isArray(run.results) ? run.results as Array<Record<string, unknown>> : [],
    );
    const { stdout } = await execFileAsync("python3", [
      path.join(root, "src/eda/surrogate.py"),
      JSON.stringify(rows),
    ], { cwd: root, timeout: 30_000, maxBuffer: 1_000_000 });
    res.json(JSON.parse(stdout));
  } catch (error) {
    res.status(500).json({ status: "error", error: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/benchmark/predict", async (req, res) => {
  try {
    const { architecture, bitWidth } = req.body ?? {};
    if (!["Ripple-carry", "Carry-lookahead", "Carry-select"].includes(architecture)
      || !Number.isInteger(Number(bitWidth))) {
      res.status(400).json({ status: "error", error: "Select a supported adder and integer bit width." });
      return;
    }
    const runs = await getRunHistory();
    const rows = runs.flatMap((run) =>
      Array.isArray(run.results) ? run.results as Array<Record<string, unknown>> : [],
    );
    const { stdout } = await execFileAsync("python3", [
      path.join(root, "src/eda/surrogate.py"),
      JSON.stringify(rows),
      JSON.stringify({ architecture, bitWidth: Number(bitWidth) }),
    ], { cwd: root, timeout: 30_000, maxBuffer: 1_000_000 });
    const result = JSON.parse(stdout) as Record<string, unknown>;
    if (result.status !== "trained") {
      res.status(422).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ status: "error", error: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/benchmark/status", (_req, res) => {
  const tools = ["yosys", "iverilog", "sta", "openroad"];
  res.json({
    available: tools.every((tool) => spawnSync("which", [tool]).status === 0),
    tools: Object.fromEntries(tools.map((tool) => [tool, spawnSync("which", [tool]).status === 0])),
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
    await db.insert(edaRunsTable).values({
      id: result.id as string,
      createdAt: new Date(result.createdAt as string),
      platform: result.platform as string,
      payload: result,
    });
    const expired = await db.select({ id: edaRunsTable.id })
      .from(edaRunsTable)
      .orderBy(desc(edaRunsTable.createdAt))
      .offset(50);
    if (expired.length) {
      await db.delete(edaRunsTable).where(inArray(edaRunsTable.id, expired.map((row) => row.id)));
    }
    const history = await getRunHistory();
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
