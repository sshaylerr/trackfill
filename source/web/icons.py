"""Home-screen icons, drawn like the iPhone's own dark-mode icons: a near-black body that lifts slightly at the top, and one simple glyph
(a 3x3 grid of pads, one lit amber with a soft glow) sitting in the middle at about the size the system's glyphs are."""
import sys
from PIL import Image, ImageDraw, ImageFilter
def icon(n, path):
    S = 4; N = n * S
    im = Image.new('RGB', (N, N))
    top, bot = (0x2a, 0x2a, 0x2e), (0x0c, 0x0c, 0x0e)
    px = im.load()
    for y in range(N):
        t = y / (N - 1); c = tuple(round(top[i] + (bot[i] - top[i]) * t ** 0.8) for i in range(3))
        for x in range(N): px[x, y] = c
    g = N * .56; cell = g * .29; gap = (g - 3 * cell) / 2; x0 = (N - g) / 2; y0 = (N - g) / 2; r = cell * .22
    lit = (2, 0)   # bottom left, like the first pad of a bank
    # glow under the lit pad
    glow = Image.new('L', (N, N), 0); gd = ImageDraw.Draw(glow)
    lx = x0 + lit[1] * (cell + gap); ly = y0 + lit[0] * (cell + gap); gd.rounded_rectangle([lx, ly, lx + cell, ly + cell], radius=r, fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(N * .045))
    amber = Image.new('RGB', (N, N), (0xf2, 0xb8, 0x4b)); im = Image.composite(amber, im, glow.point(lambda v: int(v * .55)))
    d = ImageDraw.Draw(im)
    for rr in range(3):
        for cc in range(3):
            x = x0 + cc * (cell + gap); y = y0 + rr * (cell + gap)
            if (rr, cc) == lit: d.rounded_rectangle([x, y, x + cell, y + cell], radius=r, fill=(0xf2, 0xb8, 0x4b))
            else: d.rounded_rectangle([x, y, x + cell, y + cell], radius=r, fill=(0x3b, 0x3b, 0x40))
    im.resize((n, n), Image.LANCZOS).save(path)
for n in (180, 192, 512): icon(n, f'{sys.argv[1]}/icon-{n}.png')
