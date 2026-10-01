"""Placeholder art for merge themes. Replace the PNGs; keep the file names."""

import math
import struct
import zlib
from pathlib import Path


def write_png(path, width, height, rgba):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(png)


class Raster:
    def __init__(self, width, height):
        self.w = width
        self.h = height
        self.buf = bytearray(width * height * 4)

    def blend(self, x, y, color):
        if x < 0 or y < 0 or x >= self.w or y >= self.h:
            return
        r, g, b, a = color
        if a <= 0:
            return
        i = (y * self.w + x) * 4
        if a >= 255:
            self.buf[i:i + 4] = bytes((r, g, b, 255))
            return
        src_a = a / 255
        dst_a = self.buf[i + 3] / 255
        out_a = src_a + dst_a * (1 - src_a)
        if out_a <= 0:
            return
        for channel, value in enumerate((r, g, b)):
            dst = self.buf[i + channel]
            self.buf[i + channel] = int((value * src_a + dst * dst_a * (1 - src_a)) / out_a)
        self.buf[i + 3] = int(out_a * 255)

    def fill(self, color):
        pixel = bytes(color)
        self.buf[:] = pixel * (self.w * self.h)

    def vertical_gradient(self, top, bottom):
        for y in range(self.h):
            t = y / max(1, self.h - 1)
            color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(4))
            row = bytes(color) * self.w
            start = y * self.w * 4
            self.buf[start:start + self.w * 4] = row

    def ellipse(self, cx, cy, rx, ry, color, rot=0):
        if rx <= 0 or ry <= 0:
            return
        cos = math.cos(rot)
        sin = math.sin(rot)
        reach = int(max(rx, ry)) + 2
        for y in range(int(cy - reach), int(cy + reach) + 1):
            for x in range(int(cx - reach), int(cx + reach) + 1):
                dx = x + 0.5 - cx
                dy = y + 0.5 - cy
                lx = dx * cos + dy * sin
                ly = -dx * sin + dy * cos
                value = (lx / rx) ** 2 + (ly / ry) ** 2
                if value <= 1:
                    edge = max(0, min(1, (1.08 - value) / 0.12))
                    self.blend(x, y, (color[0], color[1], color[2], int(color[3] * edge)))

    def circle(self, cx, cy, radius, color):
        self.ellipse(cx, cy, radius, radius, color)

    def round_rect(self, x, y, w, h, radius, color):
        radius = min(radius, w / 2, h / 2)
        self.ellipse(x + radius, y + radius, radius, radius, color)
        self.ellipse(x + w - radius, y + radius, radius, radius, color)
        self.ellipse(x + radius, y + h - radius, radius, radius, color)
        self.ellipse(x + w - radius, y + h - radius, radius, radius, color)
        for py in range(int(y), int(y + h) + 1):
            for px in range(int(x + radius), int(x + w - radius) + 1):
                self.blend(px, py, color)
        for py in range(int(y + radius), int(y + h - radius) + 1):
            for px in range(int(x), int(x + w) + 1):
                self.blend(px, py, color)

    def polygon(self, points, color):
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        min_x, max_x = int(min(xs)) - 1, int(max(xs)) + 1
        min_y, max_y = int(min(ys)) - 1, int(max(ys)) + 1
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                if point_in_poly(x + 0.5, y + 0.5, points):
                    self.blend(x, y, color)


