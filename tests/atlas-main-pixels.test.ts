import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';

const MAIN = 'be2b4cb';

describe('atlas frames vs main', () => {
  it('keeps every unchanged sheet frame pixel-identical to main', () => {
    const script = `
import json, subprocess, re, sys
from io import BytesIO
from PIL import Image

MAIN = '${MAIN}'
ALLOW = re.compile(r'slime|chest|rubble|dust_burst')

def show(rev, path):
    return subprocess.check_output(['git', 'show', f'{rev}:{path}'])

def frames(js, im):
    out = {}
    for k, f in js['frames'].items():
        crop = im.crop((f['x'], f['y'], f['x']+f['w'], f['y']+f['h']))
        out[k] = crop.tobytes()
    return out

def load_rev(rev, name):
    js = json.loads(show(rev, f'public/art/atlas/{name}.json'))
    im = Image.open(BytesIO(show(rev, f'public/art/atlas/{name}.png'))).convert('RGBA')
    return frames(js, im)

def load_wt(name):
    js = json.load(open(f'public/art/atlas/{name}.json'))
    im = Image.open(f'public/art/atlas/{name}.png').convert('RGBA')
    return frames(js, im)

bad = []
new_unexpected = []
for name in ['ui', 'fx', 'props', 'monsters']:
    mf = load_rev(MAIN, name)
    cf = load_wt(name)
    for k in sorted(set(mf) & set(cf)):
        if mf[k] != cf[k] and not ALLOW.search(k):
            bad.append(f'{name}:{k}')
    for k in sorted(set(cf) - set(mf)):
        if not ALLOW.search(k):
            new_unexpected.append(f'{name}:{k}')
if bad or new_unexpected:
    print('differ', *bad, sep='\\n')
    print('new', *new_unexpected, sep='\\n')
    sys.exit(1)
`;
    try {
      execFileSync('python3', ['-c', script], { encoding: 'utf8' });
    } catch (err) {
      const out =
        err && typeof err === 'object' && 'stdout' in err ? String((err as { stdout: string }).stdout) : String(err);
      expect.fail(out || 'atlas frames drifted from main');
    }
  });
});
