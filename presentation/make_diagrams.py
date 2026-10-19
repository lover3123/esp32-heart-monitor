"""Generate all diagrams for the presentation as PNG files (matplotlib, no external deps)."""
import math
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Circle, Rectangle

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
OUT = HERE / "assets"
OUT.mkdir(exist_ok=True)

plt.rcParams["font.family"] = ["Segoe UI", "DejaVu Sans"]

NAVY = "#16324F"
INK = "#1F2A37"
MUTED = "#5B6B7C"
LINE = "#9AA9BC"
SHADOW = "#D9E1EA"
PANEL = "#F2F5F9"
AMBER = "#B45309"
TEAL = "#0F766E"
CYAN = "#0E7490"
BLUE = "#1D4ED8"
VIOLET = "#7C3AED"
INDIGO = "#4338CA"
RED = "#C0392B"
GREEN = "#15803D"
BAND = "#EAF3EC"
GOLD = "#B7791F"


def new_fig(w, h):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(0, w)
    ax.set_ylim(0, h)
    ax.set_aspect("equal")
    ax.axis("off")
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)
    return fig, ax


def box(ax, x, y, w, h, title, subtitle=None, color=NAVY, face="white",
        title_size=12, sub_size=9.5, border=2.0, dashed=False, shadow=True,
        title_color=None, sub_color=None):
    if shadow:
        ax.add_patch(FancyBboxPatch((x + 0.05, y - 0.05), w, h,
                                    boxstyle=f"round,pad=0,rounding_size={min(w, h) * 0.14}",
                                    fc=SHADOW, ec="none", alpha=0.65, zorder=1))
    ax.add_patch(FancyBboxPatch((x, y), w, h,
                                boxstyle=f"round,pad=0,rounding_size={min(w, h) * 0.14}",
                                fc=face, ec=color, lw=border,
                                ls=(0, (4, 3)) if dashed else "solid", zorder=2))
    tc = title_color or color
    if subtitle:
        ax.text(x + w / 2, y + h * 0.68, title, ha="center", va="center",
                fontsize=title_size, weight="bold", color=tc, zorder=3)
        ax.text(x + w / 2, y + h * 0.32, subtitle, ha="center", va="center",
                fontsize=sub_size, color=sub_color or MUTED, zorder=3, linespacing=1.45)
    else:
        ax.text(x + w / 2, y + h / 2, title, ha="center", va="center",
                fontsize=title_size, weight="bold", color=tc, zorder=3)


def chip(ax, x, y, w, h, text, color=NAVY, size=9, face=None):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
                                boxstyle=f"round,pad=0,rounding_size={min(w, h) * 0.45}",
                                fc=face or PANEL, ec=color, lw=1.1, zorder=3))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            fontsize=size, color=color, zorder=4, weight="medium")


def arrow(ax, p1, p2, color=LINE, lw=2.0, style="-|>", dashed=False, rad=0.0):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle=style, mutation_scale=15,
                                 color=color, lw=lw, zorder=4,
                                 linestyle=(0, (4, 3)) if dashed else "solid",
                                 connectionstyle=f"arc3,rad={rad}",
                                 shrinkA=1, shrinkB=1))


def label(ax, x, y, text, size=9, color=MUTED, weight=None, ha="center", bg=None):
    ax.text(x, y, text, ha=ha, va="center", fontsize=size, color=color,
            weight=weight, zorder=5,
            bbox=dict(fc="white", ec="none", pad=1.5) if bg else None)


