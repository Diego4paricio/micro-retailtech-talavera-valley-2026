"""Hero video: the Flow clip with the clean Kardo stand printed on every frame.

Local tool, not part of the build. Flow keeps the camera and the stand still
but redraws the printed text badly ("o escanes", "Escanes", an unreadable
footer). The stand never moves, so the exact artwork
(Docs/renders/referencias/kardo-edicion-stand.png, made by
kardo-edition.mjs) is warped onto the plate once and blended into every frame
with that frame's own light: the navy and the cream are taken from the video,
so the plate keeps the sunlight that moves across it.

    python3 scripts/media/hero-video.py [--source CLIP] [--pingpong] [--slow N] [--debug DIR]

Without --source it takes the newest Sunlight_brightens_wooden_counter clip
in Docs/renders/sitio. Any 16:9 clip with the stand in the same place works
(a clip generated from the poster as its first frame keeps it there); it is
read at 24 fps whatever its own rate. --pingpong plays the clip forward and
then backward, for a clip that starts and ends on the same still frame
(Docs/renders/sitio/Higgsfield_H3_hero_sin_persona_20261013.mp4): both ends
are slow, so the turn is not seen, and the loop closes on the exact frame it
started from. --slow 1.5 plays it 1.5 times slower, still at 24 fps: ffmpeg
blends the in-between frames (minterpolate), which suits soft light and
shadows, and the stand does not move.

Needs Python 3 with numpy and Pillow, and ffmpeg on the PATH.

The clip is 1080p, but large and retina screens draw the hero at 2560 px or
more, so the frame is composed at 2560 × 1440: the blurred room is the clip
scaled up (it is out of focus anyway) and the stand, the only sharp thing, is
drawn from the vector artwork at that size. Writes to public/media/landing:

- hero-kardo-1440.mp4 / .webm: 2560 × 1440, for desktops (HeroVideo picks it
  with a media query);
- hero-kardo.mp4 / .webm: 1920 × 1080 from the same frames, for phones and
  tablets and for browsers that ignore the media query;
- hero-kardo-poster-2560.webp, hero-kardo-poster.webp (1920) and
  hero-kardo-poster-960.webp: the first frame.

Every file stays under the 2 MB that test/media.test.ts allows. No audio.
"""

import argparse
import glob
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REPO = os.path.abspath(os.path.join(SITE, "..", ".."))
SOURCE_GLOB = os.path.join(
    REPO, "Docs", "renders", "sitio", "Sunlight_brightens_wooden_counter_1080p_*.mp4"
)
ART = os.path.join(REPO, "Docs", "renders", "referencias", "kardo-edicion-stand.png")
OUT = os.path.join(SITE, "public", "media", "landing")

# The clip's size, where the calibration below was measured, and the size the
# frames are composed at. S scales every length measured in clip pixels.
SRC_W, SRC_H = 1920, 1080
W, H = 2560, 1440
S = W / SRC_W
# kardo-edition.mjs draws the stand in a 1000 × 1500 box; the PNG is 2×.
ART_UNIT = 2.0
INK = np.array([0x16, 0x23, 0x2E], float)
PAPER = np.array([0xF7, 0xF5, 0xF0], float)
# The two cream boxes of the artwork (artwork units): x0, y0, x1, y1.
ART_BOXES = [(110, 680, 470, 1040), (530, 680, 890, 1040)]
# Where to look for them in the clip (clip pixels): x0, x1, y0, y1.
VIDEO_BOXES = [(1270, 1480, 490, 715), (1480, 1700, 490, 715)]


def read_frames(path):
    """The clip's frames, scaled to W × H (Lanczos). A light temporal denoise
    first: the room is out of focus, and its grain only costs bits."""
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", path, "-vf",
         f"fps=24,hqdn3d=1.5:1.5:6:6,scale={W}:{H}:flags=lanczos",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    size = W * H * 3
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    proc.wait()


