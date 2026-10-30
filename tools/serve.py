"""Local preview server that never caches, so edits show up on reload.

    python tools/serve.py [port]
"""
import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8931
handler = functools.partial(NoCache, directory=str(ROOT))
print(f"Serving {ROOT} at http://127.0.0.1:{port}/")
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
