# Serves dist/ with the headers from public/_headers (a small subset of Cloudflare's rules), SPA fallback.
import http.server, os, re, sys
ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist')

def rules():
    out, cur = [], None
    for line in open(os.path.join(ROOT, '_headers'), encoding='utf-8'):
        line = line.rstrip()
        if not line or line.lstrip().startswith('#'): continue
        if not line.startswith(' '):
            cur = {'path': line.strip(), 'set': [], 'drop': []}; out.append(cur); continue
        l = line.strip()
        if l.startswith('!'): cur['drop'].append(l[1:].strip().lower())
        else:
            k, v = l.split(':', 1); cur['set'].append((k.strip(), v.strip()))
    return out
RULES = rules()

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        path = self.path.split('?')[0]
        hdrs = {}
        for r in RULES:
            pat = '^' + re.escape(r['path']).replace('\\*', '.*') + '$'
            if re.match(pat, path):
                for d in r['drop']: hdrs.pop(d, None)
                for k, v in r['set']: hdrs[k.lower()] = (k, v)
        for k, v in hdrs.values():
            if k.lower() != 'strict-transport-security': self.send_header(k, v.replace(' upgrade-insecure-requests', ''))
        super().end_headers()
    def send_head(self):
        p = self.translate_path(self.path)
        if not os.path.exists(p): self.path = '/index.html'
        return super().send_head()

http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 4199), H).serve_forever()