def fit_box(lum, x0, x1, y0, y1):
    """Sharp corners of a rounded cream box: lines fitted to its straight edges."""
    m = lum[y0:y1, x0:x1] > 175
    ys, xs = np.where(m)
    bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
    h, w = by1 - by0, bx1 - bx0
    rows = range(by0 + int(0.25 * h), by1 - int(0.25 * h))
    cols = range(bx0 + int(0.25 * w), bx1 - int(0.25 * w))
    left = np.polyfit(rows, [np.where(m[y])[0].min() for y in rows], 1)
    right = np.polyfit(rows, [np.where(m[y])[0].max() for y in rows], 1)
    top = np.polyfit(cols, [np.where(m[:, x])[0].min() for x in cols], 1)
    bottom = np.polyfit(cols, [np.where(m[:, x])[0].max() for x in cols], 1)

    def corner(vline, hline):
        # x = a*y + b (vertical edge), y = c*x + d (horizontal edge)
        a, b = vline
        c, d = hline
        y = (c * b + d) / (1 - a * c)
        x = a * y + b
        return x + x0 + 0.5, y + y0 + 0.5

    return [corner(left, top), corner(right, top), corner(right, bottom), corner(left, bottom)]


def homography(src, dst):
    rows = []
    for (x, y), (u, v) in zip(src, dst):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.array(rows))
    return vt[-1].reshape(3, 3) / vt[-1, -1]


def warp_artwork(art, h_art_to_video, region, scale=3):
    """Artwork (RGBA float) seen through the plate, rendered at `scale`× and
    averaged down, so the small text keeps its weight without aliasing."""
    x0, y0, x1, y1 = region
    inv = np.linalg.inv(h_art_to_video)
    gx, gy = np.meshgrid(
        x0 + (np.arange((x1 - x0) * scale) + 0.5) / scale,
        y0 + (np.arange((y1 - y0) * scale) + 0.5) / scale,
    )
    pts = np.stack([gx.ravel(), gy.ravel(), np.ones(gx.size)])
    src = inv @ pts
    sx = src[0] / src[2] * ART_UNIT - 0.5
    sy = src[1] / src[2] * ART_UNIT - 0.5
    ah, aw = art.shape[:2]
    inside = (sx >= 0) & (sy >= 0) & (sx < aw - 1) & (sy < ah - 1)
    sx = np.clip(sx, 0, aw - 1.001)
    sy = np.clip(sy, 0, ah - 1.001)
    ix, iy = sx.astype(int), sy.astype(int)
    fx, fy = (sx - ix)[:, None], (sy - iy)[:, None]
    sample = (
        art[iy, ix] * (1 - fx) * (1 - fy)
        + art[iy, ix + 1] * fx * (1 - fy)
        + art[iy + 1, ix] * (1 - fx) * fy
        + art[iy + 1, ix + 1] * fx * fy
    )
    sample[~inside] = 0
    out = sample.reshape((y1 - y0) * scale, (x1 - x0) * scale, 4)
    return out.reshape(y1 - y0, scale, x1 - x0, scale, 4).mean((1, 3))


def _box(a, r, axis):
    """Mean over a window of 2r+1 along one axis, edges extended."""
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis)
    hi = np.take(c, np.arange(2 * r + 1, c.shape[axis]), axis=axis)
    lo = np.take(c, np.arange(0, c.shape[axis] - 2 * r - 1), axis=axis)
    return (hi - lo) / (2 * r + 1)


