#!/usr/bin/env python3
"""Small reproducible, open-source EDA benchmark for parameterized adders."""
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

LIBERTY = Path(os.environ.get("NANGATE_LIBERTY", Path.cwd() / ".cache/eda/NangateOpenCellLibrary_typical.lib"))
LIBERTY_URL = "https://raw.githubusercontent.com/The-OpenROAD-Project/OpenROAD-flow-scripts/master/flow/platforms/nangate45/lib/NangateOpenCellLibrary_typical.lib"
PLATFORM_URL = "https://raw.githubusercontent.com/The-OpenROAD-Project/OpenROAD-flow-scripts/master/flow/platforms/nangate45/"
FAMILY_ARCHES = {
    "Adder": ("Ripple-carry", "Carry-lookahead", "Carry-select"),
    "Comparator": ("Behavioral", "Subtract"),
    "Multiplier": ("Behavioral", "Shift-add"),
    "ALU": ("Behavioral", "Parallel"),
}
WIDTHS = (8, 16, 24, 32)
WORKLOADS = ("random", "low-toggle", "arithmetic")


def run(command, cwd, timeout=90):
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout)[-4000:])
    return result.stdout + result.stderr


def rtl(family, architecture, width):
    if family not in FAMILY_ARCHES or architecture not in FAMILY_ARCHES[family]:
        raise ValueError(f"Unsupported design: {family} / {architecture}")
    if family == "Adder" and architecture == "Ripple-carry":
        return f"""module top(input [{width-1}:0] a,b, input [1:0] mode, output [{width-1}:0] sum, output cout);
wire cin=mode[0]; wire [{width}:0] c; assign c[0]=cin; assign cout=c[{width}];
genvar i; generate for(i=0;i<{width};i=i+1) begin: stage
assign sum[i]=a[i]^b[i]^c[i]; assign c[i+1]=(a[i]&b[i])|(a[i]&c[i])|(b[i]&c[i]);
end endgenerate endmodule"""
    if family == "Adder" and architecture == "Carry-lookahead":
        lines = [f"module top(input [{width-1}:0] a,b, input [1:0] mode, output [{width-1}:0] sum, output cout);",
                 f"wire cin=mode[0]; wire [{width-1}:0] p=a^b, g=a&b; wire [{width}:0] c; assign c[0]=cin;"]
        for bit in range(width):
            terms = [f"g[{bit}]"]
            for start in range(bit - 1, -1, -1):
                terms.append("(" + " & ".join([f"p[{n}]" for n in range(bit, start, -1)] + [f"g[{start}]"]) + ")")
            terms.append("(" + " & ".join([f"p[{n}]" for n in range(bit, -1, -1)] + ["cin"]) + ")")
            lines.append(f"assign c[{bit+1}] = " + " | ".join(terms) + "; assign sum[{0}] = p[{0}] ^ c[{0}];".format(bit, bit+1))
        lines.append(f"assign cout=c[{width}]; endmodule")
        return "\n".join(lines)
    if family == "Comparator":
        if architecture == "Behavioral":
            return f"""module top(input [{width-1}:0] a,b, input [1:0] mode, output [{width-1}:0] sum, output cout);
assign sum = {{{width}{{(a < b)}}}}; assign cout=(a==b); endmodule"""
        return f"""module top(input [{width-1}:0] a,b, input [1:0] mode, output [{width-1}:0] sum, output cout);
wire [{width}:0] diff={{1'b0,a}}-{{1'b0,b}};
assign sum={{{width}{{diff[{width}]}}}}; assign cout=(a==b); endmodule"""
    if family == "Multiplier":
        terms = [
            f"wire [{2*width-1}:0] term0 = b[0] ? ({{{{{width}{{1'b0}}}},a}}) : 0;",
            f"wire [{2*width-1}:0] acc0 = term0;",
        ]
        for bit in range(1, width):
            terms.extend([
                f"wire [{2*width-1}:0] term{bit} = b[{bit}] ? ({{{{{width}{{1'b0}}}},a}} << {bit}) : 0;",
                f"wire [{2*width-1}:0] acc{bit} = acc{bit-1} + term{bit};",
            ])
        expression = f"wide=a*b;" if architecture == "Behavioral" else f"wide=acc{width-1};"
        middle = "\n".join(terms) if architecture == "Shift-add" else ""
        return f"""module top(input [{width-1}:0] a,b, input [1:0] mode, output [{width-1}:0] sum, output cout);
reg [{2*width-1}:0] wide; {middle}
always @* begin {expression} end
assign sum=wide[{width-1}:0]; assign cout=|wide[{2*width-1}:{width}]; endmodule"""
    if family == "ALU":
        if architecture == "Behavioral":
            return f"""module top(input [{width-1}:0] a,b, input [1:0] mode, output reg [{width-1}:0] sum, output cout);
wire [{width}:0] add_full={{1'b0,a}}+{{1'b0,b}};
always @* case(mode) 0: sum=a+b; 1: sum=a-b; 2: sum=a&b; default: sum=a|b; endcase
assign cout=mode==0 ? add_full[{width}] : mode==1 ? (a<b) : (|sum); endmodule"""
        return f"""module top(input [{width-1}:0] a,b, input [1:0] mode, output [{width-1}:0] sum, output cout);
wire [{width-1}:0] add_result=a+b, sub_result=a-b, and_result=a&b, or_result=a|b;
wire [{width}:0] add_full={{1'b0,a}}+{{1'b0,b}};
assign sum=mode==0?add_result:mode==1?sub_result:mode==2?and_result:or_result;
assign cout=mode==0 ? add_full[{width}] : mode==1 ? (a<b) : (|sum); endmodule"""
    block = 4
    blocks = (width + block - 1) // block
    lines = [f"module top(input [{width-1}:0] a,b, input [1:0] mode, output [{width-1}:0] sum, output cout);",
             f"wire cin=mode[0]; wire [{blocks}:0] block_carry; assign block_carry[0]=cin;"]
    for block_index, low in enumerate(range(0, width, block)):
        high = min(width, low + block) - 1
        size = high - low + 1
        lines.extend([
            f"wire [{size}:0] sum0_{low}, sum1_{low};",
            f"assign sum0_{low} = {{1'b0,a[{high}:{low}]}} + {{1'b0,b[{high}:{low}]}};",
            f"assign sum1_{low} = {{1'b0,a[{high}:{low}]}} + {{1'b0,b[{high}:{low}]}} + 1'b1;",
            f"assign sum[{high}:{low}] = block_carry[{block_index}] ? sum1_{low}[{size-1}:0] : sum0_{low}[{size-1}:0];",
            f"assign block_carry[{block_index+1}] = block_carry[{block_index}] ? sum1_{low}[{size}] : sum0_{low}[{size}];",
        ])
    lines.append(f"assign cout=block_carry[{blocks}]; endmodule")
    return "\n".join(lines)


