"""
Static charts via Seaborn theme + Matplotlib rendering.

Smart y-axis zoom, endpoint labels, sparse-data annotations, and consistent headers.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import seaborn as sns
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

from math_overlays import HMM_STATE_LABELS

COLORS = {
    "prob": "#8B6914",
    "kalman": "#1B6B4A",
    "bayes": "#4A3D6B",
    "garch": "#B8432F",
    "hawkes": "#C4692A",
    "muted": "#7A7268",
    "grid": "#DDD4C6",
    "fed": "#B8432F",
    "news": "#C9973A",
    "alert": "#B8432F",
    "bg": "#FAF6EF",
    "panel": "#F0EAE0",
    "text": "#2E2A26",
}

REGIME_FILL = {0: "#B8432F", 1: "#8A8278", 2: "#1B6B4A"}

sns.set_theme(
    style="whitegrid",
    context="talk",
    font_scale=0.82,
    rc={
        "figure.facecolor": COLORS["bg"],
        "axes.facecolor": COLORS["bg"],
        "axes.edgecolor": COLORS["grid"],
        "axes.labelcolor": COLORS["text"],
        "text.color": COLORS["text"],
        "xtick.color": COLORS["muted"],
        "ytick.color": COLORS["muted"],
        "grid.color": COLORS["grid"],
        "grid.linewidth": 0.7,
        "grid.alpha": 0.65,
        "legend.framealpha": 0.95,
        "legend.edgecolor": COLORS["grid"],
        "font.family": "sans-serif",
        "font.sans-serif": ["Inter", "Segoe UI", "DejaVu Sans", "sans-serif"],
        "lines.markersize": 8,
    },
)


@dataclass
class ChartMeta:
    ticker: str
    title: str
    n_bars: int
    latest_prob: float
    regime: str | None = None
    regime_engine: str | None = None


def _dates(bars: Sequence[object]) -> list[str]:
    return [getattr(b, "date", str(i)) for i, b in enumerate(bars)]


def _x(bars: Sequence[object]) -> np.ndarray:
    return np.arange(len(bars))


def _figsize(n: int) -> tuple[float, float]:
    width = max(10.0, min(14.0, 8.0 + n * 0.35))
    return width, 4.8


def _smart_prob_limits(*series: np.ndarray, pad: float = 0.06) -> tuple[float, float]:
    flat = np.concatenate([s[np.isfinite(s)] for s in series if len(s)])
    if len(flat) == 0:
        return 0.0, 1.0
    lo, hi = float(flat.min()), float(flat.max())
    span = max(hi - lo, 0.05)
    y0 = max(0.0, lo - span * pad)
    y1 = min(1.0, hi + span * pad)
    if y1 - y0 < 0.12:
        mid = (y0 + y1) / 2
        y0, y1 = max(0, mid - 0.06), min(1, mid + 0.06)
    return y0, y1


def _style_ax(ax: plt.Axes, bars: Sequence[object], *, ylabel: str = "") -> None:
    labels = _dates(bars)
    ax.set_xticks(np.arange(len(labels)))
    ax.set_xticklabels(labels, rotation=0 if len(labels) <= 10 else 30, ha="right")
    ax.set_xlabel("Date", labelpad=8)
    if ylabel:
        ax.set_ylabel(ylabel, labelpad=8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.set_xlim(-0.6, len(labels) - 0.4)


def _percent_axis(ax: plt.Axes, decimals: int = 0) -> None:
    ax.yaxis.set_major_formatter(mticker.PercentFormatter(xmax=1.0, decimals=decimals))


def _header(fig: plt.Figure, meta: ChartMeta | None, chart_title: str, *, y: float = 0.97) -> None:
    fig.suptitle(chart_title, x=0.08, ha="left", fontsize=15, fontweight="600", color=COLORS["text"], y=y)
    if meta:
        cents = round(meta.latest_prob * 100)
        sub = f"{meta.ticker}  ·  {meta.n_bars} bars  ·  latest {meta.latest_prob:.1%} ({cents}¢)"
        if meta.regime:
            sub += f"  ·  regime {meta.regime}"
        fig.text(0.08, y - 0.055, sub, ha="left", fontsize=10, color=COLORS["muted"])


def _footer(fig: plt.Figure, note: str) -> None:
    fig.text(0.08, 0.02, note, ha="left", fontsize=8.5, color=COLORS["muted"], style="italic")


def _line(
    ax: plt.Axes,
    x: np.ndarray,
    y: np.ndarray,
    *,
    color: str,
    label: str,
    lw: float = 2.2,
    ls: str = "-",
    alpha: float = 1.0,
    marker: str = "o",
    ms: float = 7,
    zorder: int = 3,
) -> None:
    ax.plot(x, y, color=color, label=label, lw=lw, ls=ls, alpha=alpha, marker=marker, ms=ms, zorder=zorder)


def _label_points(ax: plt.Axes, x: np.ndarray, y: np.ndarray, *, color: str, n_max: int = 14) -> None:
    if len(x) > n_max:
        return
    for xi, yi in zip(x, y):
        ax.annotate(
            f"{yi:.1%}",
            (xi, yi),
            textcoords="offset points",
            xytext=(0, 9),
            ha="center",
            fontsize=8,
            color=color,
            fontweight="500",
        )


def _endpoint_label(ax: plt.Axes, x: np.ndarray, y: np.ndarray, *, color: str, name: str) -> None:
    if len(x) == 0:
        return
    ax.annotate(
        f"{name} {y[-1]:.1%}",
        (x[-1], y[-1]),
        textcoords="offset points",
        xytext=(8, 0),
        ha="left",
        va="center",
        fontsize=9,
        color=color,
        fontweight="600",
        bbox=dict(boxstyle="round,pad=0.25", fc="white", ec=color, alpha=0.9, lw=0.8),
    )


def _bayesian_xy(bars: Sequence[object], bayes: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Align belief updates with bar dates (prior excluded from first bar)."""
    x = _x(bars)
    n_returns = len(bayes) - 1
    if n_returns <= 0:
        return np.array([]), np.array([])
    idx = x[1 : 1 + n_returns]
    vals = bayes[1 : 1 + n_returns]
    return idx, vals