def point_in_poly(x, y, points):
    inside = False
    j = len(points) - 1
    for i, (xi, yi) in enumerate(points):
        xj, yj = points[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def save(raster, path):
    write_png(path, raster.w, raster.h, raster.buf)


def garden_background():
    image = Raster(540, 960)
    image.vertical_gradient((186, 224, 255, 255), (210, 236, 170, 255))
    image.circle(400, 150, 58, (255, 236, 150, 255))
    image.circle(400, 150, 78, (255, 244, 190, 90))
    image.ellipse(160, 760, 280, 150, (126, 196, 92, 255))
    image.ellipse(430, 820, 260, 160, (78, 168, 86, 255))
    image.ellipse(270, 900, 340, 120, (48, 140, 72, 255))
    return image


def hue_shift(color, amount):
    r, g, b, a = color
    # Rough rotation in RGB, enough to separate generated themes.
    turns = (amount % 360) / 120
    channels = [r, g, b]
    shift = int(turns) % 3
    channels = channels[shift:] + channels[:shift]
    return (channels[0], channels[1], channels[2], a)


def draw_garden_item(tier):
    image = Raster(128, 128)
    if tier == 1:
        image.ellipse(64, 70, 26, 34, (140, 86, 42, 255))
        image.ellipse(52, 56, 10, 6, (196, 150, 86, 220))
    elif tier == 2:
        image.ellipse(64, 96, 22, 10, (112, 74, 40, 255))
        image.round_rect(60, 58, 8, 36, 3, (72, 150, 64, 255))
        image.ellipse(48, 62, 16, 9, (86, 184, 78, 255), rot=-0.6)
        image.ellipse(82, 60, 16, 9, (64, 168, 70, 255), rot=0.5)
    elif tier == 3:
        image.circle(48, 74, 24, (62, 158, 68, 255))
        image.circle(80, 72, 26, (46, 140, 62, 255))
        image.circle(64, 52, 22, (92, 186, 84, 255))
        image.ellipse(64, 102, 28, 8, (92, 64, 36, 255))
    elif tier == 4:
        image.round_rect(60, 70, 8, 32, 3, (70, 148, 62, 255))
        image.ellipse(64, 52, 18, 26, (232, 112, 156, 255))
        image.ellipse(64, 46, 8, 10, (255, 186, 206, 230))
    elif tier == 5:
        for angle in range(0, 360, 60):
            rad = math.radians(angle)
            image.ellipse(64 + math.cos(rad) * 22, 62 + math.sin(rad) * 22, 16, 10, (236, 92, 132, 255), rot=rad)
        image.circle(64, 62, 14, (255, 206, 86, 255))
        image.round_rect(60, 84, 8, 24, 3, (64, 150, 70, 255))
    elif tier == 6:
        image.circle(46, 70, 16, (196, 42, 58, 255))
        image.circle(70, 60, 18, (214, 54, 72, 255))
        image.circle(86, 78, 14, (176, 32, 58, 255))
        image.ellipse(58, 46, 14, 8, (72, 164, 74, 255), rot=-0.8)
        image.circle(52, 58, 4, (255, 220, 220, 180))
    elif tier == 7:
        image.round_rect(34, 48, 60, 52, 14, (232, 236, 240, 255))
        image.round_rect(40, 62, 48, 32, 8, (196, 48, 62, 255))
        image.ellipse(64, 62, 20, 8, (220, 72, 78, 255))
        image.round_rect(46, 36, 36, 14, 6, (186, 140, 64, 255))
        image.ellipse(50, 58, 6, 10, (255, 255, 255, 120))
    else:
        image.round_rect(56, 78, 16, 30, 4, (122, 78, 42, 255))
        image.circle(64, 58, 34, (46, 150, 72, 255))
        image.circle(40, 70, 18, (58, 168, 80, 255))
        image.circle(90, 68, 18, (36, 132, 64, 255))
        image.circle(50, 48, 6, (232, 72, 78, 255))
        image.circle(74, 42, 6, (255, 196, 64, 255))
        image.circle(78, 64, 5, (220, 64, 86, 255))
    return image


def draw_shape_item(tier, hue):
    image = Raster(128, 128)
    base = hue_shift((70, 110, 230, 255), hue + tier * 28)
    accent = hue_shift((255, 255, 255, 230), hue)
    dark = tuple(max(0, channel - 40) if i < 3 else 255 for i, channel in enumerate(base))
    if tier == 1:
        image.circle(64, 64, 40, base)
        image.circle(50, 50, 12, accent)
    elif tier == 2:
        image.round_rect(28, 28, 72, 72, 18, base)
        image.round_rect(46, 46, 36, 36, 8, accent)
    elif tier == 3:
        image.polygon([(64, 22), (108, 96), (20, 96)], base)
        image.circle(64, 74, 12, accent)
    elif tier == 4:
        image.polygon([(64, 18), (78, 50), (112, 54), (86, 78), (94, 112), (64, 94), (34, 112), (42, 78), (16, 54), (50, 50)], base)
    elif tier == 5:
        image.circle(64, 64, 42, base)
        image.circle(64, 64, 20, (0, 0, 0, 0))
        image.circle(64, 64, 18, (255, 255, 255, 0))
        # Punch a hole by painting transparent is not possible over blend.
        # Draw a ring with two circles: outer base, inner cleared by background-colored hole.
        image.circle(64, 64, 18, (0, 0, 0, 0))
    elif tier == 6:
        image.round_rect(54, 24, 20, 80, 8, base)
        image.round_rect(24, 54, 80, 20, 8, base)
    elif tier == 7:
        for angle in range(0, 360, 60):
            rad = math.radians(angle - 90)
            image.polygon([
                (64, 64),
                (64 + math.cos(rad - 0.22) * 46, 64 + math.sin(rad - 0.22) * 46),
                (64 + math.cos(rad + 0.22) * 46, 64 + math.sin(rad + 0.22) * 46),
            ], base)
        image.circle(64, 64, 16, accent)
    else:
        image.polygon([(20, 78), (40, 48), (54, 66), (64, 28), (74, 66), (88, 48), (108, 78)], base)
        image.round_rect(20, 74, 88, 18, 6, dark)
    if tier == 5:
        image.circle(64, 64, 42, base)
        image.circle(64, 64, 18, (245, 247, 252, 255))
        image.circle(52, 52, 8, accent)
    return image


def shapes_background(hue):
    image = Raster(540, 960)
    top = hue_shift((28, 36, 78, 255), hue)
    bottom = hue_shift((12, 16, 36, 255), hue)
    image.vertical_gradient(top, bottom)
    image.circle(120, 180, 70, hue_shift((80, 110, 220, 80), hue))
    image.circle(420, 640, 110, hue_shift((80, 110, 220, 50), hue))
    return image


def generate(images_dir, count, style, hue=0):
    images_dir = Path(images_dir)
    if style == "garden":
        save(garden_background(), images_dir / "bg.png")
        for tier in range(1, count + 1):
            save(draw_garden_item(tier), images_dir / f"item-{tier}.png")
        return
    save(shapes_background(hue), images_dir / "bg.png")
    for tier in range(1, count + 1):
        save(draw_shape_item(tier, hue), images_dir / f"item-{tier}.png")


def hue_from_slug(slug):
    value = 0
    for char in slug:
        value = (value * 33 + ord(char)) % 360
    return value


if __name__ == "__main__":
    import sys
    target = Path(sys.argv[1])
    style = sys.argv[2] if len(sys.argv) > 2 else "garden"
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    generate(target, count, style, hue_from_slug(target.name))
