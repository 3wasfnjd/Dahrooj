#!/usr/bin/env python3
"""Fetch the approved track from its author; create a quiet, first-party MP3."""
import hashlib, json, math, os, re, subprocess, tempfile, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/audio'
SOURCE = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3'
SOURCE_PAGE = 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037'
LICENSE = 'https://creativecommons.org/licenses/by/4.0/'
def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent':'Dahrooj asset preparation (credited CC BY 4.0 music)'})
    with urllib.request.urlopen(req, timeout=90) as response:
        data = response.read(25_000_000)
        assert len(data) < 25_000_000, 'Unexpectedly large response'
        return data

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def probe(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)]))
def level(path):
    result = subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af','volumedetect','-f','null','-'], capture_output=True, text=True, check=True)
    return {name:float(re.search(name+r':\s*(-?[\d.]+) dB',result.stderr).group(1)) for name in ['mean_volume','max_volume']}

OUT.mkdir(parents=True, exist_ok=True)
manifest_path = OUT / 'manifest.json'
track = OUT / 'carefree-quiet.mp3'
if track.exists() and manifest_path.exists():
    manifest = json.loads(manifest_path.read_text())
    assert sha(track) == manifest['output_sha256'], 'Music integrity mismatch'
else:
    with tempfile.TemporaryDirectory() as temp:
        original = Path(temp) / 'Carefree.mp3'
        original.write_bytes(fetch(SOURCE))
        info = probe(original)
        duration = float(info['format']['duration'])
        assert 200 < duration < 210, f'Unexpected track duration: {duration}'
        tags = {k.lower():v for k,v in info['format'].get('tags',{}).items()}
        if 'title' in tags: assert tags['title'].strip().lower() == 'carefree', tags
        command = ['ffmpeg','-y','-v','error','-i',str(original),'-map','0:a:0','-vn','-af','volume=0.12','-c:a','libmp3lame','-b:a','96k','-ar','44100','-ac','2','-map_metadata','-1','-metadata','title=Carefree','-metadata','artist=Kevin MacLeod','-metadata','copyright=Kevin MacLeod; licensed CC BY 4.0','-metadata','comment='+SOURCE_PAGE+' | '+LICENSE+' | Re-encoded and attenuated -18.42 dB for Dahrooj',str(track)]
        subprocess.run(command, check=True)
        original_level, quiet_level = level(original), level(track)
        delta = quiet_level['mean_volume'] - original_level['mean_volume']
        assert -19 < delta < -18, f'Unexpected attenuation: {delta}'
        assert quiet_level['max_volume'] < -17, 'Music should remain quiet even at element volume=1'
        manifest = {'title':'Carefree','artist':'Kevin MacLeod','isrc':'USUAN1400037','source_url':SOURCE,'source_page':SOURCE_PAGE,'license':'CC BY 4.0','license_url':LICENSE,'source_sha256':sha(original),'output_sha256':sha(track),'source_bytes':original.stat().st_size,'output_bytes':track.stat().st_size,'duration_seconds':float(probe(track)['format']['duration']),'encoding':'MP3 96 kb/s, 44.1 kHz stereo','amplitude_multiplier':0.12,'attenuation_db':round(20*math.log10(.12),3),'original_level_dbfs':original_level,'output_level_dbfs':quiet_level,'changes':'Whole track retained; re-encoded and reduced in level for background playback. No endorsement implied.'}
        manifest_path.write_text(json.dumps(manifest, indent=2)+'\n')
if not (OUT/'CC-BY-4.0.txt').exists():
    (OUT/'CC-BY-4.0.txt').write_bytes(fetch(LICENSE+'legalcode.txt'))
assert 'Attribution 4.0' in (OUT/'CC-BY-4.0.txt').read_text()
index = ROOT/'index.html'
html = index.read_text()
tag = '<script defer src="./assets/audio/background-music.js"></script>\n'
if tag not in html:
    assert html.count('</head>') == 1
    index.write_text(html.replace('</head>', tag+'</head>', 1))
# The existing startup test now serves the optional audio with its correct MIME.
test = ROOT/'tools/test-startup.mjs'
s = test.read_text()
if "'.mp3':'audio/mpeg'" not in s:
    s = s.replace("const mime = { ", "const mime = { '.mp3':'audio/mpeg', ", 1)
    s = s.replace('Original font weights, unicode ranges, font-display and UI styles remain unchanged.', 'Original font weights, unicode ranges and font-display remain unchanged. The optional music controller adds a music-only toggle and credit link; the music is not a startup requirement.')
    test.write_text(s)
readme = ROOT/'README.md'
if '## موسيقى الخلفية' not in readme.read_text():
    with readme.open('a') as f:
        f.write('\n## موسيقى الخلفية\n\nCarefree — Kevin MacLeod (incompetech.com)، بترخيص CC BY 4.0. [المصدر](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037) · [الترخيص](https://creativecommons.org/licenses/by/4.0/) · [تفاصيل الحقوق والتعديلات](assets/audio/credits.html).\n\nالمقطع الكامل مضغوط MP3 بصوت مخفّض إلى 0.12 من سعة الإشارة الأصلية (حوالي ‎-18.42 dB). يبدأ التحميل بعد تفاعل اللاعب فقط، ويعمل بالتكرار مع زر كتم مستقل وحفظ الاختيار. يتوقف عند إخفاء الصفحة ويستأنف عند الرجوع إن سمح المتصفح. مؤثرات اللعبة وسلسلة Web Audio الخاصة بها لم تتغير. تعذر الموسيقى لا يمنع اللعب.\n')
license_file = ROOT/'LICENSE'
if 'Carefree' not in license_file.read_text():
    with license_file.open('a') as f:
        f.write('\nThird-party music exception:\nCarefree by Kevin MacLeod (incompetech.com), ISRC USUAN1400037, is licensed independently under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . The Aboden Games conditions above do NOT apply to this music. See assets/audio/credits.html and assets/audio/CC-BY-4.0.txt for attribution, source and modifications.\n')
print(json.dumps(manifest, indent=2))