# ---------------------------------------------------------------- architecture
def architecture():
    fig, ax = new_fig(13.2, 6.6)
    row_y, row_h = 4.25, 1.55
    xs = [0.35, 3.35, 6.35, 9.35]
    w = 2.6

    # cloud / local divider
    ax.plot([5.62, 5.62], [0.35, 6.25], color=LINE, lw=1.3, ls=(0, (5, 4)), zorder=1)
    label(ax, 4.35, 6.05, "Cloud / internet", size=10, color=MUTED)
    label(ax, 7.9, 6.05, "Your computer  (localhost, trusted LAN)", size=10, color=MUTED)

    box(ax, xs[0], row_y, w, row_h, "Wokwi simulation", "ESP32 + OLED + 2 pots\nsynthetic HR / SpO\u2082 / button", color=AMBER)
    box(ax, xs[1], row_y, w, row_h, "ThingSpeak channel", "cloud log \u00b7 Fields 1\u20134\nREST read API (feeds.json)", color=TEAL)
    box(ax, xs[2], row_y, w, row_h, "ThingSpeak \u2192 AI bridge", "Python, stdlib only\npolls \u00b7 dedupes \u00b7 forwards", color=CYAN)
    box(ax, xs[3], row_y, w, row_h, "Node API + SQLite", "Express \u00b7 validates \u00b7 persists\ntwo tables, WAL mode", color=BLUE)

    arrow(ax, (xs[0] + w, row_y + row_h / 2 + 0.15), (xs[1], row_y + row_h / 2 + 0.15), color=MUTED)
    label(ax, (xs[0] + w + xs[1]) / 2, row_y + row_h / 2 + 0.42, "HTTPS", size=8.5)
    arrow(ax, (xs[1] + w, row_y + row_h / 2 + 0.15), (xs[2], row_y + row_h / 2 + 0.15), color=MUTED)
    label(ax, (xs[1] + w + xs[2]) / 2, row_y + row_h / 2 + 0.42, "poll", size=8.5)
    arrow(ax, (xs[2] + w, row_y + row_h / 2 + 0.15), (xs[3], row_y + row_h / 2 + 0.15), color=MUTED)
    label(ax, (xs[2] + w + xs[3]) / 2, row_y + row_h / 2 + 0.42, "HTTP", size=8.5)

    ai_x, ai_y, ai_w, ai_h = xs[3], 2.35, w, 1.5
    box(ax, ai_x, ai_y, ai_w, ai_h, "AI service", "FastAPI \u00b7 review rules\n+ Isolation Forest", color=VIOLET)
    arrow(ax, (xs[3] + w * 0.62, row_y), (xs[3] + w * 0.62, ai_y + ai_h), color=VIOLET, style="<|-|>")
    label(ax, xs[3] + w + 0.55, (row_y + ai_y + ai_h) / 2, "reading \u2192 /score\nflags \u2190", size=8.5, color=VIOLET, bg=True)

    dash_x, dash_y, dash_w, dash_h = xs[2], 0.55, w, 1.35
    box(ax, dash_x, dash_y, dash_w, dash_h, "Web dashboard", "metrics \u00b7 AI review \u00b7 symptoms\nauto-refresh 10 s", color=INDIGO, title_size=11)
    arrow(ax, (xs[3] + w * 0.28, row_y), (dash_x + dash_w * 0.7, dash_y + dash_h),
          color=INDIGO, rad=0.18)

    box(ax, 0.9, 2.6, 2.6, 1.35, "Physical build (optional)",
        "ESP32 + MAX30102 post straight\nto the Node API on the LAN \u2014\nThingSpeak and bridge not required",
        color=LINE, title_size=9.5, sub_size=8.4, dashed=True, shadow=False)

    fig.savefig(OUT / "arch_diagram.png", dpi=150, facecolor="white")
    plt.close(fig)
    print("arch_diagram.png")


# ------------------------------------------------------------------- dataflow
def dataflow():
    fig, ax = new_fig(13.2, 3.3)
    steps = [
        ("Wokwi posts", "synthetic reading every ~20 s", AMBER),
        ("ThingSpeak stores", "timestamped entry, Fields 1\u20134", TEAL),
        ("Bridge polls", "skips already-processed IDs", CYAN),
        ("Node API saves", "validates ranges \u2192 SQLite", BLUE),
        ("AI scores", "rules + anomaly model", VIOLET),
        ("Flags stored", "attached to the reading row", VIOLET),
        ("Dashboard shows", "metrics + flags, refresh 10 s", INDIGO),
        ("You review", "compare with symptom log", MUTED),
    ]
    w, gap = 1.42, 0.24
    x0, y, h = 0.15, 0.85, 1.5
    for i, (t, s, c) in enumerate(steps):
        x = x0 + i * (w + gap)
        box(ax, x, y, w, h, t, s, color=c, title_size=8.6, sub_size=7.3, border=1.6)
        ax.add_patch(Circle((x + w / 2, y + h + 0.42), 0.185, fc=c, ec="white", lw=1.2, zorder=4))
        ax.text(x + w / 2, y + h + 0.42, str(i + 1), ha="center", va="center",
                fontsize=9, color="white", weight="bold", zorder=5)
        if i:
            arrow(ax, (x - gap + 0.01, y + h / 2), (x - 0.01, y + h / 2), color=LINE, lw=1.8)
    fig.savefig(OUT / "dataflow.png", dpi=150, facecolor="white")
    plt.close(fig)
    print("dataflow.png")


