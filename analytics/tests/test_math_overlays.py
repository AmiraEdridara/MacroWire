"""Unit tests for docs/MATH-PRD.md formulas (synthetic data, no network)."""

from __future__ import annotations

import math

import numpy as np

from math_overlays import (
    BAYES_EPS,
    BAYES_PRIOR,
    CP_THRESHOLD,
    CP_WINDOW,
    GARCH_ALPHA,
    GARCH_ANN_FACTOR,
    GARCH_BETA,
    GARCH_OMEGA,
    HAWKES_ALPHA,
    HAWKES_BETA,
    HAWKES_MU,
    KALMAN_P0,
    KALMAN_Q,
    KALMAN_R,
    bayesian_update,
    detect_change_points,
    event_study,
    garch_model,
    hawkes_intensity,
    likelihood_from_returns,
    price_from_prob,
    run_kalman,
    simple_returns,
    state_space_model,
)


def test_price_and_returns():
    probs = np.array([0.2, 0.25, 0.22])
    prices = price_from_prob(probs)
    assert np.allclose(prices, [20.0, 25.0, 22.0])
    rets = simple_returns(prices)
    assert len(rets) == 2
    assert np.isclose(rets[0], (25.0 - 20.0) / 20.0)


def test_kalman_first_step():
    obs = np.array([0.5, 0.52])
    out = run_kalman(obs)
    # Step 0
    p_pred0 = KALMAN_P0 + KALMAN_Q
    k0 = p_pred0 / (p_pred0 + KALMAN_R)
    x0 = 0.5 + k0 * (0.5 - 0.5)
    # Step 1
    p_pred1 = (1 - k0) * p_pred0 + KALMAN_Q
    k1 = p_pred1 / (p_pred1 + KALMAN_R)
    expected_1 = x0 + k1 * (0.52 - x0)
    assert np.isclose(out[1], expected_1)


def test_garch_recursion():
    returns = np.array([0.01, -0.02, 0.015])
    vol = garch_model(returns)
    sigma2_0 = float(np.mean(returns ** 2))
    sigma2_1 = GARCH_OMEGA + GARCH_ALPHA * returns[0] ** 2 + GARCH_BETA * sigma2_0
    assert np.isclose(vol[0], math.sqrt(max(0.0, sigma2_1)) * GARCH_ANN_FACTOR)
    sigma2_2 = GARCH_OMEGA + GARCH_ALPHA * returns[1] ** 2 + GARCH_BETA * sigma2_1
    assert np.isclose(vol[1], math.sqrt(max(0.0, sigma2_2)) * GARCH_ANN_FACTOR)


def test_hawkes_baseline_without_events():
    lam = hawkes_intensity([], 3)
    assert np.allclose(lam, HAWKES_MU)


def test_hawkes_excitation_after_event():
    lam = hawkes_intensity([0], 3)
    assert lam[0] == HAWKES_MU
    assert lam[1] == HAWKES_MU + HAWKES_ALPHA * math.exp(-HAWKES_BETA * 1)
    assert lam[2] == HAWKES_MU + HAWKES_ALPHA * math.exp(-HAWKES_BETA * 2)
    assert lam[1] > lam[0]
    assert lam[2] < lam[1]


def test_bayesian_update_step():
    lik = np.array([0.7])
    post = bayesian_update(BAYES_PRIOR, lik)
    L, E = 0.7, 0.5
    expected = (BAYES_PRIOR * L) / (BAYES_PRIOR * L + (1 - BAYES_PRIOR) * (1 - L) * E + BAYES_EPS)
    assert np.isclose(post[1], max(0.01, min(0.99, expected)))


def test_likelihood_clip():
    lik = likelihood_from_returns(np.array([0.05, -0.05]))
    assert lik[0] == 0.9
    assert lik[1] == 0.1


def test_change_point_flags_shift():
    series = np.concatenate([np.full(15, 0.2), np.full(15, 0.8)])
    points = detect_change_points(series, threshold=CP_THRESHOLD, window=CP_WINDOW)
    assert any(9 <= p <= 16 for p in points)


def test_state_space_level_trend():
    obs = np.array([0.5, 0.52, 0.54])
    levels, fc = state_space_model(obs)
    assert len(levels) == 3
    assert len(fc) == 3
    assert levels[-1] != obs[-1] or fc[-1] != obs[-1]


def test_event_study_car_sums_ar():
    returns = np.linspace(0.001, 0.01, 50)
    _, car = event_study(returns, event_idx=30, window=5)
    assert len(car) == 10
    est = returns[max(0, 30 - 60) : 30 - 10]
    normal = est.mean()
    ar = returns[25:35] - normal
    assert np.allclose(car, np.cumsum(ar))
