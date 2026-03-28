"""
Entity Resolution Engine for SecureFlex Intel.

Links signals to known companies (prospects + competitors) using multiple
matching strategies: exact, token-based, fuzzy (SequenceMatcher), and
abbreviation matching.
"""

import re
import difflib
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional, Set, Tuple


@dataclass
class Match:
    company_number: str
    company_name: str
    match_score: int
    match_type: str  # exact | token | fuzzy | abbreviation


# Words stripped during normalisation
_STRIP_WORDS = {"ltd", "limited", "plc", "uk", "group", "inc", "corp", "the", "of", "and"}

# Minimum score to keep a match
_MIN_SCORE = 60

# Fuzzy threshold (SequenceMatcher ratio)
_FUZZY_THRESHOLD = 0.75


def _normalise(name: str) -> str:
    """Lowercase, strip legal suffixes, punctuation, and extra whitespace."""
    s = name.lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    tokens = s.split()
    tokens = [t for t in tokens if t not in _STRIP_WORDS]
    return " ".join(tokens).strip()


def _tokenise(name: str) -> Set[str]:
    """Return significant tokens from a normalised name."""
    return set(_normalise(name).split())


def _extract_abbreviation(name: str) -> Optional[str]:
    """
    Extract likely abbreviation from a company name.
    E.g. "G4S SECURE SOLUTIONS (UK) LTD" -> "g4s"
    Takes the first token if it looks like an abbreviation (<=5 chars, has uppercase).
    """
    tokens = name.strip().split()
    if not tokens:
        return None
    first = tokens[0]
    # If first token is short and mostly uppercase / alphanumeric, treat as abbreviation
    if len(first) <= 5 and re.match(r'^[A-Z0-9]+$', first):
        return first.lower()
    return None


