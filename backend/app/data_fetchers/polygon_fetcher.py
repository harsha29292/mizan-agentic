"""Polygon.io / Stooq Data Fetcher.

Fetch market data (price, volume, volatility, etc.).
Distinguishes 'primary' (Polygon direct / Dome proxy) from 'proxy' (Stooq fallback)
so downstream consumers know exactly what data path produced the numbers.
"""
import logging
from typing import Dict, Any
import httpx
import os
from datetime import date, timedelta
import math
import csv
import io

from app.response_utils import error_response, ok_response, round_float, structured_log

logger = logging.getLogger(__name__)

GATE_NAME = "Data Fetcher – Polygon"


def _extract_yes_token_id(market: dict) -> str | None:
    selected_market = market.get("selected_market") or {}
    if selected_market.get("yes_token_id"):
        return str(selected_market["yes_token_id"])

    if market.get("yes_token_id"):
        return str(market["yes_token_id"])

    side_a = market.get("side_a") or market.get("sideA") or {}
    if side_a.get("id"):
        return str(side_a["id"])

    outcomes = market.get("outcomes") or market.get("tokens") or []
    for outcome in outcomes:
        label = str(
            outcome.get("name")
            or outcome.get("label")
            or outcome.get("outcome")
            or ""
        ).strip().lower()
        if label in {"yes", "up"}:
            token_id = outcome.get("id") or outcome.get("token_id")
            if token_id:
                return str(token_id)

    return None


def _extract_no_token_id(market: dict) -> str | None:
    selected_market = market.get("selected_market") or {}
    if selected_market.get("no_token_id"):
        return str(selected_market["no_token_id"])

    if market.get("no_token_id"):
        return str(market["no_token_id"])

    side_b = market.get("side_b") or market.get("sideB") or {}
    if side_b.get("id"):
        return str(side_b["id"])

    outcomes = market.get("outcomes") or market.get("tokens") or []
    for outcome in outcomes:
        label = str(
            outcome.get("name")
            or outcome.get("label")
            or outcome.get("outcome")
            or ""
        ).strip().lower()
        if label in {"no", "down"}:
            token_id = outcome.get("id") or outcome.get("token_id")
            if token_id:
                return str(token_id)

    return None


def _market_tags(market: dict) -> list[str]:
    tags = market.get("tags", [])
    return [str(tag).lower() for tag in tags]


def _stooq_symbol(symbol: str) -> str:
    return f"{symbol.lower()}.us"


def _fetch_stooq_bars(symbol: str) -> list[dict]:
    response = httpx.get(
        "https://stooq.com/q/d/l/",
        params={"s": _stooq_symbol(symbol), "i": "d"},
        timeout=20.0,
    )
    response.raise_for_status()

    if not response.text.strip() or "No data" in response.text:
        raise RuntimeError(f"No Stooq data returned for symbol {symbol}")

    reader = csv.DictReader(io.StringIO(response.text))
    bars: list[dict] = []
    for row in reader:
        try:
            close = float(row["Close"])
            volume = int(float(row["Volume"])) if row.get("Volume") not in (None, "") else 0
        except (TypeError, ValueError, KeyError):
            continue

        bars.append({
            "d": row.get("Date"),
            "c": close,
            "v": volume,
        })

    if not bars:
        raise RuntimeError(f"Unable to parse Stooq bars for symbol {symbol}")

    return bars


def _filter_stooq_bars(stooq_bars: list[dict], start_date: date, end_date: date) -> list[dict]:
    results: list[dict] = []
    for bar in stooq_bars:
        raw_date = bar.get("d")
        if not raw_date:
            continue
        try:
            bar_date = date.fromisoformat(raw_date)
        except ValueError:
            continue
        if start_date <= bar_date <= end_date:
            results.append({"c": bar["c"], "v": bar["v"]})

    return results


