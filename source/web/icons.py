"""Home-screen icons: the 4x4 pad grid with lit strips, one pad lit amber, on the charcoal body."""
import sys
from PIL import Image, ImageDraw
COLS = ['#e8916c', '#e6c162', '#a3d27d', '#6fcac1', '#78a9ea', '#ab8ee8', '#e486bb', '#cdbda8']
def icon(n, path):
    S = 4; N = n * S; im = Image.new('RGB', (N, N), '#1c1c1f'); d = ImageDraw.Draw(im)
    m = N * .17; g = N * .035; cell = (N - 2 * m - 3 * g) / 4
    for r in range(4):
        for c in range(4):
            x = m + c * (cell + g); y = m + r * (cell + g); k = r * 4 + c; lit = (r, c) == (3, 0)
            d.rounded_rectangle([x, y + N * .012, x + cell, y + cell + N * .012], radius=N * .012, fill='#050506')
            d.rounded_rectangle([x, y, x + cell, y + cell], radius=N * .012, fill='#3a3a40' if lit else '#2c2c31')
            col = '#f2b84b' if lit else COLS[k % 8]
            sx = cell * .14; d.rounded_rectangle([x + sx, y + cell * .72, x + cell - sx, y + cell * .82], radius=N * .004, fill=col if lit or k % 3 == 0 else '#4a4a50')
    im.resize((n, n), Image.LANCZOS).save(path)
for n in (180, 192, 512): icon(n, f'{sys.argv[1]}/icon-{n}.png')
