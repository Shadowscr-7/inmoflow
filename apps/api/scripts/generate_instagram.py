#!/usr/bin/env python3
"""
Generate a 1080x1080 Instagram-ready image for a property listing.

Usage:
    python generate_instagram.py <json_input_file> <output_file>

Input JSON:
{
  "imageUrl": "path or URL to property photo",
  "operationType": "sale" | "rent",
  "price": 150000,
  "currency": "USD",
  "address": "Av. Italia 1234, Montevideo",
  "bedrooms": 3,
  "bathrooms": 2,
  "areaM2": 120
}
"""

import json
import sys
import os
import io
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SIZE = 1080


def load_image(image_path: str) -> Image.Image:
    """Load image from local file path."""
    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")
    return Image.open(image_path)


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Try to load a system font, fall back to default."""
    font_names = []
    if bold:
        font_names = [
            "arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf",
            "LiberationSans-Bold.ttf", "FreeSansBold.ttf",
        ]
    else:
        font_names = [
            "arial.ttf", "Arial.ttf", "DejaVuSans.ttf",
            "LiberationSans-Regular.ttf", "FreeSans.ttf",
        ]

    for name in font_names:
        try:
            return ImageFont.truetype(name, size)
        except (OSError, IOError):
            continue

    # Try common system paths
    font_dirs = [
        "C:/Windows/Fonts",
        "/usr/share/fonts/truetype",
        "/usr/share/fonts",
        "/System/Library/Fonts",
    ]
    for d in font_dirs:
        for name in font_names:
            path = os.path.join(d, name)
            if os.path.exists(path):
                try:
                    return ImageFont.truetype(path, size)
                except (OSError, IOError):
                    continue

    return ImageFont.load_default()


def draw_rounded_rect(draw: ImageDraw.ImageDraw, xy, radius: int, fill):
    """Draw a rounded rectangle."""
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


def generate_instagram_image(data: dict, output_path: str):
    """Generate the Instagram image."""
    # Load and resize background image
    image_path = data.get("imageUrl", "")
    try:
        bg = load_image(image_path)
    except (FileNotFoundError, Exception):
        # Fallback: solid dark gradient
        bg = Image.new("RGB", (SIZE, SIZE), (30, 30, 60))

    # Resize/crop to fill 1080x1080
    bg = bg.convert("RGB")
    w, h = bg.size
    scale = max(SIZE / w, SIZE / h)
    bg = bg.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    # Center crop
    w, h = bg.size
    left = (w - SIZE) // 2
    top = (h - SIZE) // 2
    bg = bg.crop((left, top, left + SIZE, top + SIZE))

    # Apply slight blur to background for readability
    bg = bg.filter(ImageFilter.GaussianBlur(radius=2))

    # Create overlay with dark gradient (RGBA)
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_overlay = ImageDraw.Draw(overlay)

    # Gradient: top lighter, bottom darker
    for y in range(SIZE):
        alpha = int(80 + (y / SIZE) * 140)
        alpha = min(alpha, 230)
        draw_overlay.line([(0, y), (SIZE, y)], fill=(0, 0, 0, alpha))

    # Extra dark band at the bottom for text area
    for y in range(SIZE - 350, SIZE):
        progress = (y - (SIZE - 350)) / 350
        extra_alpha = int(progress * 60)
        draw_overlay.line([(0, y), (SIZE, y)], fill=(0, 0, 0, min(extra_alpha + 200, 245)))

    bg = bg.convert("RGBA")
    bg = Image.alpha_composite(bg, overlay)

    # Semi-transparent specs bar as another overlay
    specs = []
    if data.get("bedrooms"):
        specs.append((str(data["bedrooms"]), "Dorm."))
    if data.get("bathrooms"):
        specs.append((str(data["bathrooms"]), "Baños"))
    if data.get("areaM2"):
        specs.append((f'{data["areaM2"]}', "m²"))

    if specs:
        bar_overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        bar_draw = ImageDraw.Draw(bar_overlay)
        bar_y = SIZE - 130
        bar_draw.rounded_rectangle(
            (40, bar_y, SIZE - 40, bar_y + 90), radius=16,
            fill=(255, 255, 255, 25),
        )
        bg = Image.alpha_composite(bg, bar_overlay)

    bg = bg.convert("RGB")
    draw = ImageDraw.Draw(bg)

    # Fonts
    font_badge = get_font(28, bold=True)
    font_price = get_font(58, bold=True)
    font_address = get_font(26, bold=False)
    font_spec_val = get_font(30, bold=True)
    font_spec_lbl = get_font(20, bold=False)

    # ─── Badge: "En Venta" or "En Alquiler" ───
    operation = data.get("operationType", "sale")
    badge_text = "EN ALQUILER" if operation == "rent" else "EN VENTA"
    badge_color = (76, 175, 80) if operation == "sale" else (33, 150, 243)

    badge_bbox = draw.textbbox((0, 0), badge_text, font=font_badge)
    badge_w = badge_bbox[2] - badge_bbox[0] + 40
    badge_h = badge_bbox[3] - badge_bbox[1] + 24
    badge_x = 50
    badge_y = 50
    draw.rounded_rectangle(
        (badge_x, badge_y, badge_x + badge_w, badge_y + badge_h),
        radius=10, fill=badge_color,
    )
    draw.text((badge_x + 20, badge_y + 10), badge_text, fill="white", font=font_badge)

    # ─── Price ───
    price = data.get("price")
    currency = data.get("currency", "USD")
    if price:
        price_text = f"$ {currency} {price:,.0f}".replace(",", ".")
    else:
        price_text = "Consultar precio"

    price_y = SIZE - 290
    draw.text((50, price_y), price_text, fill="white", font=font_price)

    # Underline accent
    price_bbox = draw.textbbox((50, price_y), price_text, font=font_price)
    accent_y = price_bbox[3] + 10
    draw.rectangle([50, accent_y, 50 + 80, accent_y + 4], fill=badge_color)

    # ─── Address ───
    address = data.get("address", "")
    if address:
        addr_y = accent_y + 22
        addr_display = address if len(address) <= 55 else address[:52] + "..."
        # Draw a small location dot instead of emoji
        dot_r = 5
        draw.ellipse(
            [52, addr_y + 8, 52 + dot_r * 2, addr_y + 8 + dot_r * 2],
            fill=badge_color,
        )
        draw.text((72, addr_y), addr_display, fill=(210, 210, 210), font=font_address)

    # ─── Specs bar items ───
    if specs:
        specs_y = SIZE - 110
        total_specs = len(specs)
        available_width = SIZE - 100
        spec_width = available_width // total_specs

        for i, (value, label) in enumerate(specs):
            sx = 50 + i * spec_width
            # Value (bold number)
            draw.text((sx + 10, specs_y + 2), value, fill="white", font=font_spec_val)
            # Label
            val_bbox = draw.textbbox((sx + 10, specs_y + 2), value, font=font_spec_val)
            draw.text((val_bbox[2] + 8, specs_y + 10), label, fill=(180, 180, 180), font=font_spec_lbl)

            # Separator line
            if i < total_specs - 1:
                sep_x = sx + spec_width - 2
                draw.line(
                    [(sep_x, specs_y + 5), (sep_x, specs_y + 45)],
                    fill=(255, 255, 255), width=1,
                )

    # Save
    bg.save(output_path, "PNG", quality=95)
    return output_path


def main():
    if len(sys.argv) < 3:
        print("Usage: generate_instagram.py <input.json> <output.png>", file=sys.stderr)
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    with open(input_file, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    generate_instagram_image(data, output_file)
    print(output_file)


if __name__ == "__main__":
    main()
