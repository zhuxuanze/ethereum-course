"""Reproduce exact fee arithmetic from the saved official Etherscan HTML."""

from decimal import Decimal, ROUND_HALF_UP, localcontext
from hashlib import sha256
from pathlib import Path
import json
import re


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence"


def span_text(html, element_id):
    match = re.search(
        rf'<span\b[^>]*\bid=[\'"]{re.escape(element_id)}[\'"][^>]*>(.*?)</span>',
        html,
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise ValueError(f"Missing Etherscan quote field: {element_id}")
    value = re.sub(r"<[^>]+>", "", match.group(1)).strip()
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", value):
        raise ValueError(f"Invalid Etherscan decimal field {element_id}: {value!r}")
    return value


def main():
    html_bytes = (EVIDENCE / "etherscan-gas-tracker.html").read_bytes()
    html = html_bytes.decode("utf-8")
    capture = json.loads((EVIDENCE / "etherscan-gas-tracker-fetch.json").read_text())
    standard = span_text(html, "spanLowPrice")
    average = span_text(html, "spanAvgPrice")
    ether_match = re.search(
        r'<a\b[^>]*href=[\'"]/chart/etherprice[\'"][^>]*>\$([0-9,]+\.[0-9]+)</a>', html
    )
    if not ether_match:
        raise ValueError("Missing Etherscan ETH/USD header quote")
    ether_usd = ether_match.group(1).replace(",", "")
    internal_price = re.search(r"var lastCryptoCompareUsdPrice = '([0-9.]+)'", html)
    if not internal_price or Decimal(internal_price.group(1)) != Decimal(ether_usd):
        raise ValueError("Header ETH/USD price disagrees with the page's numeric value")
    remix = json.loads((EVIDENCE / "remix-results.json").read_text())
    remix_gas = int(remix["firstPut"]["gasUsed"])
    if remix_gas != 758364 or remix["firstPut"]["status"] != 1:
        raise ValueError("The confirmed Remix first-put receipt is missing or has changed")

    def calculate(gas):
        with localcontext() as context:
            context.prec = 60
            eth_cost = Decimal(gas) * Decimal(standard) * Decimal("0.000000001")
            usd_cost = eth_cost * Decimal(ether_usd)
            return {
                "gasUsed": gas,
                "gasPriceGwei": standard,
                "gasPriceWei": format(Decimal(standard) * Decimal(1000000000), "f"),
                "ethUsd": ether_usd,
                "costEthExact": format(eth_cost, "f"),
                "costUsdExact": format(usd_cost, "f"),
                "costUsdRounded8dp": format(usd_cost.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP), "f"),
                "formula": "gasUsed * gasPriceGwei * 10^-9 * ethUsd",
                "arithmetic": "Python decimal.Decimal; no binary floating-point arithmetic",
            }

    result = {
        "schemaVersion": 1,
        "source": {
            **capture,
            "title": "Ethereum Gas Tracker | Etherscan",
            "network": "Ethereum mainnet",
            "htmlFile": "evidence/etherscan-gas-tracker.html",
            "fetchMetadataFile": "evidence/etherscan-gas-tracker-fetch.json",
            "htmlSha256": sha256(html_bytes).hexdigest(),
            "captureMethod": "Direct HTTPS GET of the public official page; browser-search fetch returned HTTP 403, direct HTTPS returned 200.",
        },
        "quote": {
            "standardGwei": standard,
            "averageGwei": average,
            "averageCardDisplayedLabel": "Fast",
            "ethUsd": ether_usd,
            "selectedTier": "Standard",
            "selectedGasPriceGwei": standard,
            "extraction": {
                "standard": "span#spanLowPrice in the Standard card",
                "average": "span#spanAvgPrice (page avgPrice / averageGas value, in the Fast card)",
                "ethUsd": "ETH Price header link /chart/etherprice; cross-checked against lastCryptoCompareUsdPrice",
            },
        },
        "calculations": {
            "sstoreOnlyEstimate": {
                **calculate(640000),
                "assumption": "32 payload slots * 20,000 gas per zero-to-nonzero SSTORE under the assignment's historical simplified model; excludes the array length and every other cost.",
            },
            "remixFirstPutEquivalent": {
                **calculate(remix_gas),
                "gasEvidenceFile": "evidence/remix-results.json",
                "gasEvidenceField": "firstPut.gasUsed",
                "remixTransactionHash": remix["firstPut"]["transactionHash"],
                "measurementEnvironment": f"{remix['environment']} ({remix['hardfork']})",
                "interpretation": "Mainnet-equivalent USD estimate at the captured Etherscan quote; not actual spending on Remix or the Sepolia testnet.",
            },
        },
        "notes": [
            "All price and money values are decimal strings; timestamps are UTC as requested.",
            "The timestamp is when this HTML quote was retrieved, not an invented Etherscan market tick timestamp.",
            "Gas and ETH/USD prices fluctuate; these are the values in the preserved source snapshot.",
            "The historical 640,000-gas calculation follows the question's simplifying assumption; it is not a universal current SSTORE schedule.",
        ],
    }
    (EVIDENCE / "gas-quote.json").write_text(json.dumps(result, indent=2) + "\n")
    summary = (
        f"Official source: {capture['sourceUrl']}\n"
        f"Retrieved at UTC: {capture['retrievedAtUtc']}\n"
        f"HTTP Date: {capture['httpDate']}\n"
        f"Standard gas: {standard} gwei\n"
        f"Average/page avgPrice (displayed Fast): {average} gwei\n"
        f"ETH/USD: {ether_usd}\n"
        f"640000 gas: {result['calculations']['sstoreOnlyEstimate']['costEthExact']} ETH; "
        f"USD {result['calculations']['sstoreOnlyEstimate']['costUsdExact']}\n"
        f"{remix_gas} gas: {result['calculations']['remixFirstPutEquivalent']['costEthExact']} ETH; "
        f"USD {result['calculations']['remixFirstPutEquivalent']['costUsdExact']}\n"
        "These are hypothetical mainnet-equivalent costs, not actual test-network spending.\n"
    )
    (EVIDENCE / "gas-quote-source.txt").write_text(summary)
    print(summary)


if __name__ == "__main__":
    main()
