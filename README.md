# Image Tools Extension for Swamp

A swamp extension for deterministic image manipulation using ImageMagick and potrace. It handles color replacement, resizing, format conversion, bitmap-to-vector tracing, SVG rasterization, and image compositing, all through swamp model methods that produce tracked data artifacts.

This extension is designed for operations where the output needs to be predictable and pixel-accurate. AI-based image generation (which is inherently non-deterministic) is handled by the separate `@dougschaefer/openai-image` extension. The two compose well together: generate with OpenAI, then recolor, resize, trace, or composite with this extension.

## Prerequisites

Both ImageMagick and potrace must be installed locally. The extension calls them as shell commands.

**Debian/Ubuntu:**

```bash
sudo apt-get install -y imagemagick potrace
```

**macOS:**

```bash
brew install imagemagick potrace
```

ImageMagick 6.x and 7.x are both supported. The extension uses the `convert`, `identify`, and `composite` commands, which are available in both versions. Potrace is only required for the `trace` method and can be omitted if you do not need bitmap-to-vector conversion.

## Installation

```bash
swamp extension pull @dougschaefer/image-tools
```

Create a model instance:

```bash
swamp model create @dougschaefer/image-tools img
```

No vault or credentials are needed. Everything runs locally against files on disk.

## Usage

### Get Image Info

```bash
swamp model method run img info --input '{"path": "/path/to/image.png"}'
```

Returns dimensions, format, color space, bit depth, and file size.

### Recolor

Replace one color with another across an entire image. The fuzz tolerance controls how aggressively nearby shades are matched, which is useful for anti-aliased edges and slight color variations.

```bash
swamp model method run img recolor --input '{
  "inputPath": "/path/to/logo-orange.png",
  "outputPath": "/path/to/logo-blue.png",
  "fromColor": "#E8501C",
  "toColor": "#0033A1",
  "fuzz": 25
}'
```

### Resize

Scale by target width, target height, percentage, or exact dimensions. Aspect ratio is preserved unless you append `!` to the geometry string.

```bash
swamp model method run img resize --input '{
  "inputPath": "/path/to/source.png",
  "outputPath": "/path/to/output.png",
  "geometry": "4000x"
}'
```

Geometry follows ImageMagick conventions: `4000x` for width-constrained, `x2000` for height-constrained, `50%` for half size, `1920x1080!` for exact dimensions ignoring aspect ratio.

### Convert Format

Convert between PNG, JPEG, WebP, TIFF, BMP, and GIF. The output format is inferred from the file extension. Quality is configurable for lossy formats.

```bash
swamp model method run img convert --input '{
  "inputPath": "/path/to/image.png",
  "outputPath": "/path/to/image.webp",
  "quality": 85
}'
```

### Trace to SVG

Convert a bitmap image to a vector SVG using potrace. This works best on logos, icons, and flat-color artwork where the shapes have clean edges. The output scales to any resolution without artifacts.

```bash
swamp model method run img trace --input '{
  "inputPath": "/path/to/logo.png",
  "outputPath": "/path/to/logo.svg",
  "color": "#0033A1",
  "threshold": 50
}'
```

The `threshold` parameter controls the black/white cutoff during bitmap conversion (lower values capture more detail). The `turdsize` parameter suppresses speckles below a given pixel count, and `alphamax` controls corner smoothness where lower values produce sharper corners.

### Render SVG to PNG

Rasterize an SVG or EPS file to a high-resolution PNG. Control the output size through DPI, target width, or both.

```bash
swamp model method run img render --input '{
  "inputPath": "/path/to/logo.svg",
  "outputPath": "/path/to/logo-4k.png",
  "density": 600,
  "width": 4000,
  "background": "#F4E8EC"
}'
```

### Composite

Overlay one image on top of another at a specified anchor point. Useful for placing logos on backgrounds, adding watermarks, or building multi-layer compositions.

```bash
swamp model method run img composite --input '{
  "basePath": "/path/to/background.png",
  "overlayPath": "/path/to/logo.png",
  "outputPath": "/path/to/final.png",
  "gravity": "SouthEast",
  "offset": "+20+20"
}'
```

## Methods

| Method | Description |
|--------|-------------|
| `info` | Image metadata: dimensions, format, color space, file size |
| `recolor` | Replace one color with another (fuzz-tolerant) |
| `resize` | Scale by dimensions or percentage |
| `convert` | Format conversion (PNG, JPEG, WebP, TIFF, BMP, GIF) |
| `trace` | Bitmap to SVG vector trace via potrace |
| `render` | SVG/EPS to high-resolution PNG rasterization |
| `composite` | Overlay one image on another with positioning |

## Quality and Testing

This extension has been tested against ImageMagick 6.9 and potrace 1.16 on Ubuntu (WSL2) in the American Sound integration lab.

## License

MIT. See [LICENSE](LICENSE) for details.
