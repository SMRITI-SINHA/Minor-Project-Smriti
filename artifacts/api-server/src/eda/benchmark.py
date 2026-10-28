#!/usr/bin/env python3
"""Small reproducible, open-source EDA benchmark for parameterized adders."""
import json
import os
import random
import re
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

LIBERTY = Path(os.environ.get("NANGATE_LIBERTY", Path.cwd() / ".cache/eda/NangateOpenCellLibrary_typical.lib"))
LIBERTY_URL = "https://raw.githubusercontent.com/The-OpenROAD-Project/OpenROAD-flow-scripts/master/flow/platforms/nangate45/lib/NangateOpenCellLibrary_typical.lib"
ARCHES = ("Ripple-carry", "Carry-lookahead", "Carry-select")
WIDTHS = (8, 16, 24, 32)


def run(command, cwd, timeout=90):
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout)[-4000:])
    return result.stdout + result.stderr


def rtl(architecture, width):
    if architecture == "Ripple-carry":
        return f"""module top(input [{width-1}:0] a,b, input cin, output [{width-1}:0] sum, output cout);
wire [{width}:0] c; assign c[0]=cin; assign cout=c[{width}];
genvar i; generate for(i=0;i<{width};i=i+1) begin: stage
assign sum[i]=a[i]^b[i]^c[i]; assign c[i+1]=(a[i]&b[i])|(a[i]&c[i])|(b[i]&c[i]);
end endgenerate endmodule"""
    if architecture == "Carry-lookahead":
        lines = [f"module top(input [{width-1}:0] a,b, input cin, output [{width-1}:0] sum, output cout);",
                 f"wire [{width-1}:0] p=a^b, g=a&b; wire [{width}:0] c; assign c[0]=cin;"]
        for bit in range(width):
            terms = [f"g[{bit}]"]
            for start in range(bit - 1, -1, -1):
                terms.append("(" + " & ".join([f"p[{n}]" for n in range(bit, start, -1)] + [f"g[{start}]"]) + ")")
            terms.append("(" + " & ".join([f"p[{n}]" for n in range(bit, -1, -1)] + ["cin"]) + ")")
            lines.append(f"assign c[{bit+1}] = " + " | ".join(terms) + "; assign sum[{0}] = p[{0}] ^ c[{0}];".format(bit, bit+1))
        lines.append(f"assign cout=c[{width}]; endmodule")
        return "\n".join(lines)
    block = 4
    lines = [f"module top(input [{width-1}:0] a,b, input cin, output [{width-1}:0] sum, output cout);",
             f"wire [{width}:0] carry; assign carry[0]=cin;"]
    for low in range(0, width, block):
        high = min(width, low + block) - 1
        size = high - low + 1
        lines.extend([
            f"wire [{size}:0] sum0_{low}, sum1_{low};",
            f"assign sum0_{low} = {{1'b0,a[{high}:{low}]}} + {{1'b0,b[{high}:{low}]}};",
            f"assign sum1_{low} = {{1'b0,a[{high}:{low}]}} + {{1'b0,b[{high}:{low}]}} + 1'b1;",
            f"assign sum[{high}:{low}] = carry[{low}] ? sum1_{low}[{size-1}:0] : sum0_{low}[{size-1}:0];",
            f"assign carry[{high+1}] = carry[{low}] ? sum1_{low}[{size}] : sum0_{low}[{size}];",
        ])
    lines.append(f"assign cout=carry[{width}]; endmodule")
    return "\n".join(lines)


def benchmark(architecture, width):
    run_started = time.time()
    with tempfile.TemporaryDirectory(prefix="ppa-") as temp:
        work = Path(temp)
        (work / "top.v").write_text(rtl(architecture, width))
        random.seed(947 + width)
        vectors = [(random.getrandbits(width), random.getrandbits(width), random.randrange(2)) for _ in range(128)]
        bench = [f"module tb; reg [{width-1}:0] a,b; reg cin; wire [{width-1}:0] sum; wire cout; top dut(a,b,cin,sum,cout); initial begin"]
        for a, b, cin in vectors:
            bench.append(f"a={width}'d{a}; b={width}'d{b}; cin=1'd{cin}; #1; if ({{cout,sum}} != {width+1}'d{a+b+cin}) $fatal(1, \"mismatch\");")
        bench.append('$display("PASS"); $finish; end endmodule')
        (work / "tb.v").write_text("\n".join(bench))
        run(["iverilog", "-g2012", "-o", "sim", "top.v", "tb.v"], work)
        sim = run(["vvp", "sim"], work)
        yosys_script = f"read_verilog top.v; hierarchy -top top; synth -top top; abc -liberty {LIBERTY}; clean; stat -liberty {LIBERTY}; write_verilog -noattr mapped.v"
        report = run(["yosys", "-p", yosys_script], work, timeout=120)
        area_match = re.findall(r"Chip area for module .*?:\s*([0-9.]+)", report)
        cell_match = re.findall(r"^\s*(\d+)\s+\w+", report, re.M)
        if not area_match:
            raise RuntimeError("Yosys completed but did not report mapped cell area.")
        (work / "timing.sdc").write_text(
            "create_clock -name virtual_clk -period 10\n"
            "set_input_delay 0 -clock virtual_clk [all_inputs]\n"
            "set_output_delay 0 -clock virtual_clk [all_outputs]\n"
        )
        (work / "sta.tcl").write_text(
            f"read_liberty {LIBERTY}\nread_verilog mapped.v\nlink_design top\n"
            "source timing.sdc\nreport_checks -path_delay max\nexit\n"
        )
        sta_report = run(["sta", "-no_init", "-no_splash", "-exit", "sta.tcl"], work, timeout=90)
        arrival = re.search(r"^\s*([0-9]+(?:\.[0-9]+)?)\s+data arrival time\s*$", sta_report, re.M)
        delay_ns = float(arrival.group(1)) if arrival else None
        return {
            "architecture": architecture, "bitWidth": width,
            "areaUm2": float(area_match[-1]),
            "delayNs": delay_ns,
            "mappedCellCount": int(cell_match[-1]) if cell_match else None,
            "simulation": "passed (128 randomized vectors)",
            "synthesis": "Yosys + ABC, Nangate45 typical liberty",
            "elapsedSeconds": round(time.time() - run_started, 2),
            "areaSource": "mapped Liberty cell area",
            "timingSource": "OpenSTA max combinational path, ideal interconnect, zero external I/O delay",
        }


def main():
    if not LIBERTY.is_file():
        LIBERTY.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(LIBERTY_URL, LIBERTY)
    if not LIBERTY.is_file():
        raise RuntimeError(f"Liberty file missing: {LIBERTY}")
    rows = [benchmark(arch, width) for width in WIDTHS for arch in ARCHES]
    for width in WIDTHS:
        width_rows = [row for row in rows if row["bitWidth"] == width]
        winner = min(width_rows, key=lambda row: row["areaUm2"])
        winner["bestAreaAtWidth"] = True
        for candidate in width_rows:
            candidate["pareto"] = not any(
                other is not candidate
                and other["areaUm2"] <= candidate["areaUm2"]
                and other["delayNs"] <= candidate["delayNs"]
                and (other["areaUm2"] < candidate["areaUm2"] or other["delayNs"] < candidate["delayNs"])
                for other in width_rows
            )
    print(json.dumps({"status": "complete", "platform": "Nangate45 typical", "toolVersions": {
        "yosys": run(["yosys", "-V"], Path.cwd()).strip(),
        "iverilog": run(["iverilog", "-V"], Path.cwd()).splitlines()[0],
    }, "results": rows}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}))
        raise
