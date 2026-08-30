"""
Make a supplied company logo fit the circle it is drawn in.

Every avatar in Fleetin is a small round frame — 24 to 44 pixels — and the
artwork an account supplies is not built for one. A logo arrives as a wide
rectangle with its own generous white margin baked in, and `object-contain`
inside a circular clip then fits that *whole rectangle*, margin included, into
the circle's width. The mark ends up a third of the height it could be, adrift
in white, and the frame reads as broken rather than as branded.

Cropping to the circle instead is worse: it would cut the ends off every
wordmark in the book.

So the artwork is squared before it is ever uploaded. Two steps, no redrawing:

  1. **Trim.** The uniform border is measured against the corner pixel and
     removed. This is the margin the designer put in the file, not part of the
     mark.
  2. **Pad to square.** The trimmed mark is centred on a square canvas sized to
     its longest edge plus a small, even margin of its own — so a wide wordmark
     and a tall monogram both sit in the same optical space, and the round clip
     takes the corners rather than the artwork.

The output is a square PNG, which `object-contain` fills to the full diameter.
Transparency is preserved where the source had it and white is used where it
did not, because these logos were drawn on white and inventing transparency
around them leaves grey halos on a tinted frame.

    python3 prisma/tools/normalise-logos.py <source-dir> <output-dir>
"""
import sys
from pathlib import Path
from PIL import Image

#: Margin left around the trimmed mark, as a fraction of its longest edge.
#: Enough to keep the artwork clear of the circle's edge, small enough that the
#: mark still fills the frame.
MARGIN = 0.10

#: How far a pixel may differ from the corner colour and still count as
#: background. Generous enough for JPEG ringing around a flat white border.
TOLERANCE = 12

SUPPORTED = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def content_box(image: Image.Image):
    """The bounding box of everything that is not the background border."""
    if image.mode == "RGBA" and image.getchannel("A").getextrema()[0] < 255:
        return image.getchannel("A").getbbox()

    rgb = image.convert("RGB")
    background = rgb.getpixel((0, 0))
    # A mask of "differs from the corner colour by more than the tolerance".
    mask = Image.new("L", rgb.size, 0)
    mask.putdata([
        255 if max(abs(p[0] - background[0]), abs(p[1] - background[1]), abs(p[2] - background[2])) > TOLERANCE else 0
        for p in rgb.getdata()
    ])
    return mask.getbbox()


def normalise(source: Path, target: Path) -> str:
    image = Image.open(source)
    image = image.convert("RGBA")

    box = content_box(image)
    if box:
        image = image.crop(box)

    side = int(max(image.size) * (1 + MARGIN * 2))
    transparent = image.getchannel("A").getextrema()[0] < 255
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0) if transparent else (255, 255, 255, 255))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2), image)

    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target, "PNG", optimize=True)
    return f"{source.name}  {image.width}x{image.height} -> {side}x{side}"


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: normalise-logos.py <source-dir> <output-dir>")
    source_dir, output_dir = Path(sys.argv[1]), Path(sys.argv[2])
    files = sorted(p for p in source_dir.iterdir() if p.suffix.lower() in SUPPORTED)
    if not files:
        raise SystemExit(f"no images found in {source_dir}")
    for path in files:
        print("  " + normalise(path, output_dir / f"{path.stem.strip()}.png"))
    print(f"\n{len(files)} logo(s) squared into {output_dir}")


if __name__ == "__main__":
    main()
