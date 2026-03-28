"""
Weekly Email Digest for SecureFlex Intel.

Generates and sends a professional HTML email summarising the week's
top opportunities, signals, pipeline activity, and competitor alerts.
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import List, Optional

from secureflex_intel.config import settings


class EmailDigest:
    """Generate and send weekly intelligence digest emails."""

    def generate_digest(self) -> str:
        """Generate HTML email content summarising the week's intelligence."""
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)
        week_number = now.isocalendar()[1]

        # Gather data from database
        hot_tenders = self._get_hot_tenders(week_ago)
        top_signals = self._get_top_signals(week_ago)
        pipeline_summary = self._get_pipeline_summary()
        new_prospects = self._get_new_prospects(week_ago)
        competitor_alerts = self._get_competitor_alerts(week_ago)

        # Build HTML
        html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

<!-- Header -->
<div style="text-align:center;padding:32px 0 24px;">
    <div style="display:inline-block;width:48px;height:48px;background:rgba(59,130,246,0.2);border:1px solid rgba(59,130,246,0.4);border-radius:12px;line-height:48px;font-size:22px;">
        &#128737;
    </div>
    <h1 style="color:#f9fafb;font-size:20px;margin:12px 0 4px;letter-spacing:0.05em;">
        SECUREFLEX INTEL
    </h1>
    <p style="color:#6b7280;font-size:13px;margin:0;">
        Weekly Intelligence Briefing &mdash; Week {week_number}
    </p>
    <p style="color:#4b5563;font-size:11px;margin:4px 0 0;">
        Generated {now.strftime('%d %B %Y at %H:%M UTC')}
    </p>
</div>

<!-- Hot Tenders -->
<div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:16px;">
    <h2 style="color:#f59e0b;font-size:14px;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.05em;">
        &#128293; Hot Tenders This Week
    </h2>
    {self._render_tenders_table(hot_tenders)}
</div>

<!-- Top Signals -->
<div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:16px;">
    <h2 style="color:#3b82f6;font-size:14px;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.05em;">
        &#128225; Top Signals
    </h2>
    {self._render_signals_table(top_signals)}
</div>

<!-- Pipeline Summary -->
<div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:16px;">
    <h2 style="color:#22c55e;font-size:14px;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.05em;">
        &#128200; Pipeline Summary
    </h2>
    {self._render_pipeline_summary(pipeline_summary)}
</div>

<!-- New Prospects -->
<div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:16px;">
    <h2 style="color:#8b5cf6;font-size:14px;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.05em;">
        &#127970; New Prospects ({len(new_prospects)})
    </h2>
    {self._render_prospects_list(new_prospects)}
</div>

<!-- Competitor Alerts -->
<div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:16px;">
    <h2 style="color:#ef4444;font-size:14px;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.05em;">
        &#9888;&#65039; Competitor Alerts
    </h2>
    {self._render_competitor_alerts(competitor_alerts)}
</div>

<!-- Footer -->
<div style="text-align:center;padding:24px 0;border-top:1px solid #1f2937;margin-top:8px;">
    <p style="color:#4b5563;font-size:11px;margin:0;">
        SecureFlex Intel Platform &mdash; Automated Weekly Digest
    </p>
    <p style="color:#374151;font-size:10px;margin:4px 0 0;">
        This email was generated automatically. Visit <a href="https://intel.secureflex.uk" style="color:#3b82f6;text-decoration:none;">intel.secureflex.uk</a> for full details.
    </p>
</div>

