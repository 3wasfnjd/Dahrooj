#!/usr/bin/env python3
"""One-time vendoring of the existing startup assets; later runs verify hashes only."""
import hashlib
import json
import re
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = '4001baefa83897212d481d0ad5d7a29b461d6b9d'
UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) '
      'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')
MANIFEST = ROOT / 'vendor/manifest.json'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def download(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=45) as response:
                if response.status != 200:
                    raise RuntimeError(f'HTTP {response.status}: {url}')
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)

def main():
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
        for item in manifest['assets']:
            data = (ROOT / item['path']).read_bytes()
            assert digest(data) == item['sha256'], item['path']
            assert len(data) == item['bytes'], item['path']
        print('PASS: all vendored asset hashes and sizes verified; no network used.')
        return

    before = (ROOT / 'index.html').read_text()
    baseline = subprocess.check_output(['git', 'show', BASE + ':index.html'], cwd=ROOT).decode()
    assert before == baseline, 'Refusing to patch an unexpected game revision.'
    assets = []
    def save(path, data, source):
        target = ROOT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        assets.append({'path': path, 'source_url': source, 'bytes': len(data), 'sha256': digest(data)})

    three_url = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
    three = download(three_url)
    assert 500000 < len(three) < 1000000 and b'128' in three
    save('vendor/three/three-r128.min.js', three, three_url)
    license_url = 'https://raw.githubusercontent.com/mrdoob/three.js/r128/LICENSE'
    license_data = download(license_url)
    assert b'MIT License' in license_data
    save('vendor/three/LICENSE', license_data, license_url)

    font_url = re.search(r'<link rel="stylesheet" href="(https://fonts.googleapis.com/[^\"]+)">', before).group(1)
    original_css = download(font_url).decode()
    assert "font-display: swap" in original_css and "format('woff2')" in original_css
    local_css = original_css
    urls = list(dict.fromkeys(re.findall(r'url\((https://fonts.gstatic.com/[^)]+)\)', original_css)))
    assert urls, 'No WOFF2 URLs found.'
    for url in urls:
        data = download(url)
        assert data[:4] == b'wOF2', url
        name = 'font-' + digest(data)[:16] + '.woff2'
        path = 'vendor/fonts/' + name
        if not any(item['path'] == path for item in assets):
            save(path, data, url)
        else:
            assets.append({'path': path, 'source_url': url, 'bytes': len(data), 'sha256': digest(data)})
        local_css = local_css.replace(url, './' + name)
    assert 'https://' not in local_css and '@import' not in local_css
    save('vendor/fonts/fonts.css', local_css.encode(), font_url)
    # Test-only source fixture: never referenced by the game.
    fixture = ROOT / 'tools/fixtures/fonts-before.css'
    fixture.parent.mkdir(parents=True, exist_ok=True)
    fixture.write_text(original_css)
    for family in ['grandstander', 'baloobhaijaan2']:
        url = f'https://raw.githubusercontent.com/google/fonts/main/ofl/{family}/OFL.txt'
        data = download(url)
        assert b'SIL OPEN FONT LICENSE' in data
        save(f'vendor/fonts/{family}-OFL.txt', data, url)

    old_loader = "function loadScript(src){ return new Promise((ok,no)=>{ const s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=no; document.head.appendChild(s); }); }"
    new_loader = """function loadScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    let settled=false;
    const finish=error=>{
      if(settled) return; settled=true; clearTimeout(timer);
      s.onload=s.onerror=null;
      if(error){ s.remove(); reject(error); } else resolve();
    };
    const timer=setTimeout(()=>finish(new Error('Optional visit counter timed out')),8000);
    s.async=true; s.src=src;
    s.onload=()=>finish();
    s.onerror=()=>finish(new Error('Optional visit counter unavailable'));
    document.head.appendChild(s);
  });
}"""
    deferred = """requestAnimationFrame(frame);
// Optional analytics starts only after the first game frame, never in its critical path.
requestAnimationFrame(()=>{
  const startCounter=()=>{ void initVisits(); };
  if('requestIdleCallback' in window) window.requestIdleCallback(startCounter,{timeout:2000});
  else setTimeout(startCounter,250);
});
setTimeout(()=>showTitle('Dahrooj'),250);"""
    edits = [
        ('<link rel="preconnect" href="https://fonts.googleapis.com">\n', ''),
        (f'<link rel="stylesheet" href="{font_url}">', '<link rel="stylesheet" href="./vendor/fonts/fonts.css">'),
        (f'<script src="{three_url}"></script>', '<script src="./vendor/three/three-r128.min.js"></script>'),
        (old_loader, new_loader),
        ('async function initVisits(){\n  setVisits(null);', 'async function initVisits(){\n  if(navigator.onLine===false) return;\n  setVisits(null);'),
        ('\ninitVisits();\n', '\n// initVisits is scheduled after the first rendered game frame below.\n'),
        ("requestAnimationFrame(frame);\nsetTimeout(()=>showTitle('Dahrooj'),250);", deferred),
    ]
    after = before
    for old, new in edits:
        assert after.count(old) == 1, 'Patch anchor missing or ambiguous: ' + old[:70]
        after = after.replace(old, new, 1)
    # Independently verify that both gameplay sections are byte-identical.
    counter_marker = '/* ---------- shared visit counter'
    modes_marker = '/* ---------- modes ---------- */'
    assert before.split('<script>\n', 1)[1].split(counter_marker)[0] == after.split('<script>\n', 1)[1].split(counter_marker)[0]
    assert before.split(modes_marker)[1].split('requestAnimationFrame(frame);\nsetTimeout')[0] == after.split(modes_marker)[1].split('requestAnimationFrame(frame);\n// Optional analytics')[0]
    (ROOT / 'index.html').write_text(after)
    (ROOT / '.nojekyll').touch()
    readme = (ROOT / 'README.md').read_text()
    old = 'افتح `index.html` في المتصفح. ملف واحد، والمكتبة الوحيدة three.js (r128) من cdnjs.'
    new = ('انشر محتويات المستودع كاملة أو شغّلها بخادم ملفات ثابت. `index.html` يستخدم '
           'Three.js r128 والخطوط من مجلد `vendor/` المحلي، ولا يحتاج مواقع طرف ثالث لبدء اللعب. '
           'لا تنقل ملف HTML وحده. مثال للتجربة: `python3 -m http.server 8000`.\n\n'
           'Firebase اختياري لعدّاد الزيارات فقط؛ فشل الاتصال لا يوقف اللعبة. لا يوجد Service Worker '
           'ولا ضمان لتشغيل الموقع دون إنترنت بعد إغلاقه. ملف `.nojekyll` يبقي ملفات vendor متاحة على GitHub Pages.\n\n'
           'تراخيص المكتبة والخطوط ومصادرها في [vendor/README.md](vendor/README.md). '
           'نتائج فحص الجوال وقياس حجم البدء في [docs/startup-report.md](docs/startup-report.md).')
    assert old in readme
    (ROOT / 'README.md').write_text(readme.replace(old, new))
    (ROOT / 'vendor/README.md').write_text('''# Local runtime dependencies\n\n- `three/three-r128.min.js`: the unchanged Three.js r128 build previously loaded from cdnjs; MIT license in `three/LICENSE`. No engine upgrade.\n- `fonts/fonts.css` and content-addressed WOFF2 files: the same Google Fonts families, requested weights, unicode ranges, and `font-display: swap` behavior. Fonts are downloaded unchanged, not subsetted or renamed internally. Duplicate URLs share a local file. Grandstander and Baloo Bhaijaan 2 use the accompanying SIL Open Font License files.\n- `manifest.json` records each original URL, byte length, and SHA-256 checksum. These third-party files retain their own licenses; the repository's game license does not replace them.\n\nKeep this directory with `index.html` when deploying, including under a subpath such as `/Dahrooj/`. Keep `.nojekyll` for GitHub Pages. No CDN, Google Fonts service, npm install, or build step is needed by players. Firebase 10.12.2 remains remote and optional for the visit counter only.\n\n`python3 tools/vendor-startup.py` verifies the pinned files offline on subsequent runs; it does not silently update them. The source-font CSS in `tools/fixtures/` is solely a before/after test fixture and is not loaded by the game.\n''')
    manifest = {'baseline_commit': BASE, 'font_request_user_agent': UA, 'font_css_url': font_url,
                'three_version': 'r128', 'gameplay_sections_unchanged': True,
                'assets': assets}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'PASS: vendored {len(assets)} asset records; gameplay and rendering sections unchanged.')

if __name__ == '__main__':
    main()