def _compute_flow_metrics(bars: list[dict]) -> Dict[str, Any]:
    if len(bars) < 3:
        raise ValueError("Need at least 3 bars to compute flow signal")

    last = bars[-1]
    prev = bars[-2]
    base_bars = bars[:-1]

    avg_volume = sum(bar.get("v", 0) for bar in base_bars) / len(base_bars)
    last_volume = last.get("v", 0)
    volume_ratio = (last_volume / avg_volume) if avg_volume else 0
    volume_spike = last_volume > (avg_volume * 1.5) if avg_volume else False

    last_close = last.get("c")
    prev_close = prev.get("c")

    price_up = last_close > prev_close
    price_down = last_close < prev_close
    price_direction = "UP" if price_up else "DOWN" if price_down else "FLAT"

    flow_signal = "NEUTRAL"
    if volume_spike and price_up:
        flow_signal = "POSITIVE"
    elif volume_spike and price_down:
        flow_signal = "NEGATIVE"

    return {
        "last_price": float(last_close),
        "last_volume": int(last_volume),
        "avg_volume": int(avg_volume),
        "volume_spike": float(volume_ratio),
        "volume_spike_flag": volume_spike,
        "price_direction": price_direction,
        "flow_signal": flow_signal,
    }


def _compute_risk_metrics(bars: list[dict]) -> Dict[str, Any]:
    if len(bars) < 30:
        raise ValueError("Not enough price history to compute volatility and drawdown")

    closes = [bar.get("c") for bar in bars if bar.get("c") is not None]
    if len(closes) < 30:
        raise ValueError("Not enough valid closing prices")

    returns = []
    for idx in range(1, len(closes)):
        prev = closes[idx - 1]
        curr = closes[idx]
        if prev == 0:
            continue
        returns.append((curr - prev) / prev)

    if len(returns) < 10:
        raise ValueError("Not enough return points for volatility")

    mean_return = sum(returns) / len(returns)
    variance = sum((value - mean_return) ** 2 for value in returns) / len(returns)
    volatility_daily = math.sqrt(variance)
    volatility_annualized = volatility_daily * math.sqrt(252)

    peak = closes[0]
    max_drawdown = 0.0
    for close in closes:
        if close > peak:
            peak = close
        if peak > 0:
            drawdown = (peak - close) / peak
            max_drawdown = max(max_drawdown, drawdown)

    return {
        "volatility_daily": float(volatility_daily),
        "volatility_annualized": float(volatility_annualized),
        "max_drawdown": float(max_drawdown),
        "max_drawdown_window_trading_days": len(closes),
    }


def _correlation_index(series_a: list[float], series_b: list[float]) -> tuple[float, int, bool]:
    n = min(len(series_a), len(series_b))
    if n < 30:
        return 0.65, n, True

    a = series_a[-n:]
    b = series_b[-n:]

    mean_a = sum(a) / n
    mean_b = sum(b) / n

    cov = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b)) / n
    var_a = sum((x - mean_a) ** 2 for x in a) / n
    var_b = sum((y - mean_b) ** 2 for y in b) / n

    if var_a == 0 or var_b == 0:
        return 0.65, n, True

    corr = cov / math.sqrt(var_a * var_b)
    corr = max(-1.0, min(1.0, corr))
    return abs(float(corr)), n, False


