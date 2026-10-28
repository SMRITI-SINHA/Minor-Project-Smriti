#!/usr/bin/env python3
"""Small ridge-regression surrogate trained and validated on measured EDA rows."""
import json
import math
import sys

ARCHES = ("Ripple-carry", "Carry-lookahead", "Carry-select")
TARGETS = ("areaUm2", "routedDelayNs", "totalPowerW")


def features(row):
    width = (float(row["bitWidth"]) - 20.0) / 12.0
    return [1.0, width, width * width] + [
        1.0 if row["architecture"] == arch else 0.0
        for arch in ARCHES[1:]
    ]


def solve(matrix, vector):
    n = len(vector)
    rows = [matrix[i][:] + [vector[i]] for i in range(n)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda row: abs(rows[row][col]))
        rows[col], rows[pivot] = rows[pivot], rows[col]
        if abs(rows[col][col]) < 1e-12:
            raise ValueError("Training matrix is singular.")
        scale = rows[col][col]
        rows[col] = [v / scale for v in rows[col]]
        for row in range(n):
            if row == col:
                continue
            scale = rows[row][col]
            rows[row] = [a - scale * b for a, b in zip(rows[row], rows[col])]
    return [row[-1] for row in rows]


def fit(rows, target):
    xs = [features(row) for row in rows]
    size = len(xs[0])
    matrix = [[sum(x[i] * x[j] for x in xs) for j in range(size)] for i in range(size)]
    values = [float(row[target]) for row in rows]
    vector = [sum(x[i] * y for x, y in zip(xs, values)) for i in range(size)]
    for i in range(1, size):
        matrix[i][i] += 1e-8
    return solve(matrix, vector)


def predict(coefficients, row):
    return sum(a * b for a, b in zip(coefficients, features(row)))


def score(rows, target):
    errors = []
    for width in sorted({row["bitWidth"] for row in rows}):
        train = [row for row in rows if row["bitWidth"] != width]
        test = [row for row in rows if row["bitWidth"] == width]
        if len(train) < 5:
            continue
        coefficients = fit(train, target)
        errors.extend(float(row[target]) - predict(coefficients, row) for row in test)
    if not errors:
        return {"mae": None, "rmse": None, "r2": None, "validation": "insufficient"}
    actual = [float(row[target]) for row in rows]
    mean = sum(actual) / len(actual)
    total = sum((value - mean) ** 2 for value in actual)
    residual = sum(error * error for error in errors)
    return {
        "mae": sum(abs(error) for error in errors) / len(errors),
        "rmse": math.sqrt(residual / len(errors)),
        "r2": 1 - residual / total if total else None,
        "validation": "leave-one-bit-width-out",
    }


def train(rows, design=None):
    rows = [
        row for row in rows
        if row.get("architecture") in ARCHES
        and all(isinstance(row.get(target), (int, float)) for target in TARGETS)
    ]
    if len(rows) < 10 or len({row["bitWidth"] for row in rows}) < 3:
        return {"status": "insufficient-data", "samples": len(rows), "minimumSamples": 10}
    result = {
        "status": "trained",
        "model": "ridge regression (width polynomial + architecture indicators)",
        "samples": len(rows),
        "architectures": sorted({row["architecture"] for row in rows}),
        "widthRange": [min(row["bitWidth"] for row in rows), max(row["bitWidth"] for row in rows)],
        "validation": "Grouped holdout by bit width; interpolation within measured adder architectures only.",
        "metrics": {target: score(rows, target) for target in TARGETS},
        "coefficients": {target: fit(rows, target) for target in TARGETS},
        "featureOrder": ["intercept", "normalizedWidth", "normalizedWidthSquared", "carryLookahead", "carrySelect"],
    }
    if design:
        if design.get("architecture") not in ARCHES:
            raise ValueError("Unsupported architecture.")
        width = int(design.get("bitWidth", 0))
        if width < result["widthRange"][0] or width > result["widthRange"][1]:
            raise ValueError("Prediction width is outside the measured training range.")
        point = {"architecture": design["architecture"], "bitWidth": width}
        result["prediction"] = {
            target: predict(result["coefficients"][target], point)
            for target in TARGETS
        }
        result["predictionLabel"] = "Surrogate estimate only; not an EDA measurement."
    return result


if __name__ == "__main__":
    try:
        design = json.loads(sys.argv[2]) if len(sys.argv) > 2 else None
        print(json.dumps(train(json.loads(sys.argv[1]), design)))
    except Exception as error:
        print(json.dumps({"status": "error", "error": str(error)}))
        raise
