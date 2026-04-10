"""
Companies House Events Source — Real-Time Company Event Monitoring

Monitors company events (director changes, filings, insolvencies) for
watched companies (competitors + prospects) using the Companies House
REST API with a polling approach.

Uses the same COMPANIES_HOUSE_API_KEY already in the environment.

Endpoints used:
  GET /company/{number}/filing-history  — recent filings
  GET /company/{number}/officers        — current officers
  GET /company/{number}/insolvency      — insolvency cases

Rate limiting: CH API = 600 req/5min.
  Process in batches of 100, 5-second delay between batches.
"""

import json
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional

# ── Constants ────────────────────────────────────────────────────────────────

# Filing types that generate signals
SIGNIFICANT_FILING_TYPES = {
    "AA": "Annual Accounts",
    "AR01": "Annual Return / Confirmation Statement",
    "CS01": "Confirmation Statement",
    "AP01": "Appointment of Director",
    "AP02": "Appointment of Secretary",
    "TM01": "Termination of Director",
    "TM02": "Termination of Secretary",
    "CH01": "Change of Director Details",
    "AD01": "Change of Registered Office",
    "SH01": "Allotment of Shares",
    "LRESEX": "Resolution for Voluntary Winding Up",
    "LIQEN": "Liquidator Appointed",
    "600": "Voluntary Arrangement",
    "NEWINC": "Incorporation",
}

# Insolvency case types
INSOLVENCY_TYPES = {
    "compulsory-liquidation": "Compulsory Liquidation",
    "creditors-voluntary-liquidation": "Creditors' Voluntary Liquidation",
    "members-voluntary-liquidation": "Members' Voluntary Liquidation",
    "administration": "Administration",
    "administrative-receiver": "Administrative Receiver",
    "voluntary-arrangement": "Voluntary Arrangement",
    "company-voluntary-arrangement": "Company Voluntary Arrangement",
    "receiver-manager": "Receiver Manager",
}

# Batch processing settings
BATCH_SIZE = 100
BATCH_DELAY_SECONDS = 5
REQUEST_DELAY_SECONDS = 0.6  # ~100 req/min, well within 600/5min


# ── Companies House API Helpers ──────────────────────────────────────────────

