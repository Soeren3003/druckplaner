"""Screenshots für die README: liefert dist/ aus und speichert per POST /save?name=x.png
hochgeladene Aufnahmen (nur 127.0.0.1).

  npm run build && cp node_modules/html2canvas/dist/html2canvas.min.js scripts/screenshots/snap.js dist/
  python3 scripts/screenshots/server.py dist <Zielordner>
  → im Browser http://127.0.0.1:4173/?demo öffnen, in der Konsole: await snap("overview")
"""
import functools
import http.server
import os
import re
import sys

root, out = sys.argv[1], sys.argv[2]


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        m = re.match(r"^/save\?name=([a-z0-9-]+\.png)$", self.path)
        if not m:
            self.send_error(400)
            return
        data = self.rfile.read(int(self.headers["Content-Length"]))
        with open(os.path.join(out, m.group(1)), "wb") as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", 4173), functools.partial(Handler, directory=root)).serve_forever()