def save_fig(fig: plt.Figure, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor=COLORS["bg"], pad_inches=0.35)
    plt.close(fig)


def _macro_vlines(ax: plt.Axes, bars: Sequence[object], which: str = "news") -> list[Line2D]:
    handles: list[Line2D] = []
    fed_done = news_done = False
    for i, b in enumerate(bars):
        is_fed = getattr(b, "is_fed_day", False)
        is_news = getattr(b, "is_news_day", False)
        if which == "fed" and is_fed:
            ax.axvline(i, color=COLORS["fed"], ls="--", lw=1.5, alpha=0.7, zorder=1)
            if not fed_done:
                handles.append(Line2D([0], [0], color=COLORS["fed"], ls="--", lw=1.5, label="Fed day"))
                fed_done = True
        if which == "news" and (is_fed or is_news):
            ax.axvline(i, color=COLORS["news"], ls=":", lw=1.3, alpha=0.55, zorder=1)
            if not news_done:
                handles.append(Line2D([0], [0], color=COLORS["news"], ls=":", lw=1.3, label="Macro day"))
                news_done = True
    return handles


def _regime_bands(ax: plt.Axes, hmm_path: np.ndarray) -> None:
    if len(hmm_path) == 0:
        return
    states = hmm_path.astype(int)
    run_start = 0
    for j in range(1, len(states)):
        if states[j] != states[run_start]:
            ax.axvspan(run_start - 0.5, j + 0.5, color=REGIME_FILL[int(states[run_start])], alpha=0.18, zorder=0)
            run_start = j
    ax.axvspan(run_start - 0.5, len(states) + 0.5, color=REGIME_FILL[int(states[run_start])], alpha=0.18, zorder=0)


