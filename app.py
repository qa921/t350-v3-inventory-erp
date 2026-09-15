"""T350-V3 ERP static host.

Serves the restored browser client from web/ and exposes the *public*
(non-secret) Supabase connection settings at /config.js, sourced from
environment variables. Only publishable values (SUPABASE_URL,
SUPABASE_ANON_KEY, DATABASE_SCHEMA) are ever served; service-role keys
and database credentials never leave the server-side boundary.
"""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"

# Public, non-secret configuration keys handed to the browser client.
PUBLIC_CONFIG_KEYS = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "DATABASE_SCHEMA")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def do_GET(self):  # noqa: N802 (stdlib naming)
        if self.path.split("?", 1)[0] == "/config.js":
            self._send_public_config()
            return
        super().do_GET()

    def _send_public_config(self):
        config = {key: os.environ.get(key, "") for key in PUBLIC_CONFIG_KEYS}
        payload = ("window.ERP_CONFIG = %s;\n" % json.dumps(config)).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