def prepare_physical_assets():
    files = {
        "NangateOpenCellLibrary.tech.lef": "lef/NangateOpenCellLibrary.tech.lef",
        "NangateOpenCellLibrary.macro.mod.lef": "lef/NangateOpenCellLibrary.macro.mod.lef",
        "rcx_patterns.rules": "rcx_patterns.rules",
    }
    for name, remote in files.items():
        path = LIBERTY.parent / name
        if not path.is_file():
            urllib.request.urlretrieve(PLATFORM_URL + remote, path)


def physical_analysis(work, width, clock_period_ns, input_delay_ns, output_delay_ns, workload_activity):
    core = max(100, width * 8)
    tcl = [
        f"read_lef {LIBERTY.parent / 'NangateOpenCellLibrary.tech.lef'}",
        f"read_lef {LIBERTY.parent / 'NangateOpenCellLibrary.macro.mod.lef'}",
        f"read_liberty {LIBERTY}",
        "read_verilog mapped.v", "link_design top", "read_sdc timing.sdc",
        f"initialize_floorplan -die_area {{0 0 {core + 20} {core + 20}}} -core_area {{10 10 {core + 10} {core + 10}}} -site FreePDK45_38x28_10R_NP_162NW_34O",
    ]
    for layer, x_pitch, y_pitch in (
        ("metal1", ".19", ".14"), ("metal2", ".19", ".14"),
        ("metal3", ".19", ".14"), ("metal4", ".28", ".28"),
        ("metal5", ".28", ".28"), ("metal6", ".28", ".28"),
        ("metal7", ".8", ".8"), ("metal8", ".8", ".8"),
        ("metal9", "1.6", "1.6"), ("metal10", "1.6", "1.6"),
    ):
        tcl.append(f"make_tracks {layer} -x_offset .095 -x_pitch {x_pitch} -y_offset .07 -y_pitch {y_pitch}")
    tcl.extend([
        "place_pins -random -hor_layers metal5 -ver_layers metal6",
        "set_wire_rc -signal -layer metal3", "set_wire_rc -clock -layer metal5",
        "global_placement -density .30", "detailed_placement",
        "repair_tie_fanout LOGIC0_X1/Z -separation 0",
        "repair_tie_fanout LOGIC1_X1/Z -separation 0",
        "set_routing_layers -signal metal2-metal6 -clock metal5-metal6",
        "global_route -guide_file route.guide",
        "detailed_route -output_drc detailed_route.drc -output_maze detailed_route.maze -output_guide_coverage detailed_route.coverage -verbose 1",
        f"extract_parasitics -ext_model_file {LIBERTY.parent / 'rcx_patterns.rules'}",
        f"set_power_activity -global -activity {workload_activity:.5f} -duty 0.50",
        "report_power", "report_checks -path_delay max", "exit",
    ])
    (work / "physical.tcl").write_text("\n".join(tcl))
    report = run(["openroad", "-exit", "physical.tcl"], work, timeout=240)
    arrival = re.search(r"^\s*([0-9]+(?:\.[0-9]+)?)\s+data arrival time\s*$", report, re.M)
    power = re.search(
        r"^Total\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)",
        report, re.M,
    )
    if not arrival or not power:
        raise RuntimeError("OpenROAD completed without routed timing and power reports.")
    drc_match = re.findall(r"Number of violations\s*=\s*(\d+)", report)
    wire_match = re.findall(r"Total wire length\s*=\s*([0-9.]+)\s+um", report)
    via_match = re.findall(r"Total number of vias\s*=\s*(\d+)", report)
    if not drc_match:
        raise RuntimeError("OpenROAD completed without a detailed-route DRC summary.")
    return {
        "routedDelayNs": float(arrival.group(1)),
        "internalPowerW": float(power.group(1)),
        "switchingPowerW": float(power.group(2)),
        "leakagePowerW": float(power.group(3)),
        "totalPowerW": float(power.group(4)),
        "routing": "OpenROAD placement + global and detailed routing",
        "detailedRouteDrcViolations": int(drc_match[-1]),
        "detailedRouteWireLengthUm": float(wire_match[-1]) if wire_match else None,
        "detailedRouteViaCount": int(via_match[-1]) if via_match else None,
        "parasitics": "OpenRCX detailed-route extraction using the Nangate45 rules file; not foundry-qualified",
        "powerActivity": "uniform 10% switching, 50% duty; vectorless estimate",
    }


