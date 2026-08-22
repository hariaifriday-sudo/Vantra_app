"""Static branch directory for the public FAQ assistant. Vantra is a demo
bank with no real physical locations, so this is reference data (not a DB
table) — same spirit as the seeded product offers in data/mock on the
frontend. Google Maps links are built server-side from the address, never by
the model, so they're never hallucinated."""
from urllib.parse import quote_plus

CUSTOMER_CARE_NUMBER = "1-800-826-8721"
CUSTOMER_CARE_HOURS = "24/7, every day of the year"

BRANCHES: list[dict[str, str]] = [
    {
        "name": "Vantra Downtown",
        "address": "142 Market Street, San Francisco, CA 94105",
        "city": "San Francisco",
        "phone": "1-415-555-0142",
        "hours": "Mon–Fri 9am–5pm, Sat 10am–2pm",
    },
    {
        "name": "Vantra Midtown",
        "address": "89 Fifth Avenue, New York, NY 10003",
        "city": "New York",
        "phone": "1-212-555-0189",
        "hours": "Mon–Fri 9am–6pm, Sat 10am–3pm",
    },
    {
        "name": "Vantra Riverside",
        "address": "410 Riverside Drive, Austin, TX 78701",
        "city": "Austin",
        "phone": "1-512-555-0410",
        "hours": "Mon–Fri 9am–5pm",
    },
]


def maps_url(address: str) -> str:
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(address)}"


def branch_out(b: dict[str, str]) -> dict[str, str]:
    return {**b, "maps_url": maps_url(b["address"])}


def find_branches(location: str | None) -> list[dict[str, str]]:
    """Simple substring match against city/address — this is reference data
    for a demo app, not a real geocoding lookup. Falls back to the full
    directory when there's no match or no location was given, so the caller
    always has something useful to show."""
    if not location:
        return [branch_out(b) for b in BRANCHES]
    needle = location.strip().lower()
    matches = [b for b in BRANCHES if needle in b["city"].lower() or needle in b["address"].lower()]
    return [branch_out(b) for b in (matches or BRANCHES)]