# ----------------------------------------------------------------- ai_pipeline
def ai_pipeline():
    fig, ax = new_fig(12.2, 6.1)
    box(ax, 0.35, 2.45, 2.2, 1.3, "New reading", "HR \u00b7 SpO\u2082 \u00b7 quality\nmanual flag", color=NAVY, title_size=11)

    s1x, s1y, s1w, s1h = 3.25, 3.5, 4.5, 2.35
    box(ax, s1x, s1y, s1w, s1h, "", None, color=BLUE)
    ax.text(s1x + s1w / 2, s1y + s1h - 0.30, "Stage 1 \u2014 review rules  (active immediately)",
            ha="center", va="center", fontsize=10.5, weight="bold", color=BLUE, zorder=3)
    chips = ["HR < 50 or > 120 bpm", "SpO\u2082 below 92%",
             "signal quality below 40", "manual / test flag present"]
    for i, c in enumerate(chips):
        chip(ax, s1x + 0.25, s1y + 1.63 - i * 0.42, s1w - 0.5, 0.34, c, color=BLUE, size=8.8)

    s2x, s2y, s2w, s2h = 3.25, 0.45, 4.5, 2.35
    box(ax, s2x, s2y, s2w, s2h, "", None, color=VIOLET)
    ax.text(s2x + s2w / 2, s2y + s2h - 0.30, "Stage 2 \u2014 unsupervised anomaly  (after \u2265 50 samples)",
            ha="center", va="center", fontsize=10.5, weight="bold", color=VIOLET, zorder=3)
    chips2 = ["Isolation Forest, contamination 0.05",
              "rolling history \u2264 1000 samples \u00b7 in-memory",
              "flags \u201cunusual vs recent history\u201d"]
    for i, c in enumerate(chips2):
        chip(ax, s2x + 0.25, s2y + 1.58 - i * 0.42, s2w - 0.5, 0.34, c, color=VIOLET, size=8.8)

    arrow(ax, (2.55, 3.2), (3.25, 4.55), color=LINE, lw=1.8)
    arrow(ax, (2.55, 3.0), (3.25, 1.6), color=LINE, lw=1.8)

    ox, oy, ow, oh = 8.55, 2.45, 3.3, 1.7
    box(ax, ox, oy, ow, oh, "Review flags + anomaly score",
        "stored in SQLite\nshown on the dashboard", color=NAVY, title_size=10.5)
    arrow(ax, (s1x + s1w, 4.55), (ox, 4.0), color=LINE, lw=1.8)
    arrow(ax, (s2x + s2w, 1.6), (ox, 2.7), color=LINE, lw=1.8)

    chip(ax, ox - 0.15, 1.35, ow + 0.3, 0.55, "advisory only \u2014 not a diagnosis or arrhythmia detector",
         color=RED, size=8.8, face="#FDF1F0")

    fig.savefig(OUT / "ai_pipeline.png", dpi=150, facecolor="white")
    plt.close(fig)
    print("ai_pipeline.png")


