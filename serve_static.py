#!/usr/bin/env python3
"""Serves the built frontend (dist/) with no dependencies beyond the Python
standard library — no Node, no Docker, nothing to install.

Handles client-side routing correctly: an unknown path like /agent/aml
returns index.html (so a page refresh on a deep route works) instead of
404ing, the same way Vite's own dev server and most static hosts do.

Usage:
    python serve_static.py [port] [dist_dir]

Defaults to port 4173, and to a "dist" folder next to this script.
"""
import http.server
import os
import sys
from pathlib import Path

DEFAULT_PORT = 4173


class SpaHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Strip query string / fragment before resolving to a file.
        clean_path = path.split("?", 1)[0].split("#", 1)[0]
        full_path = Path(super().translate_path(clean_path))

        if full_path.is_file():
            return str(full_path)

        # Anything else that isn't a real static asset (no dot in the last
        # segment) is a client-side route — hand it index.html and let
        # React Router take over.
        if "." not in full_path.name:
            return str(Path(self.directory) / "index.html")

        return str(full_path)

    def end_headers(self):
        # Never cache index.html / config.js, so a redeploy or an on-machine
        # edit to config.js is picked up on the next reload without clearing
        # the browser cache.
        if self.path in ("/", "/index.html", "/config.js"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    dist_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent / "dist"

    if not dist_dir.is_dir():
        print(f"error: {dist_dir} does not exist. Build the frontend first (npm run build) "
              f"on a machine that has Node, then copy the resulting dist/ folder here.")
        sys.exit(1)

    os.chdir(dist_dir)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), SpaHandler)
    print(f"Serving {dist_dir} at http://localhost:{port}")
    print("Edit config.js in that folder (then hard-refresh the browser) to point at a different backend URL.")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
