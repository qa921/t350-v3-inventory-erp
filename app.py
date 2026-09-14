import json, os
from http.server import BaseHTTPRequestHandler, HTTPServer

FIXTURE = {"namespace":"MINED-T350-V3","focus":"inventory","modules":["catalog","warehouses","procurement"],"state":"proposed baseline; contributor hardening required"}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        payload = json.dumps(FIXTURE).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

HTTPServer(("0.0.0.0", int(os.environ.get("PORT", "10000"))), Handler).serve_forever()
