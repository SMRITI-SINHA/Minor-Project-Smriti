# AI VLSI PPA Optimizer

An interactive RTL design-space exploration dashboard for predicting and optimizing power, energy, area and timing across parameterized digital VLSI circuits.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/vlsi-optimizer/src/App.tsx` — first-build dashboard and local deterministic PPA surrogate behavior.
- `artifacts/vlsi-optimizer/src/index.css` — instrument-console visual system.
- `attached_assets/Synopsis_AI_Based_Optimization_of_VLSI_Circuits-smriti1_1790698226991.pdf` — approved project scope and methodology.

## Architecture decisions

- The first build is a frontend-only local demo so the team can validate the research workflow before wiring real Yosys/OpenSTA/OpenROAD runs.
- The app follows the synopsis: parameterized arithmetic circuits first, then ALU/MAC, with comparator/FIR reserved for generalization testing.
- The model bench uses the synopsis model set: Linear Regression, Random Forest, XGBoost, LightGBM, CatBoost and a compact ANN/MLP.
- Predictions are directional until verified by synthesis; the UI exposes budget flags and a Pareto candidate frontier rather than presenting surrogate output as sign-off data.

## Product

The dashboard lets users tune circuit family, architecture, bit width, pipeline depth, clock period and toggle activity; compare model scores; inspect predicted PPA; adjust design budgets; flag violations; and load Pareto-ranked candidate configurations.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The current sample data and inference are deterministic local demo values, not connected to an EDA tool yet.
- Real power and energy labels will require the scripted RTL/EDA data-generation pipeline described in the synopsis.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