def _needs_belief_axis(probs: np.ndarray, belief: np.ndarray, threshold: float = 0.15) -> bool:
    if len(belief) == 0:
        return False
    p_lo, p_hi = float(probs.min()), float(probs.max())
    b_lo, b_hi = float(belief.min()), float(belief.max())
    return b_lo < p_lo - threshold or b_hi > p_hi + threshold


def chart_overview(
    path: Path,
    bars: Sequence[object],
    probs: np.ndarray,
    title: str,
    meta: ChartMeta | None = None,
) -> None:
    """01 — raw implied YES + volume only (CHART-PRD)."""
    x = _x(bars)
    volumes = np.array([getattr(b, "volume", 0) for b in bars], dtype=float)

    fig, ax = plt.subplots(figsize=_figsize(len(bars)))
    fig.subplots_adjust(top=0.82, bottom=0.14, right=0.88)
    _header(fig, meta, f"Overview — {title[:65]}")

    ax.fill_between(x, probs, alpha=0.22, color=COLORS["prob"], zorder=2)
    _line(ax, x, probs, color=COLORS["prob"], label="Implied YES", lw=2.8, ms=8)
    _style_ax(ax, bars, ylabel="Probability")
    _percent_axis(ax)
    ax.set_ylim(_smart_prob_limits(probs))
    _label_points(ax, x, probs, color=COLORS["prob"])
    _endpoint_label(ax, x, probs, color=COLORS["prob"], name="YES")

    ax_vol = ax.twinx()
    ax_vol.set_facecolor("none")
    ax_vol.bar(x, volumes, alpha=0.28, color=COLORS["muted"], width=0.65, label="Volume", zorder=1)
    ax_vol.set_ylabel("Contracts", color=COLORS["muted"], labelpad=8)
    ax_vol.tick_params(axis="y", colors=COLORS["muted"])

    handles, _ = ax.get_legend_handles_labels()
    h2, _ = ax_vol.get_legend_handles_labels()
    ax.legend(handles=handles + h2, loc="upper left", fontsize=9, frameon=True)
    _footer(fig, "Primary market story — no smoothing (see docs/CHART-PRD.md)")
    save_fig(fig, path)


def chart_macro_events(
    path: Path,
    bars: Sequence[object],
    probs: np.ndarray,
    title: str,
    meta: ChartMeta | None = None,
) -> None:
    """10 — calendar overlay on raw odds + volume."""
    x = _x(bars)
    volumes = np.array([getattr(b, "volume", 0) for b in bars], dtype=float)

    fig, ax = plt.subplots(figsize=_figsize(len(bars)))
    fig.subplots_adjust(top=0.82, bottom=0.14, right=0.88)
    _header(fig, meta, f"Macro calendar — {title[:55]}")

    _line(ax, x, probs, color=COLORS["prob"], label="Implied YES", lw=2.6, ms=7)
    fed_handles = _macro_vlines(ax, bars, "fed")
    news_handles = _macro_vlines(ax, bars, "news")
    _style_ax(ax, bars, ylabel="Probability")
    _percent_axis(ax)
    ax.set_ylim(_smart_prob_limits(probs))

    ax_vol = ax.twinx()
    ax_vol.bar(x, volumes, alpha=0.22, color=COLORS["muted"], width=0.65, label="Volume")
    ax_vol.set_ylabel("Contracts", color=COLORS["muted"])
    ax_vol.tick_params(axis="y", colors=COLORS["muted"])

    handles, _ = ax.get_legend_handles_labels()
    h2, _ = ax_vol.get_legend_handles_labels()
    ax.legend(handles=handles + h2 + fed_handles + news_handles, loc="upper left", fontsize=9)
    _footer(fig, "Fed days (red) and macro releases (orange) from ForexFactory")
    save_fig(fig, path)


