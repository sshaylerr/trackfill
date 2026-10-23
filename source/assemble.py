"""Assemble dist/trackfill.html: inline the model, the engine host (twice: page + worklet) and the WASM binary."""
import base64, json, pathlib
root = pathlib.Path(__file__).parent
app = (root / 'app.html').read_text()
model = (root / 'js/model.js').read_text() + '\n' + (root / 'js/harmony.js').read_text().replace("'use strict';", '', 1) + '\n' + (root / 'js/synthpresets.js').read_text().replace("'use strict';", '', 1) + '\n' + (root / 'js/wavetables.js').read_text().replace("'use strict';", '', 1) + '\n' + (root / 'js/drums.js').read_text().replace("'use strict';", '', 1)
host = (root / 'js/host.js').read_text()
controls = (root / 'ui/controls.js').read_text()
views = (root / 'ui/views.js').read_text() + '\n' + (root / 'ui/chop.js').read_text() + '\n' + (root / 'ui/scope.js').read_text() + '\n' + (root / 'ui/fxvis.js').read_text() + '\n' + (root / 'ui/devices.js').read_text() + '\n' + (root / 'ui/keys.js').read_text() + '\n' + (root / 'ui/edit.js').read_text() + '\n' + (root / 'ui/synth.js').read_text() + '\n' + (root / 'ui/drums.js').read_text()
wasm = base64.b64encode((root / 'build/engine.wasm').read_bytes()).decode()
for marker, value in [('/*@MODEL@*/', model), ('/*@HOST@*/', host), ('"@HOST_SRC@"', json.dumps(host)), ('@WASM_B64@', wasm), ('/*@CONTROLS@*/', controls), ('/*@VIEWS@*/', views)]:
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
page = head + app[:cut] + '\n<style>html,body{margin:0;height:100%;background:#1c1c1f}</style>\n</head>\n<body>\n' + app[cut:] + '\n' + sw + '\n</body>\n</html>\n'
build = hashlib.sha1(page.encode()).hexdigest()[:10]   # changes whenever the page does, so phones see sw.js change and update
(web / 'index.html').write_text(page)
shutil.copy(root / 'web/manifest.webmanifest', web)
(web / 'sw.js').write_text((root / 'web/sw.js').read_text().replace('@BUILD@', build))
if not (web / 'icon-512.png').exists() or (root / 'web/icons.py').stat().st_mtime > (web / 'icon-512.png').stat().st_mtime:
    subprocess.run(['python3', str(root / 'web/icons.py'), str(web)], check=True)
print('dist/web ready, build', build)