def make_vectors(family, width, profile):
    rng = random.Random(947 + width + sum(ord(c) for c in family + profile))
    vectors = []
    a = b = 0
    for index in range(128):
        if profile == "low-toggle" and index:
            a ^= 1 << rng.randrange(width)
            b ^= 1 << rng.randrange(width)
        elif profile == "arithmetic":
            a = rng.randrange(min(256, 1 << width))
            b = rng.randrange(min(256, 1 << width))
        else:
            a, b = rng.getrandbits(width), rng.getrandbits(width)
        vectors.append((a, b, rng.randrange(4)))
    return vectors


def expected(family, width, a, b, mode):
    mask = (1 << width) - 1
    if family == "Adder":
        full = a + b + (mode & 1)
        return full & mask, (full >> width) & 1
    if family == "Comparator":
        return (mask if a < b else 0), int(a == b)
    if family == "Multiplier":
        full = a * b
        return full & mask, int(full > mask)
    if mode == 0:
        full = a + b
        return full & mask, (full >> width) & 1
    if mode == 1:
        return (a - b) & mask, int(a < b)
    result = (a & b) if mode == 2 else (a | b)
    return result, int(bool(result))


def trace_activity(vectors, width):
    transitions = 0
    possible = max(1, (len(vectors) - 1) * (2 * width + 2))
    for previous, current in zip(vectors, vectors[1:]):
        transitions += (previous[0] ^ current[0]).bit_count()
        transitions += (previous[1] ^ current[1]).bit_count()
        transitions += (previous[2] ^ current[2]).bit_count()
    return transitions / possible