def chart_hawkes(
    path: Path,
    bars: Sequence[object],
    probs: np.ndarray,
    hawkes: np.ndarray,
    meta: ChartMeta | None = None,
) -> None:
    x = _x(bars)
    fig, (ax, ax_sc) = plt.subplots(
        2, 1, figsize=(_figsize(len(bars))[0], 6.2), gridspec_kw={"height_ratios": [2.2, 1]}
    )
    fig.subplots_adjust(top=0.86, bottom=0.12, hspace=0.32)
    _header(fig, meta, "Hawkes intensity")

    ax.fill_between(x, hawkes, 0.3, where=hawkes >= 0.3, alpha=0.2, color=COLORS["hawkes"], interpolate=True)
    ax.fill_between(x, hawkes, 1.5, where=hawkes >= 1.5, alpha=0.25, color=COLORS["alert"], interpolate=True)
    _line(ax, x, hawkes, color=COLORS["hawkes"], label="λ(t)", lw=2.8)
    ax.axhline(1.5, color=COLORS["alert"], ls="--", lw=1.5, label="Alert (1.5)")
    ax.axhline(0.3, color=COLORS["muted"], ls=":", lw=1.5, label="Baseline μ (0.3)")
    _style_ax(ax, bars, ylabel="Intensity")
    y1 = max(float(hawkes.max()) * 1.15, 1.6) if len(hawkes) else 1.6
    ax.set_ylim(0, y1)
    _label_points(ax, x, hawkes, color=COLORS["hawkes"])
    ax.legend(loc="upper right", fontsize=9)
    fig.text(
        0.08, 0.52,
        "μ=0.3  α=0.6  β=1.2  (fixed demo; excitation from large |return| days)",
        fontsize=8.5, color=COLORS["muted"],
    )

    ax_sc.scatter(probs, hawkes, c=COLORS["hawkes"], s=48, alpha=0.75, edgecolors="white", linewidths=0.8)
    ax_sc.set_xlabel("Implied YES probability")
    ax_sc.set_ylabel("λ(t)")
    ax_sc.set_title("Intensity vs probability", fontsize=11, loc="left", color=COLORS["text"])
    ax_sc.xaxis.set_major_formatter(mticker.PercentFormatter(xmax=1.0, decimals=0))
    ax_sc.spines["top"].set_visible(False)
    ax_sc.spines["right"].set_visible(False)
    _footer(fig, "Self-exciting model — not tied to ForexFactory calendar")
    save_fig(fig, path)


