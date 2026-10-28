# AI VLSI PPA Optimizer

An interactive research prototype for exploring how digital-circuit choices can affect power, energy, area, and timing. The long-term goal is to use fast machine-learning estimates to shortlist promising RTL configurations before spending time on full synthesis and physical-design runs.

## Important status

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
Each RTL architecture and parameter choice can require a separate synthesis and timing run. The proposed system uses measurements from a limited set of real EDA runs to estimate likely results for other configurations, then sends a smaller set of promising choices to EDA for verification.

**Does the current application use AI or trained ML models?**  
Not yet. The current UI labels six model families, but the prediction comes from one deterministic equation. There are no trained weights, training code, feature extraction, or model-serving calls in this repository. Real EDA data and reproducible validation are prerequisites.

**Why not let a prediction replace synthesis?**  
A learned estimate is approximate and may be unreliable for a design family or technology it has not seen. Synthesis, timing analysis, and physical-design runs remain the source of verified measurements; a surrogate is intended to reduce how many configurations need those expensive runs.

**What is PPA, and how is performance represented here?**  
PPA means power, performance, and area. This UI displays power, energy per operation, area, delay, and WNS; delay and WNS are its timing indicators. All values are currently illustrative.

**What does WNS mean?**  
Worst Negative Slack is the most timing-critical slack reported across timing paths in static timing analysis. Negative slack indicates a timing constraint is missed. The demo simplifies it to `clockPeriod - estimatedDelay`; that is not an OpenSTA calculation.

**What does Pareto-optimal mean?**  
For objectives such as minimizing power, area, and delay while meeting a WNS target, a point is Pareto-optimal if no other feasible point is at least as good in every objective and strictly better in one. The current UI does not compute this relation; it marks three candidate rows by fixed index.

**Why evaluate by holding out whole design families?**  
Rows from one circuit family can be very similar. A random row split may put near-duplicates in training and testing, making generalization look better than it is. Holding out a family tests whether the model transfers to a genuinely different design structure.

**How should activity relate to power?**  
Dynamic power is often approximated as proportional to switching activity, capacitance, voltage squared, and frequency (`P ≈ α C V² f`). The dashboard uses a simple activity multiplier but has no real cell capacitance, voltage, netlist, or activity trace, so it is not a physical power estimate.

**What is the current project deliverable?**  
A polished interactive frontend prototype, plus an API health endpoint and monorepo scaffolding. It demonstrates the intended interaction flow and communicates which configurations might be worth investigating; it does not yet demonstrate measured optimization results.

**What is required before claiming that the optimizer works?**  
Generate functionally checked RTL variants, run EDA, preserve the measured outputs and provenance, train models on those records, evaluate on held-out circuit families, compute real feasible Pareto candidates, and verify selected candidates with EDA again.

## Feasibility assumptions from the synopsis

The synopsis suggests at least a 4-core CPU, 8 cores preferred for parallel runs, 16 GB RAM for larger physical-design experiments, and about 50 GB storage for tools and reports. A CUDA GPU is optional because the proposed models are small and use tabular features. These are planning estimates, not benchmarked requirements from the current application.

## Recommended next work

1. **Build a small reproducible RTL benchmark first.** Start with the synopsis's 8-bit and 16-bit ripple-carry, carry-lookahead, and carry-select adders. Add simulation tests so generated variants are functionally equivalent.
2. **Produce measured training data.** Implement RTL generation, Yosys synthesis, timing constraints and OpenSTA report parsing; record units, tool versions, technology library, and failures. Restrict the first milestone to synthesis-level metrics if full physical design is too slow.
3. **Add data and run persistence.** Define database tables for configuration, tool run, measurements, model version, and raw-report location. Add API endpoints for starting, checking, listing, and retrieving runs.
4. **Train and validate models against measurements.** Use a family-wise holdout split, report MAE/RMSE/R² per metric with units, compare inference time, and include error calibration before showing confidence.
5. **Implement real constrained search.** Define metric directions and budget behavior; calculate Pareto dominance instead of setting frontier flags by row index; verify selected candidates through EDA.
6. **Close the evidence loop in the UI.** Clearly distinguish predicted versus measured results, add prediction provenance and failure states, and plot real trade-offs and model errors.
7. **Add automated tests.** Cover feature extraction, unit conversions, report parsing, budget boundaries, candidate search, and prediction-vs-measurement evaluation.

## Presentation accuracy check

The attached progress presentation describes several backend, PostgreSQL, RTL-generation, and synthesis-adapter pieces as established. Those pieces are **not present in the current source tree**: the API has only a health route, the database schema has no tables, and no RTL/EDA integration is connected. Update those slides or clearly label them as planned before presenting the current repository as evidence of completed work.

## Running locally

Requirements: Node.js 20 or newer and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/vlsi-optimizer run dev
```

Vite defaults to port 5173 and the root URL when `PORT` and `BASE_PATH` are not supplied. To run the separate health API, set `PORT` and start `@workspace/api-server`; no database is needed for the current health endpoint.

Useful checks:

```bash
pnpm run typecheck
pnpm --filter @workspace/vlsi-optimizer run build
```