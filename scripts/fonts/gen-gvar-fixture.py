# Regenerates src/fonts/__tests__/fixtures/gvar-outlines.json: glyph outlines of the bundled variable
# fonts at fixed weights, instantiated by fontTools (the reference implementation), for the tests
# of src/fonts/gvar.ts.   python3 -I scripts/fonts/gen-gvar-fixture.py   (needs fonttools)
import json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import RecordingPen

ROOT = 'src/fonts/files/'
CASES = {
    'inter-variable': {'chars': 'D,Jj~ÁÃçõÐĆ', 'locations': [{'opsz': 14, 'wght': 400}, {'opsz': 28, 'wght': 600}, {'opsz': 32, 'wght': 700}, {'opsz': 20.3, 'wght': 380}]},
    'lora-variable': {'chars': 'Dő', 'locations': [{'wght': 700}, {'wght': 505}]},
    'montserrat-variable': {'chars': 'DÃ,', 'locations': [{'wght': 300}, {'wght': 800}]},
}

out = {}
for font, case in CASES.items():
    for loc in case['locations']:
        inst = instantiateVariableFont(TTFont(ROOT + font + '.ttf'), loc)
        cmap = inst.getBestCmap()
        gs = inst.getGlyphSet()
        for ch in case['chars']:
            name = cmap[ord(ch)]
            pen = RecordingPen()
            gs[name].draw(pen)
            # Points of every contour (on and off curve) as fontTools flattens them: use the glyf coordinates.
            g = inst['glyf'][name]
            coords, ends, flags = g.getCoordinates(inst['glyf'])
            key = f'{font}|{json.dumps(loc, sort_keys=True)}|{ch}'
            out[key] = {'coords': [[round(x, 2), round(y, 2)] for x, y in coords], 'ends': list(ends), 'on': [bool(f & 1) for f in flags], 'advance': inst['hmtx'][name][0]}
json.dump(out, open('src/fonts/__tests__/fixtures/gvar-outlines.json', 'w'), separators=(',', ':'))
print(len(out), 'glyph instances')
