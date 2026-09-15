import json
import sys
from PIL import Image

image = Image.open(sys.argv[1]).convert('RGB')
width, height = image.size
baseline = round(height * 0.415)
centers = [round(width * ratio) for ratio in (0.189, 0.251, 0.314, 0.377, 0.440, 0.503, 0.591)]
values = []

for x in centers:
    best = None
    for column in range(max(0, x - 4), min(width, x + 5)):
        runs = []
        start = None
        for y in range(round(height * 0.12), baseline + 2):
            r, g, b = image.getpixel((column, y))
            filled = (r < 90 and g < 110 and b < 110) or (g > 100 and g > r * 1.2 and g > b * 1.05)
            if filled and start is None:
                start = y
            elif not filled and start is not None:
                if y - start > 25:
                    runs.append((start, y - 1))
                start = None
        if start is not None and baseline + 1 - start > 25:
            runs.append((start, baseline))
        for start, end in runs:
            if end >= baseline - 3:
                candidate = start
                if best is None or candidate < best:
                    best = candidate
    if best is None:
        values.append(None)
    else:
        # Calibrated to the 0..176 kWh axis in ENEL's consumption chart.
        value = round((baseline - best) * 1.77)
        values.append(value)

print(json.dumps(values, ensure_ascii=False))