def fetch_polygon_data(ticker: str) -> Dict[str, Any]:
    """
    Fetch market data from Polygon.io
    
    Args:
        ticker: Stock ticker symbol
        
    Returns:
        {
            "status": "OK" | "ERROR",
            "data": {
                "market_price": float,
                "last_price": float,
                "last_volume": int,
                "avg_volume": int,
                "volume_spike": float,
                "price_direction": str,
                "flow_signal": str,
                "volatility": float,
                "max_drawdown": float,
                "correlation_index": float,
                "yes_price": float (optional),
                "no_price": float (optional)
            },
            "reason": str (if ERROR)
        }
    """
    try:
        api_key = os.getenv("POLYGON_API_KEY")
        dome_key = os.getenv("DOME_API_KEY")
        dome_polygon_base = os.getenv("DOME_POLYGON_BASE_URL", "https://api.domeapi.io/v1/polygon").rstrip("/")

        inputs_used = [
            "ticker",
            "POLYGON_API_KEY|DOME_API_KEY",
            "daily bars",
            "SPY benchmark",
            "lookback_1y",
        ]

        if not api_key and not dome_key:
            return error_response(
                gate=GATE_NAME,
                code="POLYGON_API_KEY_MISSING",
                message="Neither POLYGON_API_KEY nor DOME_API_KEY is set",
                inputs_used=inputs_used,
            )

        def get_prev_close(symbol: str) -> tuple[dict, str]:
            dome_error = None
            if dome_key:
                dome_headers = {"Authorization": f"Bearer {dome_key}"}
                dome_url = f"{dome_polygon_base}/aggs/ticker/{symbol}/prev"
                response = httpx.get(dome_url, headers=dome_headers, timeout=15.0)
                if response.status_code < 400:
                    return response.json(), "DOME_POLYGON_PROXY"
                dome_error = f"Dome prev-close route failed ({response.status_code}): {dome_url}"

            if api_key:
                direct_url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/prev"
                response = httpx.get(direct_url, params={"apiKey": api_key}, timeout=15.0)
                response.raise_for_status()
                return response.json(), "POLYGON_DIRECT"

            stooq_bars = _fetch_stooq_bars(symbol)
            return {"results": [{"c": float(stooq_bars[-1]["c"])}]}, "STOOQ_FALLBACK"

        def get_range(symbol: str, start_date: date, end_date: date, limit: int = 5000) -> tuple[dict, str]:
            dome_error = None
            if dome_key:
                dome_headers = {"Authorization": f"Bearer {dome_key}"}
                dome_url = (
                    f"{dome_polygon_base}/aggs/ticker/{symbol}/range/1/day/"
                    f"{start_date.isoformat()}/{end_date.isoformat()}"
                )
                response = httpx.get(
                    dome_url,
                    headers=dome_headers,
                    params={"adjusted": "true", "sort": "asc", "limit": limit},
                    timeout=25.0,
                )
                if response.status_code < 400:
                    return response.json(), "DOME_POLYGON_PROXY"
                dome_error = f"Dome range route failed ({response.status_code}): {dome_url}"

            if api_key:
                direct_url = (
                    f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/day/"
                    f"{start_date.isoformat()}/{end_date.isoformat()}"
                )
                response = httpx.get(
                    direct_url,
                    params={"adjusted": "true", "sort": "asc", "limit": limit, "apiKey": api_key},
                    timeout=25.0,
                )
                response.raise_for_status()
                return response.json(), "POLYGON_DIRECT"

            stooq_bars = _fetch_stooq_bars(symbol)
            return {"results": _filter_stooq_bars(stooq_bars, start_date, end_date)}, "STOOQ_FALLBACK"

        # Market price from previous aggregate (n8n parity)
        prev_json, prev_source = get_prev_close(ticker)
        prev_result = (prev_json.get("results") or [{}])[0]
        market_price = prev_result.get("c")
        if market_price is None:
            return error_response(
                gate=GATE_NAME,
                code="POLYGON_PREV_CLOSE_MISSING",
                message=f"Previous close is missing for ticker {ticker}",
                inputs_used=inputs_used,
            )

        # Last ~10 trading days for flow signal
        end_flow = date.today()
        start_flow = end_flow - timedelta(days=20)
        flow_json, flow_source = get_range(ticker, start_flow, end_flow, limit=500)
        flow_bars = flow_json.get("results", [])
        flow_metrics = _compute_flow_metrics(flow_bars)

        # 1Y history for volatility and max drawdown (n8n parity)
        end_hist = date.today()
        start_hist = end_hist - timedelta(days=380)
        hist_json, hist_source = get_range(ticker, start_hist, end_hist, limit=5000)
        hist_bars = hist_json.get("results", [])
        risk_metrics = _compute_risk_metrics(hist_bars)

        # Correlation index vs SPY (required by Gate 5 contract)
        spy_json, spy_source = get_range("SPY", start_hist, end_hist, limit=5000)
        spy_bars = spy_json.get("results", [])

        closes_ticker = [bar.get("c") for bar in hist_bars if bar.get("c") is not None]
        closes_spy = [bar.get("c") for bar in spy_bars if bar.get("c") is not None]
        correlation_index, correlation_window, correlation_fallback_used = _correlation_index(closes_ticker, closes_spy)

        # Dome signal (optional; uses Dome Polymarket routes)
        yes_price = None
        no_price = None
        macro_signal = "NEUTRAL"
        auxiliary_signal_type = None
        auxiliary_signal_source = None
        dome_sentiment = None
        if dome_key:
            dome_headers = {"Authorization": f"Bearer {dome_key}"}
            market_resp = httpx.get(
                "https://api.domeapi.io/v1/polymarket/markets",
                params={"limit": 10, "search": ticker, "status": "open"},
                headers=dome_headers,
                timeout=15.0,
            )
            market_resp.raise_for_status()
            market_payload = market_resp.json()
            markets = market_payload.get("markets") or market_payload.get("data") or []

            filtered = []
            for market in markets:
                tags = _market_tags(market)
                if "up or down" in tags and any(tag in tags for tag in ["stocks", "equities", "finance"]):
                    filtered.append(market)

            if filtered:
                filtered.sort(key=lambda market: market.get("volume_total", 0), reverse=True)
                selected = filtered[0]
            elif markets:
                selected = markets[0]
            else:
                selected = None

            if selected:
                yes_token_id = _extract_yes_token_id(selected)
                no_token_id = _extract_no_token_id(selected)

                if yes_token_id:
                    price_resp = httpx.get(
                        f"https://api.domeapi.io/v1/polymarket/market-price/{yes_token_id}",
                        headers=dome_headers,
                        timeout=15.0,
                    )
                    price_resp.raise_for_status()
                    price_payload = price_resp.json()
                    yes_price = (
                        price_payload.get("price")
                        or price_payload.get("yes_price")
                        or price_payload.get("yesPrice")
                    )
                    if yes_price is not None:
                        yes_price = float(yes_price)
                if no_token_id:
                    no_resp = httpx.get(
                        f"https://api.domeapi.io/v1/polymarket/market-price/{no_token_id}",
                        headers=dome_headers,
                        timeout=15.0,
                    )
                    no_resp.raise_for_status()
                    no_payload = no_resp.json()
                    no_price = (
                        no_payload.get("price")
                        or no_payload.get("no_price")
                        or no_payload.get("noPrice")
                    )
                    if no_price is not None:
                        no_price = float(no_price)

                auxiliary_signal_type = "AUXILIARY_SIGNAL"
                auxiliary_signal_source = "DOME_POLYMARKET"
                if yes_price is not None and no_price is not None:
                    if yes_price > no_price:
                        dome_sentiment = "BULLISH"
                        macro_signal = "SUPPORTIVE"
                    elif yes_price < no_price:
                        dome_sentiment = "BEARISH"
                        macro_signal = "HOSTILE"
                    else:
                        dome_sentiment = "NEUTRAL"
                else:
                    dome_sentiment = "NEUTRAL"

        # WHY: top-level price_source lets downstream consumers / UI know exactly
        # which data path was used for the equity price.
        price_source = prev_source

        # Distinguish primary vs proxy data for auditability
        data_source_type = "PROXY" if "STOOQ" in prev_source else "PRIMARY"

        data = {
            "market_price": round_float(float(market_price), 4),
            "price_source": price_source,
            "data_source_type": data_source_type,
            "last_price": round_float(flow_metrics["last_price"], 4),
            "last_volume": flow_metrics["last_volume"],
            "avg_volume": flow_metrics["avg_volume"],
            "volume_spike": round_float(flow_metrics["volume_spike"], 6),
            "volume_spike_flag": flow_metrics["volume_spike_flag"],
            "price_direction": flow_metrics["price_direction"],
            "flow_signal": flow_metrics["flow_signal"],
            "flow_metrics_raw": {
                "last_price": round_float(flow_metrics["last_price"], 4),
                "last_volume": flow_metrics["last_volume"],
                "avg_volume": flow_metrics["avg_volume"],
                "volume_spike_ratio": round_float(flow_metrics["volume_spike"], 6),
            },
            "flow_flags": {
                "volume_spike_flag": flow_metrics["volume_spike_flag"],
                "price_direction": flow_metrics["price_direction"],
                "flow_signal": flow_metrics["flow_signal"],
            },
            "volatility": round_float(risk_metrics["volatility_annualized"], 6),
            "volatility_daily": round_float(risk_metrics["volatility_daily"], 6),
            "volatility_annualized": round_float(risk_metrics["volatility_annualized"], 6),
            "volatility_basis": "annualized_from_daily_stddev_252",
            "max_drawdown": round_float(risk_metrics["max_drawdown"], 6),
            "max_drawdown_window_trading_days": risk_metrics["max_drawdown_window_trading_days"],
            "correlation_index": round_float(correlation_index, 4),
            "correlation_benchmark": "SPY",
            "correlation_window_trading_days": correlation_window,
            "correlation_fallback_used": correlation_fallback_used,
            "yes_price": round_float(float(yes_price), 6) if yes_price is not None else None,
            "no_price": round_float(float(no_price), 6) if no_price is not None else None,
            "auxiliary_signal_type": auxiliary_signal_type,
            "auxiliary_signal_source": auxiliary_signal_source,
            "auxiliary_signal_sentiment": dome_sentiment,
            "macro_signal": macro_signal,
            "data_source": {
                "prev_close": prev_source,
                "flow_bars": flow_source,
                "history_bars": hist_source,
                "benchmark_bars": spy_source,
            },
            "units": {
                "market_price": "USD",
                "last_price": "USD",
                "volume_spike": "ratio",
                "volatility_daily": "daily_decimal",
                "volatility_annualized": "annualized_decimal",
                "max_drawdown": "decimal_peak_to_trough",
                "correlation_index": "absolute_correlation_decimal",
                "yes_price": "raw_market_price",
                "no_price": "raw_market_price",
            },
        }

        structured_log(
            logger,
            "info",
            "polygon_data_fetched",
            gate=GATE_NAME,
            ticker=ticker,
            market_price=data["market_price"],
            volatility=data["volatility"],
            max_drawdown=data["max_drawdown"],
            correlation_index=data["correlation_index"],
        )

        # Confidence depends on data source quality
        is_primary = "STOOQ" not in price_source
        poly_confidence = 90 if is_primary else 70
        if correlation_fallback_used:
            poly_confidence -= 10
        poly_one_liner = (
            f"Market data loaded for {ticker} via {price_source} — "
            f"price ${data['market_price']}, vol {data['volatility']:.2%}"
        )

        return ok_response(
            gate=GATE_NAME,
            data=data,
            inputs_used=inputs_used,
            confidence=poly_confidence,
            one_liner=poly_one_liner,
            binding_constraint="DATA_AVAILABILITY" if correlation_fallback_used else None,
        )
        
    except httpx.HTTPError as error:
        structured_log(logger, "error", "polygon_http_error", gate=GATE_NAME, ticker=ticker, error=str(error))
        return error_response(
            gate=GATE_NAME,
            code="POLYGON_FETCH_HTTP_ERROR",
            message=f"Failed to fetch Polygon data: {error}",
            inputs_used=["ticker"],
        )
    except Exception as error:
        structured_log(logger, "error", "polygon_unexpected_error", gate=GATE_NAME, ticker=ticker, error=str(error))
        return error_response(
            gate=GATE_NAME,
            code="POLYGON_INTERNAL_ERROR",
            message=f"Polygon data fetch failed: {error}",
            inputs_used=["ticker"],
        )