def chart_garch(path: Path, bars: Sequence[object], garch: np.ndarray, meta: ChartMeta | None = None) -> None:
    labels = _dates(bars)
    x = np.arange(1, 1 + len(garch))
    fig, ax = plt.subplots(figsize=_figsize(len(garch)))
    fig.subplots_adjust(top=0.82, bottom=0.14)
    _header(fig, meta, "GARCH(1,1) volatility")

    _line(ax, x, garch, color=COLORS["garch"], label="Ann. vol", lw=2.8)
    ax.set_xticks(x)
    ax.set_xticklabels(labels[1 : 1 + len(garch)], rotation=0 if len(garch) <= 10 else 30, ha="right")
    ax.set_xlabel("Date", labelpad=8)
    ax.set_ylabel("Annualized vol (approx.)", labelpad=8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    if len(garch):
        _endpoint_label(ax, x, garch, color=COLORS["garch"], name="Vol")
    ax.legend(loc="upper right", fontsize=9)
    save_fig(fig, path)


def chart_hmm(
    path: Path,
    bars: Sequence[object],
    probs: np.ndarray,
    hmm_path: np.ndarray,
    meta: ChartMeta | None = None,
) -> None:
    x = _x(bars)
    current = HMM_STATE_LABELS[hmm_path[-1]] if len(hmm_path) else "Neutral"

    fig, ax = plt.subplots(figsize=_figsize(len(bars)))
    fig.subplots_adjust(top=0.82, bottom=0.14)
    engine = getattr(meta, "regime_engine", None) if meta else None
    subtitle = "HMM regimes (Viterbi)" if engine == "hmm" else "Regimes (3-day Kalman rule)"
    _header(fig, meta, subtitle)

    _regime_bands(ax, hmm_path)
    _line(ax, x, probs, color=COLORS["prob"], label="Implied YES", lw=2.8, zorder=4)
    _style_ax(ax, bars, ylabel="Probability")
    _percent_axis(ax)
    ax.set_ylim(_smart_prob_limits(probs))

    regime_handles = [Patch(facecolor=REGIME_FILL[i], edgecolor="none", alpha=0.55, label=l) for i, l in enumerate(HMM_STATE_LABELS)]
    prob_handle = Line2D([0], [0], color=COLORS["prob"], lw=2.5, marker="o", label="Implied YES")
    ax.legend(handles=[prob_handle] + regime_handles, loc="upper right", fontsize=9, ncol=2)

    engine_note = "HMM/Viterbi" if meta and meta.regime_engine == "hmm" else "3-day Kalman"
    ax.text(
        0.99, 0.04, f"Latest day: {current}  ({engine_note}; bands = mood by period)",
        transform=ax.transAxes, ha="right", va="bottom",
        fontsize=9, fontweight="600", color=REGIME_FILL.get(int(hmm_path[-1]) if len(hmm_path) else 1, COLORS["muted"]),
        bbox=dict(boxstyle="round,pad=0.35", fc="white", ec=COLORS["grid"], alpha=0.95),
    )
    save_fig(fig, path)


def chart_kalman(path: Path, bars: Sequence[object], probs: np.ndarray, kalman: np.ndarray, meta: ChartMeta | None = None) -> None:
    x = _x(bars)
    fig, ax = plt.subplots(figsize=_figsize(len(bars)))
    fig.subplots_adjust(top=0.82, bottom=0.14)
    _header(fig, meta, "Kalman smoothing")

    ax.fill_between(x, probs, kalman, alpha=0.15, color=COLORS["kalman"], zorder=2)
    _line(ax, x, probs, color=COLORS["muted"], label="Raw", lw=1.6, alpha=0.7, ms=6)
    _line(ax, x, kalman, color=COLORS["kalman"], label="Kalman filtered", lw=3, ms=8)
    _style_ax(ax, bars, ylabel="Probability")
    _percent_axis(ax)
    ax.set_ylim(_smart_prob_limits(probs, kalman))
    _endpoint_label(ax, x, kalman, color=COLORS["kalman"], name="Filtered")
    ax.legend(loc="upper right", fontsize=9)
    save_fig(fig, path)


def chart_changepoints(
    path: Path,
    bars: Sequence[object],
    probs: np.ndarray,
    cps: list[int],
    meta: ChartMeta | None = None,
) -> None:
    x = _x(bars)
    fig, ax = plt.subplots(figsize=_figsize(len(bars)))
    fig.subplots_adjust(top=0.82, bottom=0.14)
    _header(fig, meta, f"Change-point detector — {len(cps)} flag{'s' if len(cps) != 1 else ''}")

    _line(ax, x, probs, color=COLORS["prob"], label="Implied YES", lw=2.8)
    for cp in cps:
        if 0 <= cp < len(bars):
            ax.axvline(cp, color=COLORS["alert"], ls="--", lw=2, alpha=0.85, zorder=1)
            ax.scatter([cp], [probs[cp]], s=120, facecolors="none", edgecolors=COLORS["alert"], lw=2, zorder=5)
            ax.annotate("Level shift", (cp, probs[cp]), xytext=(8, 12), textcoords="offset points", fontsize=9, color=COLORS["alert"])

    if not cps:
        ax.text(0.5, 0.5, "No level shifts detected", transform=ax.transAxes, ha="center", va="center", fontsize=12, color=COLORS["muted"])

    _style_ax(ax, bars, ylabel="Probability")
    _percent_axis(ax)
    ax.set_ylim(_smart_prob_limits(probs))
    save_fig(fig, path)


def chart_bayesian(path: Path, bars: Sequence[object], bayes: np.ndarray, meta: ChartMeta | None = None) -> None:
    bx, by = _bayesian_xy(bars, bayes)
    fig, ax = plt.subplots(figsize=_figsize(len(bars)))
    fig.subplots_adjust(top=0.82, bottom=0.14)
    _header(fig, meta, "Bayesian posterior path")

    if len(bx):
        ax.fill_between(bx, by, alpha=0.18, color=COLORS["bayes"], zorder=2)
        _line(ax, bx, by, color=COLORS["bayes"], label="Posterior belief", lw=2.8)
        _label_points(ax, bx, by, color=COLORS["bayes"])
        _endpoint_label(ax, bx, by, color=COLORS["bayes"], name="Belief")

    ax.axhline(0.5, color=COLORS["muted"], ls=":", lw=1, alpha=0.6, label="Prior (50%)")
    _style_ax(ax, bars, ylabel="Belief")
    _percent_axis(ax)
    ax.set_ylim(_smart_prob_limits(by if len(by) else np.array([0.5])))

    handles, labels = ax.get_legend_handles_labels()
    ax.legend(handles=handles + macro_handles, loc="upper right", fontsize=9)
    _footer(fig, "Heuristic likelihood from returns — not fitted from order flow")
    save_fig(fig, path)


def chart_ssm(
    path: Path,
    bars: Sequence[object],
    probs: np.ndarray,
    level: np.ndarray,
    forecast: np.ndarray,
    meta: ChartMeta | None = None,
) -> None:
    x = _x(bars)
    fig, ax = plt.subplots(figsize=_figsize(len(bars)))
    fig.subplots_adjust(top=0.82, bottom=0.14)
    _header(fig, meta, "State-space level + trend")

    _line(ax, x, probs, color=COLORS["muted"], label="Observed", lw=1.6, alpha=0.65, ms=5)
    _line(ax, x, level, color=COLORS["prob"], label="Level", lw=2.6)
    _line(ax, x, forecast, color=COLORS["kalman"], label="1-step forecast", lw=2.2, ls="--", ms=5)
    _style_ax(ax, bars, ylabel="Probability")
    _percent_axis(ax)
    ax.set_ylim(_smart_prob_limits(probs, level, forecast))
    ax.legend(loc="upper right", fontsize=9)
    save_fig(fig, path)


def chart_event_study(path: Path, rel_t: np.ndarray, car: np.ndarray, event_label: str, meta: ChartMeta | None = None) -> None:
    x_labels = [f"T{int(v):+d}" for v in rel_t]
    colors = [COLORS["kalman"] if v >= 0 else COLORS["garch"] for v in car]
    fig, ax = plt.subplots(figsize=(9, 4.8))
    fig.subplots_adjust(top=0.82, bottom=0.14)
    _header(fig, meta, f"Event study — {event_label}")

    bars_plot = ax.bar(x_labels, car, color=colors, alpha=0.9, edgecolor="white", linewidth=1.2, width=0.72)
    ax.bar_label(bars_plot, labels=[f"{v:+.2%}" for v in car], padding=4, fontsize=9, fontweight="500")
    ax.axhline(0, color=COLORS["muted"], lw=1.2)
    ax.set_xlabel("Days relative to event", labelpad=8)
    ax.set_ylabel("Cumulative abnormal return", labelpad=8)
    ax.yaxis.set_major_formatter(mticker.PercentFormatter(xmax=1.0, decimals=2))
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    if len(car):
        total = car[-1]
        ax.text(
            0.99, 0.96, f"Total CAR: {total:+.2%}",
            transform=ax.transAxes, ha="right", va="top", fontsize=10, fontweight="600",
            bbox=dict(boxstyle="round,pad=0.35", fc="white", ec=COLORS["grid"]),
        )
    save_fig(fig, path)
