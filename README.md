# AI VLSI PPA Optimizer

## Current implementation

The app runs a reproducible adder EDA flow. Select **Run full EDA sweep** to generate and simulate 12 RTL designs: ripple-carry, carry-lookahead, and carry-select adders at 8, 16, 24, and 32 bits. Icarus Verilog checks 128 randomized vectors per design. Yosys/ABC maps each design against Nangate45; OpenROAD performs floorplanning, placement, and global routing; OpenSTA reports timing using global-route estimated parasitics. OpenROAD reports cell internal, switching, and leakage power using a vectorless uniform 10% activity / 50% duty-cycle assumption.

- API: `GET /api/healthz`, `GET /api/benchmark/status`, `POST /api/benchmark/run`, `GET /api/benchmark/runs`, `GET /api/benchmark/model`, and `POST /api/benchmark/predict`.
- Start the combined frontend/API workflow with `bash scripts/dev-stack.sh`.
- The Nangate45 Liberty file is downloaded into the ignored `.cache/` directory on first run if it is not already present.
- Benchmarks cover adder architectures only. The API saves up to 50 runs in the workspace PostgreSQL database, shared across app sessions. Replit's Publish flow applies schema changes to production after merge.
- The surrogate is ridge regression trained on measured rows, with leave-one-width-out MAE/RMSE/R² and an inference endpoint limited to the measured width range. This small dataset does not establish transfer to other circuit families.
- The UI computes a three-objective area/routed-delay/power Pareto set within each width. Power is vectorless and routing is global-route only; neither is signoff or foundry-qualified.
- The flow does not run detailed routing, RC extraction with foundry-qualified process corners, clock-tree synthesis, IR-drop, or signoff timing/power analysis.

The rest of this README describes the original prototype and research goals, not additional implemented capabilities.

An interactive research prototype for exploring how digital-circuit choices can affect power, energy, area, and timing. The long-term goal is to use fast machine-learning estimates to shortlist promising RTL configurations before spending time on full synthesis and physical-design runs.

## Earlier prototype notes (historical)

The current application is a **front-end demonstrator**, not a working ML-to-EDA optimization pipeline. Its live PPA values come from a deterministic hand-written surrogate formula in the browser. There is no generated RTL, synthesis result, trained model, physical-design report, or measured dataset connected to the dashboard. Treat all displayed predictions, confidence values, model metrics, sample counts, and Pareto labels as illustrative demo content only.

The footer in the application states: “Predictions are directional until confirmed by synthesis.” In the current build, none of the predictions have been confirmed by synthesis.

## What currently works

- A single-page React dashboard at `/`.
- Local controls for circuit family, architecture, bit width, pipeline depth, clock period, toggle activity, and power/area/timing budgets.
- Recalculation of illustrative PPA values when configuration or selected model changes.
- Local violation flags for power, area, and worst negative slack (WNS).
- Five generated candidate rows and a “Load point” action that copies a candidate's settings into the controls.
- Demo model-comparison scores and a demo dataset-health panel.
- Responsive layout, reset controls, toasts, and a short simulated “Optimize frontier” interaction.
- A small Express API that responds to `GET /api/healthz`; the dashboard does not call it.

The UI exposes these circuit families and architecture labels:

| Family | Architecture choices |
| --- | --- |
| Adder | Ripple-carry, Carry-lookahead, Carry-select |
| ALU | Carry-lookahead, Ripple carry, Kogge-Stone |
| MAC | Wallace tree, Array multiplier, Booth radix-4 |
| FIR filter | Systolic, Transposed, Distributed arithmetic |
| Comparator | Magnitude, Equality, Priority |

The controls currently offer widths of 8, 16, 24, and 32 bits; pipeline depths of 0–4 stages; clock periods of 1–5 ns; and toggle activity of 5–90%. The default point is a 16-bit, one-stage ripple-carry adder with a 2.5 ns clock period and 38% toggle activity.

## How the demo estimate is calculated

The `predict()` function in `artifacts/vlsi-optimizer/src/App.tsx` uses fixed family and architecture multipliers:

- Family factors: Adder 0.68, ALU 0.82, MAC 1.00, FIR filter 1.20, Comparator 0.54.
- Architecture factor: 1.12 for Wallace, Kogge-Stone, or Carry-lookahead; 0.86 for Ripple; otherwise 1.00.
- Width factor: `bitWidth / 16`.

For a configuration, the current equations are:

