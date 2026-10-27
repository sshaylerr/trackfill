"""Assemble dist/trackfill.html: inline the model, the engine host (twice: page + worklet) and the WASM binary."""
import base64, json, pathlib
root = pathlib.Path(__file__).parent
app = (root / 'app.html').read_text()
model = (root / 'js/model.js').read_text() + '\n' + (root / 'js/harmony.js').read_text().replace("'use strict';", '', 1) + '\n' + (root / 'js/synthpresets.js').read_text().replace("'use strict';", '', 1) + '\n' + (root / 'js/instdata.js').read_text() + '\n' + (root / 'js/instruments.js').read_text().replace("'use strict';", '', 1) + '\n' + (root / 'js/wavetables.js').read_text().replace("'use strict';", '', 1) + '\n' + (root / 'js/drumvoice.js').read_text().replace("'use strict';", '', 1) + '\n' + (root / 'js/drumpresets.js').read_text() + '\n' + (root / 'js/drums.js').read_text().replace("'use strict';", '', 1) + '\n' + (root / 'js/stretch.js').read_text().replace("'use strict';", '', 1)
host = (root / 'js/host.js').read_text()
controls = (root / 'ui/controls.js').read_text()
views = 'const TF_SYNFIT_SRC = ' + json.dumps((root / 'js/drumfit.js').read_text().replace("'use strict';", '', 1) + '\n' + (root / 'js/synthfit.js').read_text().replace("'use strict';", '', 1)) + ';   // Match a sample (synths): the fitter, run in a worker with its own engine\n' + 'const TF_DRUMFIT_SRC = ' + json.dumps((root / 'js/drumvoice.js').read_text() + '\n' + (root / 'js/drumfit.js').read_text().replace("'use strict';", '', 1)) + ';   // Make from a sample: the drum voice and its fitter, run in a worker\n' + 'const lamejs = (() => {   // MP3 encoder: lamejs (LGPL-3.0, js/vendor/LAME-LICENSE.txt), kept whole in its own scope\n' + (root / 'js/vendor/lame.min.js').read_text() + '\nreturn lamejs; })();\n' + 'const SignalsmithStretch = (() => { const module = undefined, exports = undefined, define = undefined;\n' + (root / 'js/vendor/signalsmith-stretch.js').read_text() + '\nreturn SignalsmithStretch; })();\n' + (root / 'ui/views.js').read_text() + '\n' + (root / 'ui/chop.js').read_text() + '\n' + (root / 'ui/scope.js').read_text() + '\n' + (root / 'ui/fxvis.js').read_text() + '\n' + (root / 'ui/devices.js').read_text() + '\n' + (root / 'ui/keys.js').read_text() + '\n' + (root / 'ui/edit.js').read_text() + '\n' + (root / 'ui/synth.js').read_text() + '\n' + (root / 'ui/drums.js').read_text() + '\n' + (root / 'ui/stretch.js').read_text() + '\n' + (root / 'ui/midi.js').read_text()
wasm = base64.b64encode((root / 'build/engine.wasm').read_bytes()).decode()
# the UI font (Figtree, SIL OFL 1.1, fonts/OFL.txt) is built in, so the app asks no other site for anything
fonts = ''.join("@font-face{font-family:'Figtree';font-style:normal;font-display:swap;font-weight:%d;src:url(data:font/woff2;base64,%s) format('woff2')}\n" % (w, base64.b64encode((root / ('fonts/figtree-latin-%d-normal.woff2' % w)).read_bytes()).decode()) for w in (300, 400, 500, 600, 700))
for marker, value in [('/*@FONTS@*/', fonts), ('/*@MODEL@*/', model), ('/*@HOST@*/', host), ('"@HOST_SRC@"', json.dumps(host)), ('@WASM_B64@', wasm), ('/*@CONTROLS@*/', controls), ('/*@VIEWS@*/', views)]:
    assert app.count(marker) == 1, marker
    app = app.replace(marker, value)
assert '</script' not in host and '</script' not in model
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/trackfill.html').write_text(app)
print('dist/trackfill.html', len(app) // 1024, 'KB')

# ---------- the self-hosted web app (GitHub Pages or any https host): a real page with a manifest, icons and an offline cache ----------
import hashlib, shutil, subprocess
web = root / 'dist/web'; web.mkdir(parents=True, exist_ok=True)
cut = app.index('</style>') + len('</style>')
head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Trackfill">
<meta name="theme-color" content="#1c1c1f">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-192.png">
"""
# Updates: on every launch the app asks for the newest version. When one arrives it switches over straight away if you haven't
# started working yet (first 20 s, nothing playing, work saved first); otherwise it says so and the next launch uses it.
sw = """<script>
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const had = !!navigator.serviceWorker.controller, t0 = Date.now();
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had) return;
    if (Date.now() - t0 < 20000 && !T.playing && !UI.sheet) { try { saveNow(); } catch (e) {} toast('Updating Trackfill…'); setTimeout(() => location.reload(), 700); }
    else toast('An update is ready: close and reopen Trackfill to use it');
  });
}
</script>"""
page = head + app[:cut] + '\n<style>html{margin:0;height:100%;background:#0b0b0c}body{margin:0;height:100%;background:#1c1c1f}</style>\n</head>\n<body>\n' + app[cut:] + '\n' + sw + '\n</body>\n</html>\n'
# a content security policy: only this page's own scripts run (by hash), and the page can reach nothing but its own site. If a name or a
# shared project ever slipped markup past the escaping, it could neither run nor send anything anywhere.
import re as _re
hashes = ' '.join("'sha256-%s'" % base64.b64encode(hashlib.sha256(m.encode()).digest()).decode() for m in _re.findall(r'<script>(.*?)</script>', page, _re.S))
csp = ("default-src 'self'; script-src 'self' %s 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src data:; "
       "img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'") % hashes
page = page.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="%s">' % csp, 1)
build = hashlib.sha1(page.encode()).hexdigest()[:10]   # changes whenever the page does, so phones see sw.js change and update
(web / 'index.html').write_text(page)
shutil.copy(root / 'web/manifest.webmanifest', web)
(web / 'sw.js').write_text((root / 'web/sw.js').read_text().replace('@BUILD@', build))
if not (web / 'icon-512.png').exists() or (root / 'web/icons.py').stat().st_mtime > (web / 'icon-512.png').stat().st_mtime:
    subprocess.run(['python3', str(root / 'web/icons.py'), str(web)], check=True)
print('dist/web ready, build', build)