# ---------------------------------------------------------------------- wiring
def wiring():
    fig, ax = new_fig(10.5, 5.6)
    box(ax, 0.6, 1.75, 3.3, 3.2, "ESP32 DevKit", "3.3 V logic \u00b7 I\u00b2C master", color=NAVY, title_size=13)
    dev_pins = [("3V3", 4.45, "#C0392B"), ("GND", 4.0, "#111827"),
                ("GPIO21", 3.3, "#1D4ED8"), ("GPIO22", 2.85, "#15803D")]
    for name, py, c in dev_pins:
        chip(ax, 3.06, py - 0.16, 0.84, 0.32, name, color=c, size=8.2)

    mx, my, mw, mh = 6.2, 2.0, 3.6, 2.7
    ax.add_patch(FancyBboxPatch((mx, my), mw, mh, boxstyle="round,pad=0,rounding_size=0.12",
                                fc="#7A1F1A", ec="#5B1512", lw=1.6, zorder=2))
    ax.add_patch(Circle((mx + 1.45, my + 1.85), 0.42, fc="#2B2B2B", ec="#111", lw=1.2, zorder=3))
    ax.add_patch(Circle((mx + 2.55, my + 1.85), 0.42, fc="#111827", ec="#000", lw=1.2, zorder=3))
    ax.text(mx + 1.45, my + 1.85, "LED", ha="center", va="center", fontsize=7.5, color="white", zorder=4)
    ax.text(mx + 2.55, my + 1.85, "PD", ha="center", va="center", fontsize=7.5, color="white", zorder=4)
    ax.text(mx + mw / 2, my + mh - 0.32, "MAX30102 breakout", ha="center", va="center",
            fontsize=11.5, weight="bold", color="white", zorder=4)
    ax.text(mx + 1.45, my + 1.1, "red + IR LEDs", ha="center", fontsize=7.5, color="#F8D7D0", zorder=4)
    ax.text(mx + 2.55, my + 1.1, "photodiode", ha="center", fontsize=7.5, color="#F8D7D0", zorder=4)
    mx_pins = [("VIN", 4.45), ("GND", 4.0), ("SCL", 3.3), ("SDA", 2.85), ("INT", 2.4)]
    for name, py in mx_pins:
        chip(ax, mx + 0.12, py - 0.16, 0.8, 0.32, name, color="#5B1512", size=8.2, face="white")

    def wire(y1, y2, color, dashed=False, text=None, tx=5.05):
        ax.plot([3.9, 6.32], [y1, y2], color=color, lw=2.2 if not dashed else 1.6,
                ls=(0, (4, 3)) if dashed else "solid", zorder=3)
        if text:
            label(ax, tx, (y1 + y2) / 2 + 0.24, text, size=8, color=color)

    wire(4.45, 4.45, "#C0392B", text="3.3 V")
    wire(4.0, 4.0, "#111827", text="GND")
    wire(3.3, 2.85, "#1D4ED8")
    wire(2.85, 3.3, "#15803D")
    wire(2.3, 2.4, "#9AA9BC", dashed=True, text="INT \u2014 not used")
    label(ax, 4.42, 3.36, "SDA", size=8, color="#1D4ED8", bg=True)
    label(ax, 5.88, 3.44, "SCL", size=8, color="#15803D", bg=True)

    ax.text(5.25, 0.95, "I\u00b2C address 0x57  \u00b7  3.3 V supply only  \u00b7  short wires, keep still",
            ha="center", fontsize=9.5, color=MUTED)
    fig.savefig(OUT / "wiring.png", dpi=150, facecolor="white")
    plt.close(fig)
    print("wiring.png")


# -------------------------------------------------------------- anomaly chart
def anomaly_chart():
    xs = list(range(1, 61))
    hrs = []
    for i in range(55):
        hr = 73 + 6 * math.sin(i / 6.0) + ((i * 7) % 5 - 2) * 0.6
        hrs.append(hr)
    hrs += [124, 74, 76, 78]          # special readings
    hrs += [152]                       # final outlier

    fig, ax = plt.subplots(figsize=(11, 5.0))
    fig.subplots_adjust(left=0.075, right=0.985, top=0.88, bottom=0.13)
    ax.axhspan(50, 120, color=BAND, zorder=0)
    ax.axvline(50, color=VIOLET, lw=1.4, ls=(0, (5, 4)), zorder=1)
    ax.text(50.8, 44, "anomaly model active  (\u2265 50 samples)", color=VIOLET, fontsize=9.5)
    ax.set_title("Heart-rate history of the verification session  (61 readings)",
                 fontsize=13, color=NAVY, weight="bold", pad=10)
    settled = xs[:55]
    ax.scatter(settled, hrs[:55], s=26, color=NAVY, zorder=3, label="baseline readings")
    ax.scatter(xs[55:59], hrs[55:59], s=42, color=GOLD, zorder=4, edgecolor="white", linewidth=0.8,
               label="special readings (high HR / low SpO\u2082 / low quality / manual)")
    ax.scatter([61], [152], s=110, color=RED, zorder=5, edgecolor="white", linewidth=1.2,
               label="final outlier")
    ax.annotate("152 bpm \u2014 outside review band\nand unusual vs recent history\n(Isolation Forest: anomaly = 1)",
                xy=(61, 152), xytext=(33.5, 128), fontsize=9.5, color=RED,
                bbox=dict(fc="white", ec="none", alpha=0.92, pad=2.5),
                arrowprops=dict(arrowstyle="-|>", color=RED, lw=1.4))
    ax.set_xlabel("reading number (session)", fontsize=10.5, color=INK)
    ax.set_ylabel("heart rate (bpm)", fontsize=10.5, color=INK)
    ax.set_ylim(40, 165)
    ax.set_xlim(0, 63)
    ax.grid(axis="y", color="#E3E9F0", lw=0.8)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_color("#C9D4E0")
    ax.spines["bottom"].set_color("#C9D4E0")
    ax.tick_params(colors=MUTED, labelsize=9.5)
    ax.legend(loc="upper left", fontsize=8.6, framealpha=0.95, edgecolor="#D5DEE8")
    fig.savefig(OUT / "anomaly_chart.png", dpi=150, facecolor="white")
    plt.close(fig)
    print("anomaly_chart.png")


