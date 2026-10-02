#!/usr/bin/env python3
"""Prepare the approved, quiet 30-second Carefree excerpt; never alter game/SFX code."""
import hashlib, json, math, re, subprocess, tempfile, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/audio'
SOURCE = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3'
SOURCE_PAGE = 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037'
SOURCE_SHA = '8433b770a630d9b1594fd484442c677907ece899a4d149954cd2e74fd733e311'
LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/'
EDITION = 'excerpt-30s-mono-v2'
def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent':'Dahrooj credited music asset preparation'})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read(25_000_000)
        assert len(data) < 25_000_000, 'Unexpectedly large response'
        return data

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def run(args): return subprocess.check_output(args, timeout=90)
def probe(path): return json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)]))
def level(path):
    result = subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af','volumedetect','-f','null','-'], capture_output=True, text=True, check=True, timeout=90)
    return {key:float(re.search(key+r':\s*(-?[\d.]+) dB',result.stderr).group(1)) for key in ['mean_volume','max_volume']}

OUT.mkdir(parents=True, exist_ok=True)
manifest_path, track = OUT/'manifest.json', OUT/'carefree-quiet.mp3'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
if track.exists() and manifest.get('edition') == EDITION:
    assert sha(track) == manifest['output_sha256'], 'Music integrity mismatch'
else:
    with tempfile.TemporaryDirectory() as temp:
        original, excerpt = Path(temp)/'Carefree.mp3', Path(temp)/'excerpt.wav'
        original.write_bytes(fetch(SOURCE))
        assert sha(original) == SOURCE_SHA, 'Author asset changed; review before replacing'
        assert 200 < float(probe(original)['format']['duration']) < 210
        run(['ffmpeg','-y','-v','error','-ss','20','-i',str(original),'-t','30','-map','0:a:0','-vn','-ac','1','-ar','44100','-c:a','pcm_s16le',str(excerpt)])
        run(['ffmpeg','-y','-v','error','-i',str(excerpt),'-af','volume=0.18,afade=t=in:st=0:d=0.12,afade=t=out:st=29.65:d=0.35','-c:a','libmp3lame','-b:a','64k','-ac','1','-ar','44100','-map_metadata','-1','-metadata','title=Carefree (30-second excerpt)','-metadata','artist=Kevin MacLeod','-metadata','copyright=Kevin MacLeod; CC BY 4.0','-metadata','comment='+SOURCE_PAGE+' | '+LICENSE_URL+' | Excerpt 20-50s, mono, quiet, short edge fades',str(track)])
        original_level, quiet_level = level(excerpt), level(track)
        delta = quiet_level['mean_volume'] - original_level['mean_volume']
        assert -16 < delta < -14.5, f'Unexpected attenuation: {delta}'
        assert quiet_level['max_volume'] < -16
        info = probe(track)
        assert 30 <= float(info['format']['duration']) < 30.2
        assert info['streams'][0]['channels'] == 1
        assert track.stat().st_size < 250_000
        manifest = {'edition':EDITION,'title':'Carefree','artist':'Kevin MacLeod','isrc':'USUAN1400037','source_url':SOURCE,'source_page':SOURCE_PAGE,'license':'CC BY 4.0','license_url':LICENSE_URL,'source_sha256':SOURCE_SHA,'output_sha256':sha(track),'source_bytes':original.stat().st_size,'output_bytes':track.stat().st_size,'excerpt_start_seconds':20,'excerpt_length_seconds':30,'duration_seconds':float(info['format']['duration']),'encoding':'MP3 64 kb/s, 44.1 kHz mono','amplitude_multiplier':0.18,'attenuation_db':round(20*math.log10(.18),3),'reference_excerpt_level_dbfs':original_level,'output_level_dbfs':quiet_level,'changes':'30-second excerpt from 00:20 to 00:50; downmixed to mono, re-encoded, attenuated, and given 0.12s/0.35s edge fades. No endorsement implied.'}
        manifest_path.write_text(json.dumps(manifest, indent=2)+'\n')
if not (OUT/'CC-BY-4.0.txt').exists():
    (OUT/'CC-BY-4.0.txt').write_bytes(fetch(LICENSE_URL+'legalcode.txt'))
assert 'Attribution 4.0' in (OUT/'CC-BY-4.0.txt').read_text()
index = ROOT/'index.html'
html = index.read_text()
tag = '<script defer src="./assets/audio/background-music.js"></script>\n'
if tag not in html:
    assert html.count('</head>') == 1
    index.write_text(html.replace('</head>',tag+'</head>',1))
readme = ROOT/'README.md'
section = '\n## موسيقى الخلفية\n\nCarefree — Kevin MacLeod (incompetech.com)، بترخيص CC BY 4.0. [المصدر](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037) · [الترخيص](https://creativecommons.org/licenses/by/4.0/) · [تفاصيل الحقوق والتعديلات](assets/audio/credits.html).\n\nمقتطف مدته ٣٠ ثانية (من 00:20 إلى 00:50)، MP3 أحادي القناة 64 kb/s، حجمه أقل من ٢٥٠ كيلوبايت. خُفِّض الصوت وأضيف تدرّج قصير عند الطرفين. يبدأ التحميل بعد تفاعل اللاعب فقط، ويتكرر مع زر تشغيل/كتم مستقل وحفظ الاختيار. يتوقف عند إخفاء الصفحة ويستأنف عند الرجوع إن سمح المتصفح. مؤثرات اللعبة وسلسلة Web Audio الخاصة بها لم تتغير. تعذر الموسيقى لا يمنع اللعب.\n'
text = readme.read_text()
text = re.sub(r'(?ms)\n## موسيقى الخلفية\n.*?(?=\n## |\Z)',lambda _:section,text) if '\n## موسيقى الخلفية\n' in text else text+section
readme.write_text(text)
license_file = ROOT/'LICENSE'
if 'Carefree' not in license_file.read_text():
    with license_file.open('a') as f:
        f.write('\nThird-party music exception:\nCarefree by Kevin MacLeod (incompetech.com), ISRC USUAN1400037, is licensed independently under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . The Aboden Games conditions above do NOT apply to this music. See assets/audio/credits.html and assets/audio/CC-BY-4.0.txt for attribution, source and modifications.\n')
print(json.dumps(manifest, indent=2))