```text
power = 1.17 × familyFactor × widthFactor × architectureFactor
        × (1 + toggleActivity / 170) × (1 + pipelineDepth × 0.045) + offset

delay = 1.38 × familyFactor × architectureFactor × (bitWidth / 24)
        / (1 + pipelineDepth × 0.13)

area = 26.4 × familyFactor × widthFactor × architectureFactor
       × (1 + pipelineDepth × 0.035) + offset × 7

energy = power × clockPeriod × 0.78
WNS = clockPeriod - delay
```

These are UI demo equations, not physical power models or static-timing calculations. The `0.78` energy multiplier is a heuristic. The model selector changes the displayed confidence heuristic, but does not choose or run a trained model. Confidence is derived from fixed deductions based on bit width, pipeline depth, and model name, with a floor of 0.82.

The displayed default units are mW for power, pJ per operation for energy, µm² for area, and ns for delay and WNS. The estimates do not account for a technology library, voltage, capacitance, cell-level activity, leakage, clock-tree effects, routed parasitics, or a real timing constraint file.

Confidence is currently:

```text
max(0.82, 0.974
    - abs(bitWidth - 16) × 0.006
    - pipelineDepth × 0.006
    - model deduction)
```

The model deduction is 0.055 for ANN/MLP, 0.070 for Linear Regression, 0.022 for XGBoost or LightGBM, and zero for CatBoost or Random Forest. These constants are not calibrated probabilities.

The initial editable budgets are 1.6 mW power, 34 µm² area, and 0 ns WNS. A power overrun is critical above 118% of its budget; an area overrun is critical above 120%; a timing overrun is critical when WNS is more than 0.25 ns below its budget. Otherwise the same overrun is marked as a warning. Energy has no budget flag.

## What the candidate and “Pareto” actions do

The app constructs exactly five nearby candidates by changing width, pipeline depth, period, activity, and a small numeric offset. “Optimize frontier” waits 650 ms, increments a local run counter, and recalculates those same five rows.

This is not an optimization algorithm: it does not enumerate the design space, run EDA, apply a search strategy, or compare candidates using Pareto dominance. Three of the five rows are marked as “Pareto” by their fixed row positions. The labels “Optimize frontier” and “Pareto-ranked” describe the intended future feature, not a verified result.

## Model and dataset panels

The UI names Linear Regression, Random Forest, XGBoost, LightGBM, CatBoost, and ANN/MLP. The displayed MAE, RMSE, R², inference-time values and the dataset summary (2,480 samples, four families, and 20% validation) are constants in the frontend. No model files, training scripts, feature extractor, data files, measured labels, or validation results are present in this repository.

The literal model-panel values are:

| Display name | MAE | RMSE | R² | Inference |
| --- | ---: | ---: | ---: | ---: |
| CatBoost | 0.071 | 0.118 | 0.943 | 7 ms |
| XGBoost | 0.084 | 0.139 | 0.926 | 8 ms |
| LightGBM | 0.091 | 0.148 | 0.918 | 6 ms |
| Random Forest | 0.103 | 0.166 | 0.901 | 11 ms |
| Linear Regression | 0.177 | 0.249 | 0.782 | 2 ms |
| ANN / MLP | 0.126 | 0.204 | 0.871 | 3 ms |

The app does not state metric units for these scores, and no experiment can reproduce them from the current repository. They must not be presented as measured model performance.

## Current software architecture

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Wouter, TanStack Query, Lucide icons, and reusable UI components under `artifacts/vlsi-optimizer`.
- **API:** Express server under `artifacts/api-server`; currently exposes only a health endpoint.
- **API contract:** `lib/api-spec/openapi.yaml` describes only the health endpoint; generated client and Zod packages mirror that small contract.
- **Database:** Drizzle package scaffolding exists under `lib/db`, but the schema exports no tables and the frontend/API do not persist experiment data.
- **Workspace:** pnpm monorepo with shared TypeScript settings, libraries, application packages, and scripts.

The frontend stores its state in React component state, so edits and candidate selections are not saved across page reloads. The “Sweep queue,” “Model bench,” and “Dataset” sidebar entries are not separate data-backed pages.

The candidate results are presented in a table; the current app does not draw a measured Pareto chart or training-validation plots.

## Suggested end-to-end design

The project synopsis proposes this pipeline:

1. Generate parameterized Verilog variants and record configuration metadata.
2. Simulate designs for functional correctness and switching-activity information.
3. Run Yosys synthesis and collect cell/netlist features.
4. Run OpenSTA for timing; add OpenROAD physical runs where resources permit.
5. Parse real PPA reports and save results with tool, library, constraints, and version provenance.
6. Train and evaluate the six proposed model families on the measured dataset.
7. Split evaluation by complete design family, not random rows, to test generalization.
8. Estimate power, energy, area, and timing; show confidence or out-of-domain warnings.
9. Search candidate configurations under user budgets, calculate the actual Pareto set, then send selected candidates through EDA for confirmation.

