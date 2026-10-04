# QuantNexus — interactive demo

**Designed and built by Arpit Jain.** © 2026 Arpit Jain. All rights reserved — see [LICENSE](LICENSE).

A read-only, interactive snapshot of **QuantNexus**, a private algorithmic-trading research
platform for Indian equities and F&O: an LLM-assisted agent pipeline
(Sentinel scan → Research → Investment Committee → Execution → Monitoring) that trades
**paper only**.

**Live demo:** https://quantnexus-demo.netlify.app

## What you are looking at

- **Real data, frozen in time.** Every number was captured from the running system on the date
  shown in the yellow chip. Nothing is generated for the demo, and nothing updates.
- **Interactive.** All tabs, charts, filters, the 34-criterion Sentinel screener and the
  light/dark theme work. Actions that need the private backend (new scans with live prices, the
  LLM committee, admin) say *"Disabled in the demo"* rather than pretending.
- **Want to see it live?** Use *Request a live walkthrough* in the chip.

## Design principles visible in the dashboard

- **Python computes, the LLM interprets.** Models choose among Python-computed options; they
  never emit a price level, stop or size.
- **Absence is shown, never filled in.** Missing data is labelled as missing, not shown as zero,
  and synthetic data is always badged.
- **Results are pre-registered.** The Research tab publishes failed hypotheses alongside the one
  that passed.

## How this repo is built

This repo contains only generated, scrubbed output: `index.html` (the dashboard, pointed at a
local shim), `shim.js` (serves `data/` instead of an API) and `data/` (the snapshot). The source
system is private. Before publishing, every file is scanned for credentials and personal data,
and the build stops if anything is found.
