"""Play a built game in the browser. Serves a local /sdk.js that is not part of the zip.

Usage:
  py -3 platform/serve.py garden-merge
"""

import functools
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SDK = ROOT / "platform" / "dev_sdk.js"


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path == "/sdk.js":
            data = SDK.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: py -3 platform/serve.py <slug>")
    slug = sys.argv[1]
    folder = ROOT / "dist" / slug
    if not (folder / "index.html").is_file():
        raise SystemExit(f"build the game first: py -3 platform/build.py {slug}")
    handler = functools.partial(Handler, directory=str(folder))
    port = 8080
    while port < 8090:
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            port += 1
    else:
        raise SystemExit("no free port from 8080 to 8089")
    url = f"http://127.0.0.1:{port}/"
    print(f"playing {slug} at {url}", flush=True)
    print("this /sdk.js is local only and is not included in the zip", flush=True)
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
