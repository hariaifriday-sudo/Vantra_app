"""Idempotent demo-data seeder. Run with: python -m app.seed"""
from datetime import datetime, timedelta, timezone

from .database import Base, SessionLocal, engine
from .models import (
    Account,
    AmlAlert,
    Beneficiary,
    CaseTicket,
    DetectionRule,
    FraudAlert,
    Notification,
    Policy,
    SavingsGoal,
    TransactionRecord,
    UnderwritingApplication,
    User,
)
from .security import hash_password

DEMO_PASSWORD = "VantraDemo123!"


def days_ago(n: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=n)


def hours_ago(n: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=n)


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("Database already seeded — skipping. Delete server/vantra.db to reseed from scratch.")
            return

        # ---- Users ----
        maren = User(email="maren@vantra.bank", password_hash=hash_password(DEMO_PASSWORD), full_name="Maren Okafor", role="account_holder", avatar_seed=47)
        dana = User(email="dana.reyes@vantra.bank", password_hash=hash_password(DEMO_PASSWORD), full_name="Dana Reyes", role="agent", employee_id="EMP-4471", department="Fraud Ops", avatar_seed=33)
        db.add_all([maren, dana])
        db.commit()
        db.refresh(maren)
        db.refresh(dana)

        # ---- Accounts & transactions ----
        checking = Account(user_id=maren.id, type="checking", name="Everyday Checking", number_masked="•••• 4821", balance=18420.32)
        savings = Account(user_id=maren.id, type="savings", name="Horizon Savings", number_masked="•••• 9012", balance=13102.90)
        credit = Account(user_id=maren.id, type="credit", name="Vantra Platinum Card", number_masked="•••• 2277", balance=-874.60)
        db.add_all([checking, savings, credit])
        db.commit()
        db.refresh(checking)

        tx_data = [
            ("Whole Foods Market", "Groceries", -86.42, 1, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4820.00, 2, "Completed"),
            ("Transfer to J. Alvarez", "Transfer", -420.00, 3, "Completed"),
            ("City Power & Water", "Bills", -132.90, 4, "Completed"),
            ("Delta Airlines", "Travel", -612.00, 5, "Pending"),
            ("Zenith Coworking", "Shopping", -89.00, 6, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4820.00, 16, "Completed"),
            ("Trader Joes", "Groceries", -64.10, 12, "Completed"),
            ("City Power & Water", "Bills", -128.40, 18, "Completed"),
            ("Amazon", "Shopping", -152.30, 22, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4820.00, 32, "Completed"),
            ("Whole Foods Market", "Groceries", -91.15, 38, "Completed"),
            ("City Power & Water", "Bills", -140.05, 45, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4650.00, 48, "Completed"),
            ("REI Co-op", "Shopping", -212.00, 55, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4650.00, 63, "Completed"),
            ("Trader Joes", "Groceries", -78.60, 68, "Completed"),
            ("City Power & Water", "Bills", -135.20, 75, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4650.00, 78, "Completed"),
            ("United Airlines", "Travel", -430.00, 85, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4500.00, 94, "Completed"),
            ("Whole Foods Market", "Groceries", -102.30, 98, "Completed"),
            ("City Power & Water", "Bills", -129.80, 104, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4500.00, 109, "Completed"),
            ("Best Buy", "Shopping", -340.00, 118, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4500.00, 124, "Completed"),
            ("Trader Joes", "Groceries", -70.90, 132, "Completed"),
            ("City Power & Water", "Bills", -124.60, 138, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4400.00, 140, "Completed"),
            ("Southwest Airlines", "Travel", -318.00, 148, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4400.00, 155, "Completed"),
            ("Whole Foods Market", "Groceries", -95.40, 160, "Completed"),
            ("City Power & Water", "Bills", -131.10, 165, "Completed"),
            ("Payroll — Meridian Labs", "Income", 4400.00, 171, "Completed"),
        ]
        for merchant, category, amount, age, status in tx_data:
            db.add(TransactionRecord(account_id=checking.id, merchant=merchant, category=category, amount=amount, status=status, occurred_at=days_ago(age)))

        # ---- Synthetic account holders with patterns for the real AML scan to detect ----
        nadia = User(email="n.kowalczyk@vantra.bank", password_hash=hash_password(DEMO_PASSWORD), full_name="Nadia Kowalczyk", role="account_holder", avatar_seed=12)
        halden = User(email="ops@haldenimport.biz", password_hash=hash_password(DEMO_PASSWORD), full_name="Halden Import Group", role="account_holder", avatar_seed=8)
        db.add_all([nadia, halden])
        db.commit()
        db.refresh(nadia)
        db.refresh(halden)

        nadia_checking = Account(user_id=nadia.id, type="checking", name="Everyday Checking", number_masked="•••• 7742", balance=5210.40)
        halden_checking = Account(user_id=halden.id, type="checking", name="Business Checking", number_masked="•••• 3390", balance=61400.00)
        db.add_all([nadia_checking, halden_checking])
        db.commit()
        db.refresh(nadia_checking)
        db.refresh(halden_checking)

        # Velocity pattern: 5 large withdrawals within a few hours
        for i, (amount, hrs) in enumerate([(-6200, 14.5), (-5800, 13.8), (-6100, 13.1), (-5950, 12.4), (-6300, 11.6)]):
            db.add(TransactionRecord(account_id=nadia_checking.id, merchant=f"External Transfer #{i + 1}", category="Transfer Out", amount=amount, status="Completed", occurred_at=hours_ago(hrs)))
        db.add(TransactionRecord(account_id=nadia_checking.id, merchant="Payroll — Fenwick Consulting", category="Income", amount=32000.00, status="Completed", occurred_at=hours_ago(16)))

        # Structuring pattern: sub-$10k legs within a 3-day window summing well past the CTR threshold
        for i, (amount, days) in enumerate([(-3400, 2.5), (-3800, 1.9), (-4100, 1.2), (-3600, 0.4)]):
            db.add(TransactionRecord(account_id=halden_checking.id, merchant=f"Wire Out — Partner {chr(65 + i)}", category="Wire Transfer", amount=amount, status="Completed", occurred_at=days_ago(days)))
        db.add(TransactionRecord(account_id=halden_checking.id, merchant="Client Payment — Meridian Corp", category="Income", amount=61400.00, status="Completed", occurred_at=days_ago(5)))

        db.add_all([
            Beneficiary(user_id=maren.id, name="Anna Petrova", account_ref="ACC-80231", bank_name="Vantra Bank", color="#e8b23d"),
            Beneficiary(user_id=maren.id, name="Sam Delgado", account_ref="ACC-80452", bank_name="Vantra Bank", color="#c9c2f0"),
            Beneficiary(user_id=maren.id, name="Lily Chen", account_ref="ACC-80119", bank_name="First Meridian Bank", color="#bfe3f5"),
            Beneficiary(user_id=maren.id, name="Clara Nwosu", account_ref="ACC-80877", bank_name="Vantra Bank", color="#c7efd8"),
            Beneficiary(user_id=maren.id, name="Ruben Osei", account_ref="ACC-80390", bank_name="First Meridian Bank", color="#e8b23d"),
        ])

        db.add_all([
            SavingsGoal(user_id=maren.id, name="Iceland Trip", icon="airplane", target=6000, saved=4080, due_by="Jun 2027"),
            SavingsGoal(user_id=maren.id, name="Emergency Fund", icon="firstaid", target=15000, saved=9750, due_by="Ongoing"),
            SavingsGoal(user_id=maren.id, name="New MacBook", icon="laptop", target=2400, saved=1560, due_by="Nov 2026"),
        ])

        db.add_all([
            Notification(user_id=maren.id, type="security", title="Unusual transaction flagged", body="A $1,240 charge in Lagos, NG doesn't match your usual spending pattern. Was this you?", severity="watch", action_label="Confirm or dismiss"),
            Notification(user_id=maren.id, type="kyc", title="KYC needs one more document", body="Your address proof was unclear. Upload a clearer copy of a recent utility bill.", severity="watch", action_label="Upload document"),
            Notification(user_id=maren.id, type="statement", title="Statement ready", body="Your August account statement is available to download.", severity="neutral"),
            Notification(user_id=maren.id, type="offer", title="New offer: Horizon Savings", body="4.35% APY with no minimum balance — available for your account tier.", severity="neutral"),
        ])

        # ---- Fraud alerts ----
        db.add_all([
            FraudAlert(account_masked="•••• 4821", user_id=maren.id, amount=1240.00, merchant="Unknown POS — Lagos, NG", rule="Geo-mismatch", risk="Critical", ai_explanation="This account's typical spend footprint is within a 40-mile radius; this transaction originated over 6,000 miles away with no prior travel notice."),
            FraudAlert(account_masked="•••• 2093", amount=82.50, merchant="Trader Joes", rule="None", risk="Low", ai_explanation="Routine grocery purchase, consistent with historical pattern."),
            FraudAlert(account_masked="•••• 7742", amount=420.00, merchant="QuickCash ATM ×5", rule="Velocity: 5 txns/3min", risk="High", ai_explanation="Five ATM withdrawals within a 3-minute window is consistent with card-testing or a compromised PIN."),
            FraudAlert(account_masked="•••• 5510", amount=3899.00, merchant="Electronics Superstore", rule="Amount outlier vs 90-day avg", risk="Medium", ai_explanation="Transaction is 6.2x this account's 90-day average purchase size."),
        ])

        # ---- AML alerts ----
        db.add_all([
            AmlAlert(entity_name="Halden Import Group", alert_type="Structuring Pattern", volume=48200, case_ref="ALT-7734", narrative="Multiple transactions just under the $10,000 CTR threshold across a 72-hour window, spread across three linked accounts — matches structuring typology."),
            AmlAlert(entity_name="Vostrikov Trading LLC", alert_type="Sanctions List Match", volume=12900, case_ref="ALT-7729", narrative="Counterparty name partially matches an OFAC SDN list entry; manual review required before clearing."),
            AmlAlert(entity_name="N. Kowalczyk", alert_type="Rapid Fund Movement", volume=31400, case_ref="ALT-7718", status="Investigating", narrative="Funds moved through the account within 4 hours of deposit, touching two external institutions."),
            AmlAlert(entity_name="Reyes Consulting SA", alert_type="Unusual Cross-Border Transfer", volume=8750, case_ref="ALT-7702", narrative="First cross-border transfer on this account, to a jurisdiction with elevated AML risk rating."),
        ])

        # ---- Case tickets ----
        db.add_all([
            CaseTicket(sender_email="j.harmon@email.com", subject="Unrecognized charge on my statement", body="I see a $412 charge from a merchant I don't recognize. Can you help me figure out what this is or dispute it?", ai_summary="Customer disputes a $412 charge from an unfamiliar merchant.", department="Fraud", confidence=94, status="Auto-Routed"),
            CaseTicket(sender_email="s.deleon@email.com", subject="KYC documents rejected — why?", body="My verification documents were rejected and I don't understand why. Please clarify what I need to resubmit.", ai_summary="Address proof was blurry; customer wants clarification.", department="KYC", confidence=89, status="Needs Review"),
            CaseTicket(sender_email="r.patel@email.com", subject="Loan application status", body="I applied for a personal loan two weeks ago and haven't heard back. Can you give me a status update?", ai_summary="Applicant asking for an update on their personal loan decision.", department="Loans", confidence=97, status="Auto-Routed"),
            CaseTicket(sender_email="unclear@proton.me", subject="help!!", body="this isnt right i need someone to call me asap this is urgent", ai_summary="Vague message, sentiment negative, likely urgent.", department="General Support", confidence=52, status="Needs Review"),
        ])

        # ---- Underwriting ----
        db.add_all([
            UnderwritingApplication(applicant_name="Coastal Fabrication LLC", loan_type="Business Term Loan", amount=185000, grade="B", status="Pending", dti=34, credit_score=712, ltv=61, ai_summary="Coastal Fabrication LLC shows stable revenue over the trailing 12 months with seasonal variance typical for the fabrication sector. Debt-to-income sits within an acceptable band for the requested facility. Collateral value covers 92% of the loan amount at current appraisal.", recommendation="Approve with Conditions"),
            UnderwritingApplication(applicant_name="D. Whitfield", loan_type="Auto Loan", amount=22000, grade="A", status="Pending", dti=21, credit_score=781, ltv=88, ai_summary="Strong credit history with low utilization and stable employment tenure of 6+ years.", recommendation="Approve"),
            UnderwritingApplication(applicant_name="M. Okonkwo", loan_type="Personal Loan", amount=8500, grade="C", status="Flagged", dti=48, credit_score=598, ltv=None, ai_summary="High debt-to-income ratio combined with two recent delinquencies raises repayment risk.", recommendation="Decline"),
            UnderwritingApplication(applicant_name="Nordvik Freight AS", loan_type="Equipment Financing", amount=410000, grade="B", status="Pending", dti=39, credit_score=None, ltv=70, ai_summary="Established freight operator with consistent revenue; equipment serves as strong collateral.", recommendation="Approve with Conditions"),
        ])

        # ---- Policies ----
        db.add_all([
            Policy(category="BSA/AML", title="Customer Identification Program (CIP) Standard", owner="Compliance", body="1. Purpose. Establishes minimum identity verification requirements before opening any account, per the Bank Secrecy Act. 2. Scope. Applies to all new account openings across retail and business banking. 3. Requirements. Collect legal name, date of birth, address, and identification number; verify against a government-issued photo ID within 30 days of account opening. 4. Escalation. Any identity that cannot be verified within the standard window must be escalated to Compliance for enhanced due diligence."),
            Policy(category="BSA/AML", title="Suspicious Activity Report Filing Procedure", owner="Compliance", body="1. Purpose. Defines when and how staff must file a Suspicious Activity Report (SAR). 2. Trigger. Any transaction or pattern of transactions totaling $5,000 or more where the institution knows, suspects, or has reason to suspect the funds are derived from illegal activity. 3. Timeline. SARs must be filed within 30 calendar days of the initial detection of facts constituting a basis for filing. 4. Confidentiality. The existence of a SAR filing must never be disclosed to the subject of the report."),
            Policy(category="KYC/CIP", title="Enhanced Due Diligence for High-Risk Customers", owner="Compliance", body="1. Purpose. Defines additional verification steps for customers in higher-risk categories (politically exposed persons, high cash-intensive businesses, customers from higher-risk jurisdictions). 2. Requirements. Source-of-funds documentation, senior management approval, and ongoing monitoring at a heightened frequency. 3. Review Cycle. High-risk customer files must be reviewed at least annually."),
            Policy(category="Consumer Lending", title="Fair Lending Underwriting Guidelines", owner="Credit Risk", body="1. Purpose. Ensures underwriting decisions are made on a consistent, non-discriminatory basis in line with the Equal Credit Opportunity Act. 2. Income Verification. Applicant income must be verified using at least one of: pay stubs, tax returns, or bank statements covering the trailing 3 months. 3. Automated Decisions. Any AI-assisted underwriting recommendation must be reviewable by a human underwriter and must not be the sole basis for an adverse action.", flagged=True),
            Policy(category="Data Privacy", title="Customer Data Retention & Disposal Policy", owner="Legal", body="1. Purpose. Defines how long customer records are retained and how they are disposed of. 2. Retention. Account and transaction records are retained for 7 years after account closure per regulatory requirements. 3. Disposal. Records past the retention window must be securely destroyed using an approved data-wiping standard."),
            Policy(category="Internal Operations", title="Branch Cash Handling SOP", owner="Operations", body="1. Purpose. Standard operating procedure for cash handling at branch locations. 2. Dual Control. Cash drawer reconciliation requires two authorized staff members. 3. Reporting. Any discrepancy over $50 must be reported to the branch manager same-day."),
        ])

        # ---- Detection rule defaults (the thresholds the AML/Fraud scans used
        # to hardcode) — flagged is_default so they can be disabled but not deleted ----
        db.add_all([
            DetectionRule(domain="aml", rule_type="structuring", label="Structuring Pattern", is_default=True,
                          params={"ctr_threshold": 10_000, "min_leg": 3_000, "window_days": 3}),
            DetectionRule(domain="aml", rule_type="velocity", label="Rapid Fund Movement", is_default=True,
                          params={"min_count": 4, "window_hours": 24}),
            DetectionRule(domain="aml", rule_type="round_number", label="Round-Number Transaction", is_default=True,
                          params={"min_amount": 1_000, "round_to": 500}),
            DetectionRule(domain="aml", rule_type="pass_through", label="Pass-Through Activity", is_default=True,
                          params={"min_amount": 3_000, "max_hours": 24, "tolerance_pct": 10}),
            DetectionRule(domain="aml", rule_type="dormant_reactivation", label="Dormant Account Reactivation", is_default=True,
                          params={"dormant_days": 60, "min_amount": 2_000}),
            DetectionRule(domain="aml", rule_type="velocity_baseline", label="Personalized Velocity Spike", is_default=True,
                          params={"multiple": 3.0, "baseline_days": 90, "recent_days": 7}),
            DetectionRule(domain="aml", rule_type="sanctions_match", label="Sanctions / High-Risk Jurisdiction", is_default=True,
                          params={"high_risk_countries": "IR,KP,SY,CU,RU", "watchlist_names": ""}),
            DetectionRule(domain="aml", rule_type="coordinated_structuring", label="Coordinated Structuring Ring", is_default=True,
                          params={"ring_window_hours": 48, "min_holders": 2}),
            DetectionRule(domain="fraud", rule_type="geo_mismatch", label="Geo-mismatch", is_default=True,
                          params={"risk": "Critical"}),
            DetectionRule(domain="fraud", rule_type="velocity", label="Velocity", is_default=True,
                          params={"min_count": 4, "window_minutes": 10}),
            DetectionRule(domain="fraud", rule_type="amount_outlier", label="Amount outlier vs recent avg", is_default=True,
                          params={"multiple": 4.0, "baseline_min_count": 3}),
            DetectionRule(domain="fraud", rule_type="impossible_travel", label="Impossible Travel", is_default=True,
                          params={"max_hours_between_countries": 3}),
            DetectionRule(domain="fraud", rule_type="duplicate_charge", label="Duplicate / Replay Charge", is_default=True,
                          params={"window_minutes": 30}),
            DetectionRule(domain="fraud", rule_type="new_beneficiary_transfer", label="New-Beneficiary Large Transfer", is_default=True,
                          params={"lookback_days": 3, "min_amount": 1_000}),
            DetectionRule(domain="fraud", rule_type="new_payee_burst", label="Burst to New Payees", is_default=True,
                          params={"window_hours": 24, "min_new_payees": 3}),
            DetectionRule(domain="fraud", rule_type="off_hours_anomaly", label="Off-Hours Anomaly", is_default=True,
                          params={"quiet_start_hour": 1, "quiet_end_hour": 5}),
            DetectionRule(domain="fraud", rule_type="new_category_spike", label="First-Time High-Risk Category Spike", is_default=True,
                          params={"min_amount": 1_000}),
            DetectionRule(domain="fraud", rule_type="known_bad_merchant", label="Known Bad Merchant", is_default=True,
                          params={"merchants": ""}),
        ])

        db.commit()
        print("Seed complete.")
        print(f"  Account holder login -> maren@vantra.bank / {DEMO_PASSWORD}")
        print(f"  Agent login          -> dana.reyes@vantra.bank / {DEMO_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