def benchmark(family, architecture, width, constraints):
    run_started = time.time()
    with tempfile.TemporaryDirectory(prefix="ppa-") as temp:
        work = Path(temp)
        profile = constraints["workloadProfile"]
        vectors = make_vectors(family, width, profile)
        activity = trace_activity(vectors, width)
        (work / "top.v").write_text(rtl(family, architecture, width))
        bench = [f"module tb; reg [{width-1}:0] a,b; reg [1:0] mode; wire [{width-1}:0] sum; wire cout; top dut(a,b,mode,sum,cout); initial begin $dumpfile(\"workload.vcd\"); $dumpvars(0,tb);"]
        for a, b, mode in vectors:
            expected_sum, expected_cout = expected(family, width, a, b, mode)
            bench.append(f"a={width}'d{a}; b={width}'d{b}; mode=2'd{mode}; #1; if (sum !== {width}'d{expected_sum} || cout !== 1'd{expected_cout}) $fatal(1, \"mismatch\");")
        bench.append('$display("PASS"); $finish; end endmodule')
        (work / "tb.v").write_text("\n".join(bench))
        run(["iverilog", "-g2012", "-o", "sim", "top.v", "tb.v"], work)
        sim = run(["vvp", "sim"], work)
        yosys_script = (
            f"read_verilog top.v; hierarchy -top top; synth -top top; "
            f"abc -liberty {LIBERTY}; clean; "
            "hilomap -hicell LOGIC1_X1 Z -locell LOGIC0_X1 Z; clean; "
            f"stat -liberty {LIBERTY}; write_verilog -noattr mapped.v"
        )
        report = run(["yosys", "-p", yosys_script], work, timeout=120)
        area_match = re.findall(r"Chip area for module .*?:\s*([0-9.]+)", report)
        cell_match = re.findall(r"^\s*(\d+)\s+\w+", report, re.M)
        if not area_match:
            raise RuntimeError("Yosys completed but did not report mapped cell area.")
        (work / "timing.sdc").write_text(
            f"create_clock -name virtual_clk -period {constraints['clockPeriodNs']}\n"
            f"set_input_delay {constraints['inputDelayNs']} -clock virtual_clk [all_inputs]\n"
            f"set_output_delay {constraints['outputDelayNs']} -clock virtual_clk [all_outputs]\n"
        )
        physical = physical_analysis(work, width, constraints["clockPeriodNs"],
                                     constraints["inputDelayNs"], constraints["outputDelayNs"], activity)
        (work / "sta.tcl").write_text(
            f"read_liberty {LIBERTY}\nread_verilog mapped.v\nlink_design top\n"
            "source timing.sdc\nreport_checks -path_delay max\nexit\n"
        )
        sta_report = run(["sta", "-no_init", "-no_splash", "-exit", "sta.tcl"], work, timeout=90)
        arrival = re.search(r"^\s*([0-9]+(?:\.[0-9]+)?)\s+data arrival time\s*$", sta_report, re.M)
        delay_ns = float(arrival.group(1)) if arrival else None
        return {
            "family": family, "architecture": architecture, "bitWidth": width,
            "areaUm2": float(area_match[-1]),
            "delayNs": delay_ns,
            **physical,
            "mappedCellCount": int(cell_match[-1]) if cell_match else None,
            "simulation": "passed (128 workload vectors)",
            "workloadProfile": profile,
            "workloadActivity": activity,
            "synthesis": "Yosys + ABC, Nangate45 typical liberty",
            "elapsedSeconds": round(time.time() - run_started, 2),
            "areaSource": "mapped Liberty cell area",
            "timingSource": "OpenSTA max path after OpenRCX extraction; virtual clock with supplied period and I/O delays",
            "powerActivity": "simulation-trace-derived primary-input activity propagated vectorlessly; not gate-level VCD annotation",
        }