def _ch_request(endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
    """Make an authenticated request to the Companies House API."""
    try:
        from secureflex_intel.sources.companies_house import ch_request
        return ch_request(endpoint, params)
    except ImportError:
        print("[CH Events] companies_house module not available")
        return None


# ── CH Events Client ─────────────────────────────────────────────────────────

class CHEventsClient:
    """Client for monitoring Companies House events on watched companies."""

    def __init__(self):
        self._request_count = 0
        self._batch_start = time.time()

    def _rate_limit(self):
        """Enforce rate limiting: 600 req/5min."""
        self._request_count += 1
        if self._request_count % BATCH_SIZE == 0:
            elapsed = time.time() - self._batch_start
            if elapsed < BATCH_DELAY_SECONDS:
                time.sleep(BATCH_DELAY_SECONDS - elapsed)
            self._batch_start = time.time()
            print(f"[CH Events] Processed {self._request_count} requests — batch pause")
        else:
            time.sleep(REQUEST_DELAY_SECONDS)

    def check_company_events(self, company_number: str,
                              company_name: str = "",
                              is_competitor: bool = False,
                              is_acs_verified: bool = False) -> List[Dict]:
        """
        Check a single company for recent events.
        Returns a list of event dicts.
        """
        events = []

        # 1. Check recent filings (last 24 hours)
        filing_events = self._check_filings(company_number, company_name,
                                             is_competitor)
        events.extend(filing_events)
        self._rate_limit()

        # 2. Check insolvency
        insolvency_events = self._check_insolvency(company_number, company_name)
        events.extend(insolvency_events)
        self._rate_limit()

        # 3. Check officers for recent changes
        officer_events = self._check_officers(company_number, company_name,
                                               is_competitor)
        events.extend(officer_events)
        self._rate_limit()

        return events

    def _check_filings(self, company_number: str, company_name: str,
                        is_competitor: bool) -> List[Dict]:
        """Check for new filings in the last 24 hours."""
        events = []
        data = _ch_request(f"/company/{company_number}/filing-history",
                           {"items_per_page": "10"})
        if not data or not data.get("items"):
            return events

        cutoff = datetime.utcnow() - timedelta(hours=24)

        for item in data["items"]:
            date_str = item.get("date", "")
            try:
                filing_date = datetime.strptime(date_str, "%Y-%m-%d")
            except (ValueError, TypeError):
                continue

            if filing_date < cutoff:
                continue

            filing_type = item.get("type", "")
            description = item.get("description", "")
            category = item.get("category", "")

            # Determine score based on filing type
            score = 30  # Default for any recent filing
            signal_type = "company_event"

            if filing_type in ("TM01", "AP01", "CH01"):
                score = 40  # Director change
                signal_type = "company_event"
            elif category == "insolvency" or "liquidat" in description.lower():
                score = 85
                signal_type = "company_insolvency"
            elif filing_type == "AA":
                score = 30  # Accounts filed
                if is_competitor:
                    description += " (check for revenue data)"

            filing_label = SIGNIFICANT_FILING_TYPES.get(filing_type, filing_type)
            link = f"https://find-and-update.company-information.service.gov.uk/company/{company_number}/filing-history"

            events.append({
                "company_number": company_number,
                "company_name": company_name,
                "event_type": "filing",
                "filing_type": filing_type,
                "filing_label": filing_label,
                "date": date_str,
                "description": description,
                "score": score,
                "signal_type": signal_type,
                "link": link,
            })

        return events

    def _check_insolvency(self, company_number: str,
                           company_name: str) -> List[Dict]:
        """Check for insolvency cases."""
        events = []
        data = _ch_request(f"/company/{company_number}/insolvency")
        if not data:
            return events

        cases = data.get("items", [])
        if not cases:
            return events

        for case in cases:
            case_type = case.get("type", "")
            case_label = INSOLVENCY_TYPES.get(case_type, case_type)
            dates = case.get("dates", [])

            # Get most recent date
            latest_date = ""
            for d in dates:
                date_val = d.get("date", "")
                if date_val > latest_date:
                    latest_date = date_val

            status = case.get("status", "")
            link = f"https://find-and-update.company-information.service.gov.uk/company/{company_number}/insolvency"

            events.append({
                "company_number": company_number,
                "company_name": company_name,
                "event_type": "insolvency",
                "insolvency_type": case_label,
                "date": latest_date,
                "description": f"{case_label} — Status: {status}",
                "score": 85,
                "signal_type": "company_insolvency",
                "link": link,
            })

        return events

    def _check_officers(self, company_number: str, company_name: str,
                         is_competitor: bool) -> List[Dict]:
        """Check for recent officer (director) changes."""
        events = []
        data = _ch_request(f"/company/{company_number}/officers",
                           {"items_per_page": "20"})
        if not data or not data.get("items"):
            return events

        cutoff = datetime.utcnow() - timedelta(hours=48)

        for officer in data["items"]:
            appointed = officer.get("appointed_on", "")
            resigned = officer.get("resigned_on", "")
            name = officer.get("name", "")
            role = officer.get("officer_role", "")

            # Check for recent appointments
            if appointed:
                try:
                    appt_date = datetime.strptime(appointed, "%Y-%m-%d")
                    if appt_date >= cutoff:
                        score = 40 if not is_competitor else 35
                        link = f"https://find-and-update.company-information.service.gov.uk/company/{company_number}/officers"
                        events.append({
                            "company_number": company_number,
                            "company_name": company_name,
                            "event_type": "officer_appointed",
                            "officer_name": name,
                            "officer_role": role,
                            "date": appointed,
                            "description": f"New {role}: {name} appointed at {company_name}",
                            "score": score,
                            "signal_type": "company_event",
                            "link": link,
                        })
                except (ValueError, TypeError):
                    pass

            # Check for recent resignations
            if resigned:
                try:
                    res_date = datetime.strptime(resigned, "%Y-%m-%d")
                    if res_date >= cutoff:
                        score = 45 if is_competitor else 35
                        link = f"https://find-and-update.company-information.service.gov.uk/company/{company_number}/officers"
                        events.append({
                            "company_number": company_number,
                            "company_name": company_name,
                            "event_type": "officer_resigned",
                            "officer_name": name,
                            "officer_role": role,
                            "date": resigned,
                            "description": f"{role} {name} resigned from {company_name}",
                            "score": score,
                            "signal_type": "company_event",
                            "link": link,
                        })
                except (ValueError, TypeError):
                    pass

        return events

    def check_all_watched_companies(self) -> List[Dict]:
        """
        Iterate all competitors + prospects in the DB and check for events.
        Returns a list of all events found.
        """
        try:
            from secureflex_intel.db import (
                db_available, get_engine, competitors_table, prospects_table
            )
            from sqlalchemy import select
            if not db_available():
                print("[CH Events] Database not available")
                return []
        except ImportError:
            print("[CH Events] DB module not available")
            return []

        engine = get_engine()
        all_events = []

        # Load competitors
        competitors = []
        try:
            with engine.connect() as conn:
                for row in conn.execute(select(competitors_table)):
                    r = dict(row._mapping)
                    cn = r.get("company_number", "")
                    # Skip placeholder ACS- numbers
                    if cn and not cn.startswith("ACS-"):
                        competitors.append(r)
        except Exception as e:
            print(f"[CH Events] Error loading competitors: {e}")

        # Load prospects
        prospects = []
        try:
            with engine.connect() as conn:
                for row in conn.execute(select(prospects_table)):
                    r = dict(row._mapping)
                    cn = r.get("company_number", "")
                    if cn:
                        prospects.append(r)
        except Exception as e:
            print(f"[CH Events] Error loading prospects: {e}")

        total = len(competitors) + len(prospects)
        print(f"[CH Events] Checking events for {len(competitors)} competitors "
              f"+ {len(prospects)} prospects = {total} companies")

        # Process competitors
        for i, comp in enumerate(competitors):
            cn = comp["company_number"]
            name = comp.get("company_name", cn)
            is_acs = comp.get("acs_verified", False)
            try:
                events = self.check_company_events(
                    cn, name, is_competitor=True, is_acs_verified=is_acs
                )
                all_events.extend(events)
            except Exception as e:
                print(f"[CH Events] Error checking competitor {cn}: {e}")

            if (i + 1) % 50 == 0:
                print(f"[CH Events] Checked {i + 1}/{len(competitors)} competitors")

        # Process prospects
        for i, prospect in enumerate(prospects):
            cn = prospect["company_number"]
            name = prospect.get("company_name", cn)
            try:
                events = self.check_company_events(
                    cn, name, is_competitor=False, is_acs_verified=False
                )
                all_events.extend(events)
            except Exception as e:
                print(f"[CH Events] Error checking prospect {cn}: {e}")

            if (i + 1) % 50 == 0:
                print(f"[CH Events] Checked {i + 1}/{len(prospects)} prospects")

        print(f"[CH Events] Found {len(all_events)} events across {total} companies")
        return all_events


# ── Signal Generation & Persistence ──────────────────────────────────────────

def events_to_signals(events: List[Dict]) -> List[Dict]:
    """Convert raw CH events into signal rows for the signals table."""
    signals = []
    seen_links = set()

    for event in events:
        link = event.get("link", "")
        # Make link unique per event
        unique_key = f"{link}#{event.get('company_number', '')}#{event.get('event_type', '')}#{event.get('date', '')}"

        if unique_key in seen_links:
            continue
        seen_links.add(unique_key)

        company_name = event.get("company_name", "Unknown")
        event_type = event.get("event_type", "")
        score = event.get("score", 30)
        signal_type = event.get("signal_type", "company_event")

        # Build title
        if event_type == "insolvency":
            title = f"\U0001f534 INSOLVENCY: {company_name}"
            signal_category = "hot"
        elif event_type == "officer_appointed":
            title = f"\U0001f7e2 New Director at {company_name}"
            signal_category = "warm" if score >= 40 else "monitor"
        elif event_type == "officer_resigned":
            title = f"\U0001f7e1 Director Resigned at {company_name}"
            signal_category = "warm"
        elif event_type == "filing":
            filing_label = event.get("filing_label", event.get("filing_type", "Filing"))
            title = f"\U0001f4c4 Filing: {filing_label} — {company_name}"
            signal_category = "hot" if score >= 70 else "warm" if score >= 40 else "monitor"
        else:
            title = f"Company Event: {company_name}"
            signal_category = "monitor"

        signals.append({
            "link": unique_key,
            "title": title[:200],
            "company": company_name,
            "source": "Companies House",
            "published": event.get("date", datetime.utcnow().strftime("%Y-%m-%d")),
            "description": event.get("description", "")[:500],
            "score": score,
            "signal_type": signal_type,
            "signal_category": signal_category,
            "scanned_at": datetime.utcnow(),
        })

    return signals


def save_signals(signals: List[Dict]) -> int:
    """Persist CH event signals to the signals table."""
    if not signals:
        return 0
    try:
        from secureflex_intel.db import db_available, upsert_rows, signals_table
        if not db_available():
            print("[CH Events] Database not available for signal storage")
            return 0
        written = upsert_rows(signals_table, signals, "link")
        print(f"[CH Events] Wrote {written} signals to database")
        return written
    except Exception as e:
        print(f"[CH Events] Error saving signals: {e}")
        return 0


# ── Orchestration ────────────────────────────────────────────────────────────

def run_scan() -> Dict:
    """
    Full CH events scan: check all watched companies, generate and persist
    signals.
    Returns a summary dict.
    """
    client = CHEventsClient()

    # Step 1: Check all watched companies
    events = client.check_all_watched_companies()

    # Step 2: Convert to signals
    signals = events_to_signals(events)

    # Step 3: Persist
    written = save_signals(signals)

    companies_checked = client._request_count // 3  # ~3 requests per company
    total_requests = client._request_count

    print(f"[CH Events] Scan complete: {{'status': 'completed', "
          f"'companies_checked': {companies_checked}, "
          f"'total_api_requests': {total_requests}, "
          f"'events_found': {len(events)}, "
          f"'signals_generated': {len(signals)}, "
          f"'signals_written': {written}}}")

    return {
        "status": "completed",
        "companies_checked": companies_checked,
        "total_api_requests": total_requests,
        "events_found": len(events),
        "signals_generated": len(signals),
        "signals_written": written,
    }


# ── CLI Entry Point ──────────────────────────────────────────────────────────

def main():
    """CLI entry point for CH events monitoring."""
    result = run_scan()
    print(f"\n[CH Events] Result: {json.dumps(result, indent=2, default=str)}")


if __name__ == "__main__":
    main()