def blur(a, sigma):
    """Approximate Gaussian blur: three box passes per axis (works on 2D or HxWxC)."""
    if sigma < 1.0:
        k = np.exp(-0.5 * (np.arange(-2, 3) / max(sigma, 1e-3)) ** 2)
        k /= k.sum()
        out = a
        for axis in (0, 1):
            pad = [(0, 0)] * a.ndim
            pad[axis] = (2, 2)
            p = np.pad(out, pad, mode="edge")
            out = sum(
                k[i] * np.take(p, np.arange(i, i + out.shape[axis]), axis=axis) for i in range(5)
            )
        return out
    r = max(1, int(round(np.sqrt(12 * sigma * sigma / 3 + 1) - 1) // 2))
    out = a.astype(float)
    for axis in (0, 1):
        for _ in range(3):
            out = _box(out, r, axis)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", help="clip to use instead of the newest Flow clip")
    parser.add_argument(
        "--pingpong", action="store_true", help="forward, then backward, as one loop"
    )
    parser.add_argument(
        "--slow", type=float, default=1.0, help="play this many times slower"
    )
    parser.add_argument("--debug", help="folder for the calibration overlay")
    args = parser.parse_args()

    if args.source:
        source = args.source
    else:
        sources = sorted(glob.glob(SOURCE_GLOB))
        if not sources:
            sys.exit(f"No source clip: {SOURCE_GLOB}")
        source = sources[-1]
    frames = read_frames(source)
    first = next(frames)
    lum = first.astype(float).mean(2)

    # 1. Where the plate is: the four corners of each cream box in the video
    #    against the same corners in the artwork.
    video_pts, art_pts = [], []
    for (ax0, ay0, ax1, ay1), vb in zip(ART_BOXES, VIDEO_BOXES):
        video_pts += fit_box(lum, *[int(round(v * S)) for v in vb])
        art_pts += [(ax0, ay0), (ax1, ay0), (ax1, ay1), (ax0, ay1)]
    h_art = homography(art_pts, video_pts)
    err = []
    for (x, y), (u, v) in zip(art_pts, video_pts):
        p = h_art @ [x, y, 1]
        err.append(np.hypot(p[0] / p[2] - u, p[1] / p[2] - v))
    print(f"Plate fit: max error {max(err):.2f} px over {len(err)} corners")

    corners = []
    for x, y in [(0, 0), (1000, 0), (1000, 1500), (0, 1500)]:
        p = h_art @ [x, y, 1]
        corners.append((p[0] / p[2], p[1] / p[2]))
    pad = int(round(5 * S))
    region = (
        int(min(c[0] for c in corners)) - pad,
        int(min(c[1] for c in corners)) - pad,
        int(max(c[0] for c in corners)) + pad,
        int(max(c[1] for c in corners)) + pad,
    )
    rx0, ry0, rx1, ry1 = region

    art = np.asarray(Image.open(ART).convert("RGBA")).astype(float)
    art[..., :3] /= 255
    art[..., 3] /= 255
    warped = warp_artwork(art, h_art, region)
    art_rgb = warped[..., :3] * 255
    art_alpha = warped[..., 3]

    # 2. What the stand covers: inside the plate, inset 5 px so the video's own
    #    acrylic edge stays, and above the oak base, which stands in front.
    plate = (art_alpha > 0.99).astype(float)
    plate = 1 - np.clip(blur(1 - plate, 2.5 * S) * 3, 0, 1)
    sub = first[ry0:ry1, rx0:rx1].astype(float)
    wood = (sub[..., 0] > 120) & (sub[..., 0] - sub[..., 2] > 35)
    base_top = np.full(sub.shape[1], sub.shape[0])
    for x in range(sub.shape[1]):
        col = np.where(wood[int(sub.shape[0] * 0.6):, x])[0]
        if len(col):
            base_top[x] = col[0] + int(sub.shape[0] * 0.6)
    above_base = (np.arange(sub.shape[0])[:, None] < base_top[None, :] - 2 * S).astype(float)
    # The video's own plate outline: per row, from its first to its last navy
    # pixel, 4 px in, so its acrylic edge and bevel stay as Flow drew them.
    navy = (sub[..., 0] < 70) & (sub[..., 1] < 80) & (sub[..., 2] < 100) & (sub[..., 2] > sub[..., 0])
    video_plate = np.zeros(navy.shape)
    rows = [y for y in range(navy.shape[0]) if navy[y].sum() > 60 * S]
    inset = int(round(4 * S))
    for y in rows[inset:]:
        xs = np.where(navy[y])[0]
        video_plate[y, xs.min() + inset : xs.max() - inset + 1] = 1
    video_plate = blur(video_plate, 1.0 * S)
    mask = np.clip(plate * video_plate * blur(above_base, 1.2 * S), 0, 1)[..., None]

    # 3. Light: where the artwork is plain navy (away from any print), the
    #    video's navy is a reliable sample; where it is plain cream, the same.
    t = np.clip((art_rgb - INK) / (PAPER - INK), 0, 1)
    # Flow's print reads heavier than the thin vector text at this size: lift
    # the light print a little so it has the same presence.
    t = t ** 0.8
    ink_like = np.abs(art_rgb - INK).max(-1) < 6
    paper_like = np.abs(art_rgb - PAPER).max(-1) < 6
    clean_ink = (blur(1 - ink_like.astype(float), 3 * S) < 0.02) & (art_alpha > 0.99)
    clean_ink &= above_base.astype(bool)
    clean_paper = blur(1 - paper_like.astype(float), 2 * S) < 0.02

    noise_rng = np.random.default_rng(7)

    def compose(frame):
        f = frame.astype(float)
        s = f[ry0:ry1, rx0:rx1]
        w = clean_ink.astype(float)
        ink_field = blur(s * w[..., None], 28 * S) / np.maximum(blur(w, 28 * S), 1e-3)[..., None]
        wp = clean_paper.astype(float)
        paper_field = blur(s * wp[..., None], 40 * S) / np.maximum(blur(wp, 40 * S), 1e-3)[..., None]
        # Far from the boxes the cream field is undefined: follow the navy's
        # brightness from the nearest box instead.
        conf = np.clip(blur(wp, 40 * S) * 6, 0, 1)[..., None]
        mean_paper = (s * wp[..., None]).sum((0, 1)) / max(wp.sum(), 1)
        paper_field = paper_field * conf + mean_paper * (1 - conf)
        print_rgb = ink_field + t * (paper_field - ink_field)
        # A touch of softness so the print sits on the plate like ink; kept
        # at the clip's size so the 1440p print stays sharp.
        print_rgb = blur(print_rgb, 0.55)
        print_rgb += noise_rng.normal(0, 1.4, print_rgb.shape)
        s[:] = s * (1 - mask) + print_rgb * mask
        f[ry0:ry1, rx0:rx1] = s
        return np.clip(f + 0.5, 0, 255).astype(np.uint8)

    os.makedirs(OUT, exist_ok=True)
    # Raw frames go to the system temp folder (about 2.6 GB at 1440p), never
    # next to the site's files.
    raw_fd, raw = tempfile.mkstemp(suffix=".rgb")
    count = 0
    with os.fdopen(raw_fd, "wb") as out:
        poster = compose(first)
        out.write(poster.tobytes())
        count += 1
        for frame in frames:
            out.write(compose(frame).tobytes())
            count += 1
    if args.pingpong:
        # Back from the second to last frame to the second one: the first
        # and the last are not repeated at the turns.
        size = W * H * 3
        with open(raw, "rb") as src, open(raw, "ab") as out:
            for index in range(count - 2, 0, -1):
                src.seek(index * size)
                out.write(src.read(size))
        count = 2 * count - 2
    print(f"Composed {count} frames at {W} x {H} from {os.path.basename(source)}")

    image = Image.fromarray(poster)
    image.save(os.path.join(OUT, "hero-kardo-poster-2560.webp"), quality=80)
    image.resize((1920, 1080), Image.LANCZOS).save(
        os.path.join(OUT, "hero-kardo-poster.webp"), quality=82
    )
    # Phones show the poster about 400 px wide: a 960 px copy is plenty.
    image.resize((960, 540), Image.LANCZOS).save(
        os.path.join(OUT, "hero-kardo-poster-960.webp"), quality=80
    )
    if args.debug:
        os.makedirs(args.debug, exist_ok=True)
        m = int(round(40 * S))
        image.crop((rx0 - m, ry0 - m, rx1 + m, ry1 + m)).save(
            os.path.join(args.debug, "hero-plate.png")
        )
        np.save(os.path.join(args.debug, "region.npy"), np.array(region))
        Image.fromarray(first).crop((rx0 - m, ry0 - m, rx1 + m, ry1 + m)).save(
            os.path.join(args.debug, "hero-plate-before.png")
        )

    # The camera never moves, so the codecs spend little on the room: the
    # quality below keeps the print sharp and the blur free of blocks while
    # every file stays under 2 MB.
    rawin = ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "24", "-i", raw]
    encodes = [
        ("hero-kardo-1440", None, 24, 36),
        ("hero-kardo", "scale=1920:1080:flags=lanczos", 22, 34),
    ]
    slow = (
        [f"setpts={args.slow}*PTS,minterpolate=fps=24:mi_mode=blend"]
        if args.slow != 1.0
        else []
    )
    for name, scale, crf_h264, crf_vp9 in encodes:
        chain = slow + ([scale] if scale else [])
        vf = ["-vf", ",".join(chain)] if chain else []
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", *rawin, *vf, "-an", "-c:v", "libx264",
             "-preset", "veryslow", "-crf", str(crf_h264), "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", os.path.join(OUT, f"{name}.mp4")],
            check=True,
        )
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", *rawin, *vf, "-an", "-c:v", "libvpx-vp9",
             "-b:v", "0", "-crf", str(crf_vp9), "-row-mt", "1", "-deadline", "good",
             "-cpu-used", "1", os.path.join(OUT, f"{name}.webm")],
            check=True,
        )
    os.remove(raw)
    for name in (
        "hero-kardo-1440.mp4",
        "hero-kardo-1440.webm",
        "hero-kardo.mp4",
        "hero-kardo.webm",
        "hero-kardo-poster-2560.webp",
        "hero-kardo-poster.webp",
        "hero-kardo-poster-960.webp",
    ):
        size = os.path.getsize(os.path.join(OUT, name)) / 1e6
        print(f"{name}: {size:.2f} MB")


if __name__ == "__main__":
    main()