def search_designs(config=None):
    config = config or {}
    families = config.get("families", ["Adder"])
    widths = config.get("widths", list(WIDTHS))
    if not isinstance(families, list) or not families or any(f not in FAMILY_ARCHES for f in families):
        raise ValueError("Select one or more supported circuit families.")
    if not isinstance(widths, list) or not widths or any(type(w) is not int or w not in WIDTHS for w in widths):
        raise ValueError("Widths must be selected from 8, 16, 24, or 32.")
    families = list(dict.fromkeys(families))
    widths = list(dict.fromkeys(widths))
    constraints = {
        "clockPeriodNs": float(config.get("clockPeriodNs", 10)),
        "inputDelayNs": float(config.get("inputDelayNs", 0)),
        "outputDelayNs": float(config.get("outputDelayNs", 0)),
        "workloadProfile": config.get("workloadProfile", "random"),
    }
    if (not all(map(lambda x: 0 <= x <= 100, (constraints["clockPeriodNs"], constraints["inputDelayNs"], constraints["outputDelayNs"])))
        or constraints["clockPeriodNs"] <= 0 or constraints["workloadProfile"] not in WORKLOADS
        or constraints["inputDelayNs"] + constraints["outputDelayNs"] >= constraints["clockPeriodNs"]):
        raise ValueError("Use a positive clock period, non-negative I/O delays below the period, and a supported workload.")
    candidates = [(family, arch, width) for family in families for width in widths for arch in FAMILY_ARCHES[family]]
    if len(candidates) > 16:
        raise ValueError("A search is limited to 16 measured candidates; narrow the families or widths.")
    rows = [benchmark(family, arch, width, constraints) for family, arch, width in candidates]
    for row in rows:
        peers = [other for other in rows if other["family"] == row["family"] and other["bitWidth"] == row["bitWidth"]]
        row["pareto"] = not any(
            other is not row
            and other["areaUm2"] <= row["areaUm2"]
            and other["routedDelayNs"] <= row["routedDelayNs"]
            and other["totalPowerW"] <= row["totalPowerW"]
            and (other["areaUm2"] < row["areaUm2"] or other["routedDelayNs"] < row["routedDelayNs"] or other["totalPowerW"] < row["totalPowerW"])
            for other in peers
        )
    return {"status": "complete", "platform": "Nangate45 typical", "constraints": constraints, "results": rows}

def main():
    if not LIBERTY.is_file():
        LIBERTY.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(LIBERTY_URL, LIBERTY)
    if not LIBERTY.is_file():
        raise RuntimeError(f"Liberty file missing: {LIBERTY}")
    prepare_physical_assets()
    config = json.loads(sys.argv[1]) if len(sys.argv) > 1 else None
    result = search_designs(config)
    result["toolVersions"] = {
        "yosys": run(["yosys", "-V"], Path.cwd()).strip(),
        "iverilog": run(["iverilog", "-V"], Path.cwd()).splitlines()[0],
        "openroad": run(["openroad", "-version"], Path.cwd()).splitlines()[0],
    }
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}))
        raise
