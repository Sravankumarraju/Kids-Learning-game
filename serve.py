"""Tiny static server for local development (disables browser caching).
Usage: python serve.py [port]   then open http://localhost:8765/
"""
import http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer.allow_reuse_address = True
with http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache) as httpd:
    print(f'Serving on http://localhost:{port}/')
    httpd.serve_forever()
