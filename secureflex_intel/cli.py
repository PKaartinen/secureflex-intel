#!/usr/bin/env python3
"""
SecureFlex Intel — Unified CLI

Usage:
    sf-intel tenders              # Scan UK Contracts Finder for security tenders
    sf-intel prospects             # Find potential clients via Companies House
    sf-intel competitors           # Find security industry competitors
    sf-intel signals               # Scan for intent signals (jobs, news, crime)
    sf-intel enrich                # Enrich and score pipeline leads
    sf-intel briefs                # Generate research briefs for top leads
    sf-intel alerts                # Print Google Alerts setup guide
    sf-intel status                # Show system status and configuration

Or run as:
    python -m secureflex_intel tenders
    python -m secureflex_intel.cli tenders
"""

import sys
import os


def main():
    """Main CLI entry point dispatching to sub-commands."""
    if len(sys.argv) < 2:
        print_help()
        return

    command = sys.argv[1].lower()

    # Remove the subcommand from argv so each module's argparse works
    sys.argv = [sys.argv[0]] + sys.argv[2:]

    if command in ("tenders", "tender", "tender-radar"):
        from secureflex_intel.sources.contracts_finder import main as tender_main
        tender_main()

    elif command in ("prospects", "clients", "prospect"):
        sys.argv = [sys.argv[0], "--mode", "clients"] + sys.argv[1:]
        from secureflex_intel.sources.companies_house import main as ch_main
        ch_main()

    elif command in ("competitors", "competitor"):
        sys.argv = [sys.argv[0], "--mode", "competitors"] + sys.argv[1:]
        from secureflex_intel.sources.companies_house import main as ch_main
        ch_main()

    elif command in ("monitor",):
        sys.argv = [sys.argv[0], "--mode", "monitor-competitors"] + sys.argv[1:]
        from secureflex_intel.sources.companies_house import main as ch_main
        ch_main()

    elif command in ("signals", "signal", "scan"):
        from secureflex_intel.sources.signals import main as signals_main
        signals_main()

    elif command in ("enrich", "enrichment"):
        sys.argv = [sys.argv[0], "--score"] + sys.argv[1:]
        from secureflex_intel.sources.enrichment import main as enrich_main
        enrich_main()

    elif command in ("briefs", "brief"):
        sys.argv = [sys.argv[0], "--score", "--generate-briefs"] + sys.argv[1:]
        from secureflex_intel.sources.enrichment import main as enrich_main
        enrich_main()

    elif command in ("alerts", "google-alerts"):
        sys.argv = [sys.argv[0], "--source", "google-alerts"]
        from secureflex_intel.sources.signals import main as signals_main
        signals_main()

    elif command in ("serve", "server", "api"):
        port = 8000
        host = "0.0.0.0"
        reload_flag = False
        # Parse simple args
        remaining = sys.argv[1:]
        i = 0
        while i < len(remaining):
            if remaining[i] == "--port" and i + 1 < len(remaining):
                port = int(remaining[i + 1])
                i += 2
            elif remaining[i] == "--host" and i + 1 < len(remaining):
                host = remaining[i + 1]
                i += 2
            elif remaining[i] == "--reload":
                reload_flag = True
                i += 1
            else:
                i += 1
        from secureflex_intel.api.server import run_server
        run_server(host=host, port=port, reload=reload_flag)

    elif command in ("status", "info"):
        print_status()

    elif command in ("help", "-h", "--help"):
        print_help()

    else:
        print(f"Unknown command: {command}")
        print()
        print_help()


def print_help():
    """Print CLI help."""
    print("=" * 55)
    print("  SecureFlex Intel — Lead Intelligence Pipeline")
    print("=" * 55)
    print()
    print("Commands:")
    print()
    print("  DISCOVERY")
    print("    tenders        Scan UK Contracts Finder for security tenders")
    print("    prospects      Find potential clients via Companies House")
    print("    competitors    Find security industry competitors")
    print("    signals        Scan for intent signals (jobs, news, crime)")
    print("    alerts         Print Google Alerts setup guide")
    print()
    print("  PIPELINE")
    print("    enrich         Enrich and score pipeline leads")
    print("    briefs         Generate research briefs for top leads")
    print()
    print("  SERVER")
    print("    serve          Start the REST API server (FastAPI)")
    print("                   Options: --port 8000 --host 0.0.0.0 --reload")
    print()
    print("  SYSTEM")
    print("    status         Show system status and configuration")
    print("    help           Show this help message")
    print()
    print("Examples:")
    print("    python -m secureflex_intel tenders")
    print("    python -m secureflex_intel tenders --add-to-pipeline")
    print("    python -m secureflex_intel prospects --max-results 50")
    print("    python -m secureflex_intel signals --source jobs")
    print("    python -m secureflex_intel enrich --lead-id SEC-0001")
    print("    python -m secureflex_intel briefs --top 5")
    print()


def print_status():
    """Print current system status and configuration."""
    from secureflex_intel.config import settings

    print("=" * 55)
    print("  SecureFlex Intel — System Status")
    print("=" * 55)
    print()

    # API Keys
    ch_key = settings.companies_house_api_key
    oai_key = settings.openai_api_key
    print("API Keys:")
    print(f"  Companies House: {'✅ Configured' if ch_key else '❌ Not set'}")
    if ch_key:
        print(f"    Key: {ch_key[:8]}...{ch_key[-4:]}")
    print(f"  OpenAI:          {'✅ Configured' if oai_key else '⚪ Not set (optional)'}")
    print()

    # Paths
    print("Paths:")
    print(f"  Output dir:    {settings.output_dir}")
    print(f"  Tenders:       {settings.tenders_dir}")
    print(f"  Prospects:     {settings.prospects_dir}")
    print(f"  Signals:       {settings.signals_dir}")
    print(f"  Briefs:        {settings.briefs_dir}")
    print(f"  Pipeline CSV:  {settings.pipeline_path}")
    pipeline_exists = settings.pipeline_path.exists()
    print(f"    └── {'✅ Exists' if pipeline_exists else '⚠️  Not found'}")
    if pipeline_exists:
        import csv
        with open(settings.pipeline_path) as f:
            count = sum(1 for _ in csv.DictReader(f))
        print(f"    └── {count} leads in pipeline")
    print()

    # Settings
    print("Settings:")
    print(f"  Tender region:     {settings.tender_region}")
    print(f"  Tender days back:  {settings.tender_days_back}")
    print(f"  Prospector region: {settings.prospector_region}")
    print(f"  Max results:       {settings.prospector_max_results}")
    print()

    # Output contents
    settings.ensure_dirs()
    for name, path in [
        ("Tenders", settings.tenders_dir),
        ("Prospects", settings.prospects_dir),
        ("Signals", settings.signals_dir),
        ("Briefs", settings.briefs_dir),
    ]:
        files = list(path.glob("*")) if path.exists() else []
        files = [f for f in files if f.is_file() and f.name != ".gitkeep"]
        print(f"  {name}: {len(files)} files")
    print()


if __name__ == "__main__":
    main()