class EntityResolver:
    """Resolves free-text mentions to known companies."""

    def __init__(self):
        self._companies: List[Dict[str, str]] = []  # [{company_number, company_name}]
        self._norm_index: Dict[str, Dict[str, str]] = {}  # normalised_name -> company dict
        self._token_index: Dict[str, List[Dict]] = {}  # token -> [company dicts]
        self._abbrev_index: Dict[str, Dict[str, str]] = {}  # abbreviation -> company dict
        self._built = False

    # ── Build index ──────────────────────────────────────────────────────

    def build_company_index(self) -> int:
        """Load all company names from prospects + competitors tables, build lookup index.
        Returns number of companies indexed."""
        try:
            from secureflex_intel.db import (
                db_available, get_engine,
                prospects_table, competitors_table,
            )
            from sqlalchemy import select

            if not db_available():
                print("[EntityResolver] Database not available")
                return 0

            engine = get_engine()
            companies: Dict[str, str] = {}  # number -> name (dedup)

            with engine.connect() as conn:
                for tbl in (prospects_table, competitors_table):
                    rows = conn.execute(
                        select(tbl.c.company_number, tbl.c.company_name)
                    ).fetchall()
                    for r in rows:
                        num = (r[0] or "").strip()
                        name = (r[1] or "").strip()
                        if num and name:
                            companies[num] = name

            self._companies = [
                {"company_number": num, "company_name": name}
                for num, name in companies.items()
            ]

            # Build normalised index
            self._norm_index = {}
            self._token_index = {}
            self._abbrev_index = {}

            for c in self._companies:
                norm = _normalise(c["company_name"])
                self._norm_index[norm] = c

                # Token index
                for tok in _tokenise(c["company_name"]):
                    if len(tok) >= 3:  # skip very short tokens
                        self._token_index.setdefault(tok, []).append(c)

                # Abbreviation index
                abbr = _extract_abbreviation(c["company_name"])
                if abbr:
                    self._abbrev_index[abbr] = c

            self._built = True
            print(f"[EntityResolver] Indexed {len(self._companies)} companies "
                  f"({len(self._norm_index)} normalised, {len(self._abbrev_index)} abbreviations)")
            return len(self._companies)

        except Exception as e:
            print(f"[EntityResolver] Failed to build index: {e}")
            return 0

    # ── Resolve ──────────────────────────────────────────────────────────

    def resolve(self, text: str) -> List[Match]:
        """Given text (signal title or description), find matching companies."""
        if not self._built or not text:
            return []

        text_norm = _normalise(text)
        text_lower = text.lower()
        matches: Dict[str, Match] = {}  # company_number -> best Match

        def _record(company: Dict[str, str], score: int, mtype: str):
            num = company["company_number"]
            if num in matches:
                if score > matches[num].match_score:
                    matches[num] = Match(num, company["company_name"], score, mtype)
            else:
                matches[num] = Match(num, company["company_name"], score, mtype)

        # Strategy 1: Exact match (normalised company name appears verbatim in normalised text)
        for norm_name, company in self._norm_index.items():
            if norm_name and len(norm_name) >= 3 and norm_name in text_norm:
                _record(company, 100, "exact")

        # Strategy 2: Abbreviation match
        text_tokens_lower = set(text_lower.split())
        for abbr, company in self._abbrev_index.items():
            if abbr in text_tokens_lower:
                _record(company, 70, "abbreviation")

        # Strategy 3: Token-based match (all significant tokens from company name appear in text)
        for company in self._companies:
            num = company["company_number"]
            if num in matches and matches[num].match_score >= 80:
                continue  # already have a strong match
            company_tokens = _tokenise(company["company_name"])
            if len(company_tokens) < 2:
                continue  # need at least 2 tokens for token match
            text_tokens_norm = set(text_norm.split())
            if company_tokens.issubset(text_tokens_norm):
                _record(company, 80, "token")

        # Strategy 4: Fuzzy match (only for companies not yet matched)
        for company in self._companies:
            num = company["company_number"]
            if num in matches and matches[num].match_score >= 60:
                continue
            norm_name = _normalise(company["company_name"])
            if len(norm_name) < 4:
                continue
            # Check fuzzy similarity against sliding windows of text
            ratio = difflib.SequenceMatcher(None, norm_name, text_norm).ratio()
            if ratio >= _FUZZY_THRESHOLD:
                _record(company, 60, "fuzzy")
            else:
                # Try matching against substrings of similar length
                words = text_norm.split()
                name_word_count = len(norm_name.split())
                for i in range(len(words) - name_word_count + 1):
                    window = " ".join(words[i:i + name_word_count])
                    ratio = difflib.SequenceMatcher(None, norm_name, window).ratio()
                    if ratio >= _FUZZY_THRESHOLD:
                        _record(company, 60, "fuzzy")
                        break

        # Filter by minimum score
        results = [m for m in matches.values() if m.match_score >= _MIN_SCORE]
        results.sort(key=lambda m: m.match_score, reverse=True)
        return results

    # ── Batch resolve ────────────────────────────────────────────────────

    def batch_resolve_signals(self) -> Dict[str, int]:
        """Iterate all signals, resolve each, store matches in signal_matches table.
        Returns stats dict."""
        if not self._built:
            count = self.build_company_index()
            if count == 0:
                return {"error": "No companies indexed", "signals_processed": 0, "matches_found": 0}

        try:
            from secureflex_intel.db import (
                db_available, get_engine,
                signals_table, signal_matches_table,
            )
            from sqlalchemy import select, delete
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            if not db_available():
                return {"error": "Database not available"}

            engine = get_engine()
            signals_processed = 0
            matches_found = 0

            with engine.begin() as conn:
                # Clear existing matches for fresh resolution
                conn.execute(delete(signal_matches_table))

                # Fetch all signals
                rows = conn.execute(
                    select(
                        signals_table.c.id,
                        signals_table.c.title,
                        signals_table.c.description,
                        signals_table.c.company,
                    )
                ).fetchall()

                for row in rows:
                    signal_id = row[0]
                    # Combine title + description + company field for matching
                    parts = [row[1] or "", row[2] or "", row[3] or ""]
                    combined_text = " ".join(p for p in parts if p)

                    if not combined_text.strip():
                        continue

                    signals_processed += 1
                    matches = self.resolve(combined_text)

                    for match in matches:
                        try:
                            stmt = pg_insert(signal_matches_table).values(
                                signal_id=signal_id,
                                company_number=match.company_number,
                                company_name=match.company_name,
                                match_score=match.match_score,
                                match_type=match.match_type,
                                created_at=datetime.utcnow(),
                            )
                            stmt = stmt.on_conflict_do_update(
                                constraint="uq_signal_company",
                                set_={
                                    "match_score": stmt.excluded.match_score,
                                    "match_type": stmt.excluded.match_type,
                                    "company_name": stmt.excluded.company_name,
                                    "created_at": stmt.excluded.created_at,
                                }
                            )
                            conn.execute(stmt)
                            matches_found += 1
                        except Exception as e:
                            print(f"[EntityResolver] Error storing match for signal {signal_id}: {e}")

            print(f"[EntityResolver] Batch complete: {signals_processed} signals processed, "
                  f"{matches_found} matches found")
            return {
                "signals_processed": signals_processed,
                "matches_found": matches_found,
                "companies_indexed": len(self._companies),
            }

        except Exception as e:
            print(f"[EntityResolver] Batch resolve failed: {e}")
            return {"error": str(e), "signals_processed": 0, "matches_found": 0}