# ------------------------------------------------------------ module drawing
def max30102_module():
    fig, ax = new_fig(4.8, 3.6)
    mx, my, mw, mh = 0.5, 0.75, 3.8, 2.2
    ax.add_patch(FancyBboxPatch((mx, my), mw, mh, boxstyle="round,pad=0,rounding_size=0.12",
                                fc="#7A1F1A", ec="#5B1512", lw=1.8, zorder=2))
    ax.add_patch(Circle((mx + 1.35, my + 1.35), 0.42, fc="#2B2B2B", ec="#111", lw=1.2, zorder=3))
    ax.add_patch(Circle((mx + 2.45, my + 1.35), 0.42, fc="#111827", ec="#000", lw=1.2, zorder=3))
    ax.text(mx + 1.35, my + 1.35, "LED", ha="center", va="center", fontsize=7, color="white", zorder=4)
    ax.text(mx + 2.45, my + 1.35, "PD", ha="center", va="center", fontsize=7, color="white", zorder=4)
    ax.text(mx + mw / 2, my + mh - 0.34, "MAX30102", ha="center", va="center",
            fontsize=13, weight="bold", color="white", zorder=4)
    pins = ["VIN", "GND", "SCL", "SDA", "INT"]
    for i, p in enumerate(pins):
        px = mx + 0.45 + i * 0.72
        ax.add_patch(Rectangle((px - 0.1, my + mh - 0.12), 0.2, 0.22, fc="#E8C15A",
                               ec="#B7791F", lw=1.0, zorder=3))
        ax.text(px, my + mh + 0.18, p, ha="center", va="center", fontsize=7.5,
                color=MUTED, zorder=4)
    ax.text(mx + 1.35, my + 0.55, "red + IR LEDs", ha="center", fontsize=8, color="#F8D7D0", zorder=4)
    ax.text(mx + 2.45, my + 0.55, "photodiode", ha="center", fontsize=8, color="#F8D7D0", zorder=4)
    ax.text(2.4, 0.18, "estimates pulse rate & SpO\u2082  \u00b7  not an ECG sensor",
            ha="center", fontsize=8.5, color=MUTED)
    fig.savefig(OUT / "max30102_module.png", dpi=150, facecolor="white")
    plt.close(fig)
    print("max30102_module.png")


# ------------------------------------------------------------------- pulse line
def pulse_line():
    fig, ax = plt.subplots(figsize=(6.4, 1.1))
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)
    rel = [(0.34, 0.50), (0.05, 0.40), (0.05, 0.92), (0.05, 0.08), (0.07, 0.50), (0.36, 0.50)]
    x, y = [0.0, 0.0], [0.5, 0.5]
    cx = 0.0
    for _ in range(4):
        for dx, yy in rel:
            cx += dx
            x.append(cx)
            y.append(yy)
    ax.plot(x, y, color=RED, lw=2.6, solid_capstyle="round")
    ax.set_xlim(0, cx)
    ax.set_ylim(0, 1)
    ax.axis("off")
    fig.savefig(OUT / "pulse_line.png", dpi=200, transparent=True)
    plt.close(fig)
    print("pulse_line.png")


if __name__ == "__main__":
    architecture()
    dataflow()
    ai_pipeline()
    wiring()
    anomaly_chart()
    max30102_module()
    pulse_line()
    print("all diagrams written to", OUT)