</div>
</body>
</html>"""
        return html

    def send_digest(self, recipients: Optional[List[str]] = None) -> dict:
        """Send the digest email to configured recipients.
        
        Returns dict with status and details.
        """
        if recipients is None:
            raw = settings.digest_recipients
            recipients = [e.strip() for e in raw.split(",") if e.strip()] if raw else []

        if not recipients:
            return {"status": "skipped", "reason": "No recipients configured"}

        # Check SMTP configuration
        if not settings.smtp_host or not settings.smtp_user:
            return {"status": "skipped", "reason": "SMTP not configured"}

        html_content = self.generate_digest()
        week_number = datetime.utcnow().isocalendar()[1]

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"SecureFlex Intel Weekly Briefing \u2014 Week {week_number}"
        msg["From"] = settings.smtp_user
        msg["To"] = ", ".join(recipients)

        # Plain text fallback
        text_part = MIMEText(
            f"SecureFlex Intel Weekly Briefing - Week {week_number}\n\n"
            "Visit https://intel.secureflex.uk for the full dashboard.\n",
            "plain",
        )
        html_part = MIMEText(html_content, "html")
        msg.attach(text_part)
        msg.attach(html_part)

        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
                server.ehlo()
                if settings.smtp_port != 25:
                    server.starttls()
                    server.ehlo()
                if settings.smtp_user and settings.smtp_password:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(settings.smtp_user, recipients, msg.as_string())
            return {"status": "sent", "recipients": recipients, "week": week_number}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    # ── Data gathering helpers ──────────────────────────────────────────────

    def _get_hot_tenders(self, since: datetime) -> list:
        """Get top 5 highest-scored tenders from the past week."""
        try:
            from secureflex_intel.db import get_engine, tenders_table
            from sqlalchemy import select, desc
            engine = get_engine()
            if not engine:
                return []
            with engine.connect() as conn:
                rows = conn.execute(
                    select(tenders_table)
                    .where(tenders_table.c.scanned_at >= since)
                    .order_by(desc(tenders_table.c.score))
                    .limit(5)
                ).fetchall()
                return [dict(r._mapping) for r in rows]
        except Exception:
            return []

    def _get_top_signals(self, since: datetime) -> list:
        """Get top 5 signals from the past week."""
        try:
            from secureflex_intel.db import get_engine, signals_table
            from sqlalchemy import select, desc
            engine = get_engine()
            if not engine:
                return []
            with engine.connect() as conn:
                rows = conn.execute(
                    select(signals_table)
                    .where(signals_table.c.scanned_at >= since)
                    .order_by(desc(signals_table.c.score))
                    .limit(5)
                ).fetchall()
                return [dict(r._mapping) for r in rows]
        except Exception:
            return []

    def _get_pipeline_summary(self) -> dict:
        """Get pipeline lead counts by stage and overdue actions."""
        try:
            from secureflex_intel.db import get_engine, pipeline_table
            from sqlalchemy import select, func
            engine = get_engine()
            if not engine:
                return {}
            with engine.connect() as conn:
                # Count by status
                rows = conn.execute(
                    select(
                        pipeline_table.c.status,
                        func.count().label("cnt"),
                    ).group_by(pipeline_table.c.status)
                ).fetchall()
                by_stage = {r[0]: r[1] for r in rows}

                # Overdue actions
                today = datetime.utcnow().strftime("%Y-%m-%d")
                overdue = conn.execute(
                    select(func.count()).select_from(pipeline_table)
                    .where(pipeline_table.c.next_action_date < today)
                    .where(pipeline_table.c.next_action_date != "")
                    .where(pipeline_table.c.next_action_date.isnot(None))
                ).scalar() or 0

                total = sum(by_stage.values())
                return {"by_stage": by_stage, "total": total, "overdue": overdue}
        except Exception:
            return {}

    def _get_new_prospects(self, since: datetime) -> list:
        """Get prospects added in the past week."""
        try:
            from secureflex_intel.db import get_engine, prospects_table
            from sqlalchemy import select, desc
            engine = get_engine()
            if not engine:
                return []
            with engine.connect() as conn:
                rows = conn.execute(
                    select(prospects_table)
                    .where(prospects_table.c.scanned_at >= since)
                    .order_by(desc(prospects_table.c.scanned_at))
                    .limit(10)
                ).fetchall()
                return [dict(r._mapping) for r in rows]
        except Exception:
            return []

    def _get_competitor_alerts(self, since: datetime) -> list:
        """Get competitor-related signals (insolvencies, ACS changes)."""
        try:
            from secureflex_intel.db import get_engine, signals_table
            from sqlalchemy import select, desc, or_
            engine = get_engine()
            if not engine:
                return []
            with engine.connect() as conn:
                rows = conn.execute(
                    select(signals_table)
                    .where(signals_table.c.scanned_at >= since)
                    .where(
                        or_(
                            signals_table.c.signal_type.ilike("%insolvency%"),
                            signals_table.c.signal_type.ilike("%acs%"),
                            signals_table.c.signal_type.ilike("%competitor%"),
                            signals_table.c.signal_category.ilike("%competitor%"),
                            signals_table.c.source.ilike("%gazette%"),
                        )
                    )
                    .order_by(desc(signals_table.c.score))
                    .limit(5)
                ).fetchall()
                return [dict(r._mapping) for r in rows]
        except Exception:
            return []

    # ── HTML rendering helpers ──────────────────────────────────────────────

    def _render_tenders_table(self, tenders: list) -> str:
        if not tenders:
            return '<p style="color:#6b7280;font-size:12px;">No hot tenders this week.</p>'
        rows = ""
        for t in tenders:
            title = (t.get("title") or "Untitled")[:80]
            value = t.get("value") or "N/A"
            deadline = t.get("deadline") or "N/A"
            source = t.get("source") or "CF"
            score = t.get("score") or 0
            score_color = "#ef4444" if int(score) >= 65 else "#f59e0b" if int(score) >= 40 else "#22c55e"
            rows += f"""
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #1f2937;color:#e5e7eb;font-size:12px;">{title}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:12px;white-space:nowrap;">{value}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:12px;white-space:nowrap;">{deadline}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1f2937;font-size:12px;white-space:nowrap;">
                    <span style="color:{score_color};font-weight:600;">{score}</span>
                </td>
            </tr>"""
        return f"""
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr>
                    <th style="text-align:left;padding:8px 12px;color:#6b7280;font-size:11px;border-bottom:1px solid #374151;">Title</th>
                    <th style="text-align:left;padding:8px 12px;color:#6b7280;font-size:11px;border-bottom:1px solid #374151;">Value</th>
                    <th style="text-align:left;padding:8px 12px;color:#6b7280;font-size:11px;border-bottom:1px solid #374151;">Deadline</th>
                    <th style="text-align:left;padding:8px 12px;color:#6b7280;font-size:11px;border-bottom:1px solid #374151;">Score</th>
                </tr>
            </thead>
            <tbody>{rows}</tbody>
        </table>"""

    def _render_signals_table(self, signals: list) -> str:
        if not signals:
            return '<p style="color:#6b7280;font-size:12px;">No significant signals this week.</p>'
        rows = ""
        for s in signals:
            title = (s.get("title") or "Untitled")[:80]
            score = s.get("score") or 0
            company = s.get("company") or "—"
            source = s.get("source") or "—"
            rows += f"""
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #1f2937;color:#e5e7eb;font-size:12px;">{title}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:12px;">{company}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1f2937;color:#3b82f6;font-size:12px;font-weight:600;">{score}</td>
            </tr>"""
        return f"""
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr>
                    <th style="text-align:left;padding:8px 12px;color:#6b7280;font-size:11px;border-bottom:1px solid #374151;">Signal</th>
                    <th style="text-align:left;padding:8px 12px;color:#6b7280;font-size:11px;border-bottom:1px solid #374151;">Company</th>
                    <th style="text-align:left;padding:8px 12px;color:#6b7280;font-size:11px;border-bottom:1px solid #374151;">Score</th>
                </tr>
            </thead>
            <tbody>{rows}</tbody>
        </table>"""

    def _render_pipeline_summary(self, summary: dict) -> str:
        if not summary:
            return '<p style="color:#6b7280;font-size:12px;">No pipeline data available.</p>'
        by_stage = summary.get("by_stage", {})
        total = summary.get("total", 0)
        overdue = summary.get("overdue", 0)

        stage_colors = {
            "Research": "#6b7280",
            "Outreach": "#3b82f6",
            "Engaged": "#f59e0b",
            "Proposal": "#8b5cf6",
            "Won": "#22c55e",
            "Lost": "#ef4444",
        }

        stages_html = ""
        for stage, count in by_stage.items():
            color = stage_colors.get(stage, "#6b7280")
            stages_html += f"""
            <div style="display:inline-block;margin:4px 8px 4px 0;padding:6px 12px;background:rgba(255,255,255,0.05);border-radius:8px;">
                <span style="color:{color};font-size:18px;font-weight:700;">{count}</span>
                <span style="color:#9ca3af;font-size:11px;margin-left:4px;">{stage}</span>
            </div>"""

        overdue_html = ""
        if overdue > 0:
            overdue_html = f"""
            <div style="margin-top:12px;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:8px;">
                <span style="color:#ef4444;font-size:12px;font-weight:600;">&#9888; {overdue} overdue action(s)</span>
            </div>"""

        return f"""
        <p style="color:#9ca3af;font-size:12px;margin:0 0 12px;">Total leads: <strong style="color:#f9fafb;">{total}</strong></p>
        <div>{stages_html}</div>
        {overdue_html}"""

    def _render_prospects_list(self, prospects: list) -> str:
        if not prospects:
            return '<p style="color:#6b7280;font-size:12px;">No new prospects this week.</p>'
        items = ""
        for p in prospects[:10]:
            name = p.get("company_name") or "Unknown"
            region = p.get("region") or ""
            items += f"""
            <div style="padding:6px 0;border-bottom:1px solid #1f2937;">
                <span style="color:#e5e7eb;font-size:12px;">{name}</span>
                {f'<span style="color:#4b5563;font-size:11px;margin-left:8px;">{region}</span>' if region else ''}
            </div>"""
        return items

    def _render_competitor_alerts(self, alerts: list) -> str:
        if not alerts:
            return '<p style="color:#6b7280;font-size:12px;">No competitor alerts this week.</p>'
        items = ""
        for a in alerts:
            title = (a.get("title") or "Alert")[:80]
            source = a.get("source") or ""
            items += f"""
            <div style="padding:6px 0;border-bottom:1px solid #1f2937;">
                <span style="color:#fca5a5;font-size:12px;">{title}</span>
                {f'<span style="color:#4b5563;font-size:11px;margin-left:8px;">{source}</span>' if source else ''}
            </div>"""
        return items