The synopsis names Yosys, OpenSTA, OpenROAD, SkyWater Sky130/ASAP7, Icarus Verilog or Verilator, scikit-learn, XGBoost, LightGBM, CatBoost, TensorFlow/PyTorch, and an optimizer such as Optuna or NSGA-II. These are proposed tools; they are not integrated in the current dashboard.

The synopsis estimates a dataset on the order of 500–2,000 configurations. That is a target, not a current count. The “2,480 samples” shown in the dashboard is only a fixed demonstration value.

## Short viva / presentation answers

**What problem does the project address?**  
Each RTL architecture and width can require separate EDA runs. PPA/LAB provides a reproducible adder design-space benchmark, then trains a small surrogate on its measured results to estimate configurations within the tested space.

**Does the current application use AI or trained ML models?**  
Yes. It fits ridge regression using saved EDA measurements for adder width and architecture, reports leave-one-width-out MAE/RMSE/R², and offers a prediction endpoint. This is a small experimental model, not evidence of generalization to other circuit families.

**Why not let a prediction replace synthesis?**  
A learned estimate is approximate and may be unreliable outside its training data. The EDA sweep remains the measurement source; the surrogate is for exploration, not signoff.

**What is PPA, and how is performance represented here?**  
PPA means power, performance, and area. The benchmark reports mapped standard-cell area, OpenROAD global-route estimated delay, and vectorless power in Nangate45.

**What does WNS mean?**  
Worst Negative Slack is the most timing-critical slack across constrained timing paths. This benchmark does not claim signoff WNS: it reports combinational path delay using a virtual clock and zero external I/O delays.

**What does Pareto-optimal mean?**  
Within each width, a point is marked Pareto-optimal when no other measured architecture is at least as good in area, estimated routed delay, and vectorless power, and strictly better in one.

**How is the model validated?**

The benchmark holds out each complete bit width in turn. That tests interpolation across tested adder widths, but not transfer to a new circuit family or technology.

**How should activity relate to power?**  
Dynamic power depends on activity, capacitance, voltage, and frequency (`P ≈ α C V² f`). The benchmark uses OpenROAD's vectorless estimate with uniform 10% activity and 50% duty cycle. It does not use a gate-level activity trace, so the number is not signoff power.

**What is the current project deliverable?**  
An interactive, adder-focused EDA workflow: randomized functional checks, Yosys/ABC mapping, OpenROAD placement and global routing, timing/power estimates, PostgreSQL-backed run history, three-objective Pareto comparison, and a measured-data ridge-regression surrogate.

**What is required before claiming that the optimizer works?**  
The current prototype demonstrates this loop only for three adder architectures at four widths. Broader circuit families, detailed routing, extracted process-corner parasitics, and signoff-quality timing/power remain necessary before claiming a general-purpose optimizer.

## Feasibility assumptions from the synopsis

The synopsis suggests at least a 4-core CPU, 8 cores preferred for parallel runs, 16 GB RAM for larger physical-design experiments, and about 50 GB storage for tools and reports. A CUDA GPU is optional because the proposed models are small and use tabular features. These are planning estimates, not benchmarked requirements from the current application.

## Remaining scope

1. Detailed routing currently fails on a ground-typed tie net in one generated architecture. Results therefore stop at global routing and estimated parasitics.
2. Expand RTL generation and functional tests beyond adders, then collect enough measured rows for meaningful family-held-out model validation.
3. Power uses vectorless activity assumptions; add trace-based activity and process-corner characterization before signoff claims.

## Presentation accuracy check

Present the current deliverable as an adder-focused EDA prototype, not a production signoff tool or general-purpose multi-family optimizer. Separate measured, model-estimated, and vectorless metrics when showing results.

## Running locally

Requirements: Node.js 20 or newer, pnpm, PostgreSQL, Yosys, Icarus Verilog, OpenSTA, and OpenROAD.

```bash
pnpm install --frozen-lockfile
bash scripts/dev-stack.sh
```

The combined workflow starts the Vite UI and API. The API reads `DATABASE_URL`; apply schema changes with `pnpm --filter @workspace/db run push` in development. Replit's Publish flow applies the development schema to production when publishing.

Useful checks:

```bash
pnpm run typecheck
pnpm --filter @workspace/vlsi-optimizer run build
```