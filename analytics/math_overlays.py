"""
Exploratory math overlays on one Kalshi probability series.

Formulas and constants match docs/MATH-PRD.md. Parameters are fixed illustration
values — not estimated from market data.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np

# ── Kalman (§1) ──────────────────────────────────────────────────────────────
KALMAN_Q = 0.005
KALMAN_R = 0.1
KALMAN_P0 = 1.0

# ── HMM / Viterbi (§2) ───────────────────────────────────────────────────────
HMM_MU = np.array([-0.003, 0.0005, 0.003])
HMM_SIGMA = np.array([0.025, 0.012, 0.02])
HMM_A = np.array([[0.92, 0.05, 0.03], [0.04, 0.94, 0.02], [0.03, 0.05, 0.92]])
HMM_PI = np.array([0.25, 0.5, 0.25])
HMM_STATE_LABELS = ("Bear", "Neutral", "Bull")

# ── GARCH(1,1) (§3) ──────────────────────────────────────────────────────────
GARCH_OMEGA = 1e-5
GARCH_ALPHA = 0.09
GARCH_BETA = 0.90
GARCH_INIT_WINDOW = 20
GARCH_ANN_FACTOR = math.sqrt(252)

# ── Hawkes (§4) ──────────────────────────────────────────────────────────────
HAWKES_MU = 0.3
HAWKES_ALPHA = 0.6
HAWKES_BETA = 1.2

# ── Bayesian (§5) ────────────────────────────────────────────────────────────
BAYES_PRIOR = 0.5
BAYES_RETURN_SCALE = 10.0
BAYES_L_CLIP = (0.1, 0.9)
BAYES_EVIDENCE = 0.5
BAYES_EPS = 0.001
BAYES_POST_CLIP = (0.01, 0.99)

# ── Change-point (§6) ────────────────────────────────────────────────────────
CP_WINDOW = 10
CP_THRESHOLD = 2.5
CP_MIN_GAP = 5
CP_STD_EPS = 1e-3

# ── Holt-style level + trend (§7) ──────────────────────────────────────────────
SSM_ALPHA_LEVEL = 0.3
SSM_ALPHA_TREND = 0.1

# ── Event study (§8) ─────────────────────────────────────────────────────────
ES_EST_START = 60
ES_EST_END = 10
ES_DEFAULT_WINDOW = 10


def price_from_prob(probs: np.ndarray) -> np.ndarray:
    """Synthetic price track P_t ≈ 100 × p_t (MATH-PRD §0)."""
    return probs * 100.0


def simple_returns(prices: np.ndarray) -> np.ndarray:
    """r_t = (P_t - P_{t-1}) / P_{t-1} (MATH-PRD §0)."""
    if len(prices) < 2:
        return np.array([])
    return np.diff(prices) / prices[:-1]


def run_kalman(
    obs: np.ndarray,
    q: float = KALMAN_Q,
    r: float = KALMAN_R,
    p0: float = KALMAN_P0,
) -> np.ndarray:
    """Random-walk Kalman smoother on probability observations (MATH-PRD §1)."""
    if len(obs) == 0:
        return np.array([])
    x = float(obs[0])
    p = p0
    out: list[float] = []
    for z in obs:
        x_pred, p_pred = x, p + q
        k = p_pred / (p_pred + r)
        x = x_pred + k * (float(z) - x_pred)
        p = (1 - k) * p_pred
        out.append(x)
    return np.array(out)


def _log_gauss(x: float, m: float, s: float) -> float:
    return -0.5 * ((x - m) / s) ** 2 - math.log(s * math.sqrt(2 * math.pi))


KALMAN_REGIME_THRESHOLD = 0.02
MIN_BARS_FOR_HMM = 30


def regime_kalman_3day(kalman: np.ndarray, threshold: float = KALMAN_REGIME_THRESHOLD) -> np.ndarray:
    """Demo regime: compare Kalman-smoothed YES today vs 3 days ago (CHART-PRD §3)."""
    n = len(kalman)
    path = np.ones(n, dtype=int)
    for i in range(n):
        j = max(0, i - 3)
        delta = float(kalman[i] - kalman[j])
        if delta > threshold:
            path[i] = 2
        elif delta < -threshold:
            path[i] = 0
    return path


def align_hmm_to_bars(hmm_returns_path: np.ndarray, n_bars: int) -> np.ndarray:
    """Pad HMM path (len returns) to bar count for regime bands."""
    if n_bars <= 0:
        return np.array([], dtype=int)
    if len(hmm_returns_path) == 0:
        return np.ones(n_bars, dtype=int)
    out = np.ones(n_bars, dtype=int)
    out[0] = int(hmm_returns_path[0])
    for i in range(1, n_bars):
        idx = min(i - 1, len(hmm_returns_path) - 1)
        out[i] = int(hmm_returns_path[idx])
    return out


def resolve_regime_path(
    probs: np.ndarray,
    prices: np.ndarray,
    *,
    use_hmm: bool = False,
) -> tuple[np.ndarray, str]:
    """Return (per-bar regime indices, engine label: 'demo' | 'hmm')."""
    kalman = run_kalman(probs)
    if use_hmm and len(probs) >= MIN_BARS_FOR_HMM:
        hmm_r = run_hmm(prices)
        return align_hmm_to_bars(hmm_r, len(probs)), "hmm"
    return regime_kalman_3day(kalman), "demo"


def hawkes_shock_times(returns: np.ndarray, n_bars: int) -> list[int]:
    """Large |r_t| days as Hawkes excitation (decoupled from macro calendar)."""
    if len(returns) < 2:
        return []
    abs_r = np.abs(returns)
    thresh = float(np.percentile(abs_r, 75))
    if thresh <= 0:
        thresh = float(np.median(abs_r)) or 0.001
    return [i + 1 for i, r in enumerate(returns) if abs(r) >= thresh and i + 1 < n_bars]


def run_hmm(
    prices: np.ndarray,
    mu: np.ndarray = HMM_MU,
    sigma: np.ndarray = HMM_SIGMA,
    transition: np.ndarray = HMM_A,
    initial: np.ndarray = HMM_PI,
) -> np.ndarray:
    """3-state HMM decoded with Viterbi on price returns (MATH-PRD §2)."""
    n = len(prices)
    if n < 3:
        return np.zeros(max(0, n - 1), dtype=int)
    returns = simple_returns(prices)
    states_n = len(mu)
    T = len(returns)
    delta = np.full((T, states_n), -1e30)
    psi = np.zeros((T, states_n), dtype=int)
    for s in range(states_n):
        delta[0, s] = math.log(initial[s] + 1e-10) + _log_gauss(returns[0], mu[s], sigma[s])
    for t in range(1, T):
        for s in range(states_n):
            best = -1e30
            best_p = 0
            for prev in range(states_n):
                val = delta[t - 1, prev] + math.log(transition[prev, s] + 1e-10)
                if val > best:
                    best = val
                    best_p = prev
            delta[t, s] = best + _log_gauss(returns[t], mu[s], sigma[s])
            psi[t, s] = best_p
    path = np.zeros(T, dtype=int)
    path[T - 1] = int(np.argmax(delta[T - 1]))
    for t in range(T - 2, -1, -1):
        path[t] = psi[t + 1, path[t + 1]]
    return path


def garch_model(
    returns: np.ndarray,
    omega: float = GARCH_OMEGA,
    alpha_g: float = GARCH_ALPHA,
    beta_g: float = GARCH_BETA,
) -> np.ndarray:
    """GARCH(1,1) annualized volatility on returns (MATH-PRD §3)."""
    if len(returns) == 0:
        return np.array([])
    init_n = min(GARCH_INIT_WINDOW, len(returns))
    sigma2 = float(np.mean(returns[:init_n] ** 2))
    sigmas: list[float] = []
    for r in returns:
        sigma2 = omega + alpha_g * r * r + beta_g * sigma2
        sigmas.append(math.sqrt(max(0.0, sigma2)) * GARCH_ANN_FACTOR)
    return np.array(sigmas)


def hawkes_intensity(
    event_times: Sequence[int],
    T: int,
    mu: float = HAWKES_MU,
    alpha: float = HAWKES_ALPHA,
    beta: float = HAWKES_BETA,
) -> np.ndarray:
    """Self-exciting intensity λ(t) from macro event indices (MATH-PRD §4)."""
    grid = np.zeros(T)
    for t in range(T):
        lam = mu
        for te in event_times:
            if te < t:
                lam += alpha * math.exp(-beta * (t - te))
        grid[t] = max(0.0, lam)
    return grid


def likelihood_from_returns(returns: np.ndarray) -> np.ndarray:
    """Heuristic L_t = clip(0.5 + 10 r_t, 0.1, 0.9) (MATH-PRD §5)."""
    if len(returns) == 0:
        return np.array([0.5])
    lo, hi = BAYES_L_CLIP
    return np.clip(BAYES_PRIOR + BAYES_RETURN_SCALE * returns, lo, hi)


def bayesian_update(
    prior: float,
    likelihoods: np.ndarray,
    evidence: np.ndarray | None = None,
) -> np.ndarray:
    """Sequential belief path (MATH-PRD §5)."""
    if evidence is None:
        evidence = np.full_like(likelihoods, BAYES_EVIDENCE)
    posteriors = [prior]
    current = prior
    lo, hi = BAYES_POST_CLIP
    for i in range(len(likelihoods)):
        L = float(likelihoods[i])
        E = float(evidence[i])
        post = (current * L) / (current * L + (1 - current) * (1 - L) * E + BAYES_EPS)
        current = max(lo, min(hi, post))
        posteriors.append(current)
    return np.array(posteriors)


def detect_change_points(
    series: np.ndarray,
    threshold: float = CP_THRESHOLD,
    window: int = CP_WINDOW,
    min_gap: int = CP_MIN_GAP,
) -> list[int]:
    """Fixed-window mean shift detector on p_t (MATH-PRD §6)."""
    points: list[int] = []
    for i in range(window, len(series) - window):
        before = series[i - window : i]
        after = series[i : i + window]
        mb, ma = before.mean(), after.mean()
        sb = before.std() + CP_STD_EPS
        if abs(ma - mb) / sb > threshold:
            if not points or i - points[-1] > min_gap:
                points.append(i)
    return points


def state_space_model(
    obs: np.ndarray,
    alpha_l: float = SSM_ALPHA_LEVEL,
    alpha_t: float = SSM_ALPHA_TREND,
) -> tuple[np.ndarray, np.ndarray]:
    """Holt-style level + trend on probability (MATH-PRD §7)."""
    level = float(obs[0])
    trend = 0.0
    levels: list[float] = []
    forecasts: list[float] = []
    for o in obs:
        prev = level
        level = alpha_l * o + (1 - alpha_l) * (level + trend)
        trend = alpha_t * (level - prev) + (1 - alpha_t) * trend
        levels.append(level)
        forecasts.append(level + trend)
    return np.array(levels), np.array(forecasts)


def event_study(
    returns: np.ndarray,
    event_idx: int,
    window: int = ES_DEFAULT_WINDOW,
) -> tuple[np.ndarray, np.ndarray]:
    """Abnormal returns and CAR around event index (MATH-PRD §8)."""
    if len(returns) == 0 or event_idx < window:
        return np.array([]), np.array([])
    est = returns[max(0, event_idx - ES_EST_START) : event_idx - ES_EST_END]
    normal = est.mean() if len(est) else 0.0
    lo = max(0, event_idx - window)
    hi = min(len(returns), event_idx + window)
    ar = returns[lo:hi] - normal
    car = np.cumsum(ar)
    rel_t = np.arange(-window, -window + len(ar))
    return rel_t[: len(ar)], car


def pick_event_study_index(
    bars: Sequence[object],
    *,
    prefer_news: bool = True,
) -> int:
    """
    Return bar index for event study: first high-impact news/fed day if present,
    else middle of sample (MATH-PRD §8).
    """
    if not bars:
        return 0
    if prefer_news:
        for b in bars:
            if getattr(b, "is_news_day", False) or getattr(b, "is_fed_day", False):
                return max(1, int(getattr(b, "t", 0)))
    return max(ES_DEFAULT_WINDOW, len(bars) // 2)
