import { z } from "npm:zod@4";

async function run(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const proc = new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await proc.output();
  const stdout = new TextDecoder().decode(result.stdout).trim();
  const stderr = new TextDecoder().decode(result.stderr).trim();
  if (!result.success) {
    throw new Error(`${cmd} failed: ${stderr || stdout}`);
  }
  return { stdout, stderr };
}

export const model = {
  type: "@dougschaefer/image-tools",
  version: "2026.04.02.1",
  globalArguments: z.object({}),
  resources: {
    image: {
      description: "Processed image artifact",
      schema: z.object({
        operation: z.string(),
        inputPath: z.string(),
        outputPath: z.string(),
        format: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
        fileSize: z.number(),
      }),
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
  },
  methods: {
    info: {
      description:
        "Get image metadata: dimensions, format, color space, and file size.",
      arguments: z.object({
        path: z.string().describe("Absolute path to the image file"),
      }),
      execute: async (args, context) => {
        const { stdout } = await run("identify", [
          "-format",
          "%w|%h|%m|%r|%b|%z",
          args.path,
        ]);
        const [width, height, format, colorspace, size, depth] = stdout.split(
          "|",
        );

        context.logger.info(
          "{path}: {width}x{height} {format} {colorspace} {size}",
          {
            path: args.path,
            width,
            height,
            format,
            colorspace,
            size,
          },
        );

        return {
          data: {
            attributes: {
              path: args.path,
              width: parseInt(width),
              height: parseInt(height),
              format,
              colorspace,
              fileSize: size,
              bitDepth: parseInt(depth),
            },
            name: "info",
          },
        };
      },
    },

    recolor: {
      description:
        "Replace one color with another in an image. Uses fuzz tolerance for anti-aliased edges.",
      arguments: z.object({
        inputPath: z.string().describe("Absolute path to the source image"),
        outputPath: z.string().describe("Absolute path for the output image"),
        fromColor: z
          .string()
          .describe("Color to replace (hex like #E8501C, or color name)"),
        toColor: z
          .string()
          .describe("Replacement color (hex like #0033A1, or color name)"),
        fuzz: z
          .number()
          .default(25)
          .describe("Color match tolerance as percentage (0-100)"),
      }),
      execute: async (args, context) => {
        await run("convert", [
          args.inputPath,
          "-fuzz",
          `${args.fuzz}%`,
          "-fill",
          args.toColor,
          "-opaque",
          args.fromColor,
          args.outputPath,
        ]);

        const { stdout } = await run("identify", [
          "-format",
          "%w|%h|%m|%b",
          args.outputPath,
        ]);
        const [w, h, fmt, size] = stdout.split("|");

        context.logger.info(
          "Recolored {from} → {to} (fuzz {fuzz}%): {path}",
          {
            from: args.fromColor,
            to: args.toColor,
            fuzz: args.fuzz,
            path: args.outputPath,
          },
        );

        const handle = await context.writeResource("image", "recolored", {
          operation: "recolor",
          inputPath: args.inputPath,
          outputPath: args.outputPath,
          format: fmt,
          width: parseInt(w),
          height: parseInt(h),
          fileSize: parseInt(size),
        });
        return { dataHandles: [handle] };
      },
    },

    resize: {
      description:
        "Resize an image by dimensions or percentage. Preserves aspect ratio by default.",
      arguments: z.object({
        inputPath: z.string().describe("Absolute path to the source image"),
        outputPath: z.string().describe("Absolute path for the output image"),
        geometry: z
          .string()
          .describe(
            "ImageMagick geometry: '4000x' (width), 'x2000' (height), '50%' (scale), '1920x1080!' (exact)",
          ),
      }),
      execute: async (args, context) => {
        await run("convert", [
          args.inputPath,
          "-resize",
          args.geometry,
          args.outputPath,
        ]);

        const { stdout } = await run("identify", [
          "-format",
          "%w|%h|%m|%b",
          args.outputPath,
        ]);
        const [w, h, fmt, size] = stdout.split("|");

        context.logger.info("Resized to {w}x{h}: {path}", {
          w,
          h,
          path: args.outputPath,
        });

        const handle = await context.writeResource("image", "resized", {
          operation: "resize",
          inputPath: args.inputPath,
          outputPath: args.outputPath,
          format: fmt,
          width: parseInt(w),
          height: parseInt(h),
          fileSize: parseInt(size),
        });
        return { dataHandles: [handle] };
      },
    },

    convert: {
      description:
        "Convert an image between formats (PNG, JPEG, WebP, TIFF, BMP, GIF). Quality is configurable for lossy formats.",
      arguments: z.object({
        inputPath: z.string().describe("Absolute path to the source image"),
        outputPath: z
          .string()
          .describe(
            "Absolute path for the output image (format inferred from extension)",
          ),
        quality: z
          .number()
          .optional()
          .describe("Quality for lossy formats (1-100, default 90)"),
      }),
      execute: async (args, context) => {
        const cmdArgs = [args.inputPath];
        if (args.quality !== undefined) {
          cmdArgs.push("-quality", String(args.quality));
        }
        cmdArgs.push(args.outputPath);
        await run("convert", cmdArgs);

        const { stdout } = await run("identify", [
          "-format",
          "%w|%h|%m|%b",
          args.outputPath,
        ]);
        const [w, h, fmt, size] = stdout.split("|");

        context.logger.info("Converted to {format}: {path}", {
          format: fmt,
          path: args.outputPath,
        });

        const handle = await context.writeResource("image", "converted", {
          operation: "convert",
          inputPath: args.inputPath,
          outputPath: args.outputPath,
          format: fmt,
          width: parseInt(w),
          height: parseInt(h),
          fileSize: parseInt(size),
        });
        return { dataHandles: [handle] };
      },
    },

    trace: {
      description:
        "Trace a bitmap image to SVG vector using potrace. Best for logos, icons, and flat-color artwork. Optionally recolor the output.",
      arguments: z.object({
        inputPath: z.string().describe("Absolute path to the source image"),
        outputPath: z
          .string()
          .describe("Absolute path for the SVG output"),
        color: z
          .string()
          .optional()
          .describe(
            "Fill color for the traced paths (hex like #0033A1). Default is black.",
          ),
        threshold: z
          .number()
          .default(50)
          .describe(
            "Black/white threshold percentage (0-100). Lower captures more detail.",
          ),
        turdsize: z
          .number()
          .default(2)
          .describe(
            "Suppress speckles up to this size (pixels). Higher removes more noise.",
          ),
        alphamax: z
          .number()
          .default(1.0)
          .describe(
            "Corner smoothness (0-1.34). Lower = sharper corners.",
          ),
      }),
      execute: async (args, context) => {
        // Convert to PBM bitmap for potrace
        const pbmPath = args.inputPath.replace(/\.[^.]+$/, ".pbm");
        await run("convert", [
          args.inputPath,
          "-threshold",
          `${args.threshold}%`,
          pbmPath,
        ]);

        await run("potrace", [
          pbmPath,
          "-s",
          "-o",
          args.outputPath,
          "--turdsize",
          String(args.turdsize),
          "--alphamax",
          String(args.alphamax),
        ]);

        // Clean up temp PBM
        try {
          await Deno.remove(pbmPath);
        } catch {
          // ignore
        }

        // Recolor if requested
        if (args.color) {
          let svg = await Deno.readTextFile(args.outputPath);
          svg = svg.replace(
            /fill="#000000" stroke="none"/g,
            `fill="${args.color}" stroke="none"`,
          );
          // Handle potrace's default fill on <g> element
          svg = svg.replace(
            /(<g[^>]*transform="[^"]*")\s*(fill="#000000")?\s*(stroke="none")/g,
            `$1 fill="${args.color}" stroke="none"`,
          );
          await Deno.writeTextFile(args.outputPath, svg);
        }

        const stat = await Deno.stat(args.outputPath);

        context.logger.info("Traced to SVG: {path} ({size} bytes)", {
          path: args.outputPath,
          size: stat.size,
        });

        const handle = await context.writeResource("image", "traced", {
          operation: "trace",
          inputPath: args.inputPath,
          outputPath: args.outputPath,
          format: "SVG",
          fileSize: stat.size,
        });
        return { dataHandles: [handle] };
      },
    },

    render: {
      description:
        "Rasterize an SVG or EPS to a high-resolution PNG. Control output size via DPI or target width.",
      arguments: z.object({
        inputPath: z
          .string()
          .describe("Absolute path to the SVG or EPS file"),
        outputPath: z.string().describe("Absolute path for the PNG output"),
        density: z
          .number()
          .default(300)
          .describe("Render DPI (higher = larger output)"),
        width: z
          .number()
          .optional()
          .describe("Target width in pixels (overrides density-based sizing)"),
        background: z
          .string()
          .default("none")
          .describe(
            "Background color (hex, color name, or 'none' for transparent)",
          ),
      }),
      execute: async (args, context) => {
        const cmdArgs = [
          "-density",
          String(args.density),
          args.inputPath,
          "-background",
          args.background,
          "-flatten",
        ];
        if (args.width) {
          cmdArgs.push("-resize", `${args.width}x`);
        }
        cmdArgs.push(args.outputPath);
        await run("convert", cmdArgs);

        const { stdout } = await run("identify", [
          "-format",
          "%w|%h|%m|%b",
          args.outputPath,
        ]);
        const [w, h, fmt, size] = stdout.split("|");

        context.logger.info("Rendered {w}x{h}: {path}", {
          w,
          h,
          path: args.outputPath,
        });

        const handle = await context.writeResource("image", "rendered", {
          operation: "render",
          inputPath: args.inputPath,
          outputPath: args.outputPath,
          format: fmt,
          width: parseInt(w),
          height: parseInt(h),
          fileSize: parseInt(size),
        });
        return { dataHandles: [handle] };
      },
    },

    composite: {
      description:
        "Overlay one image on top of another at a specified position. Useful for watermarks, logos on backgrounds, etc.",
      arguments: z.object({
        basePath: z.string().describe("Absolute path to the base image"),
        overlayPath: z.string().describe("Absolute path to the overlay image"),
        outputPath: z.string().describe("Absolute path for the output image"),
        gravity: z
          .enum([
            "NorthWest",
            "North",
            "NorthEast",
            "West",
            "Center",
            "East",
            "SouthWest",
            "South",
            "SouthEast",
          ])
          .default("Center")
          .describe("Placement anchor point"),
        offset: z
          .string()
          .default("+0+0")
          .describe("Offset from gravity point (e.g., +10+20)"),
      }),
      execute: async (args, context) => {
        await run("composite", [
          "-gravity",
          args.gravity,
          "-geometry",
          args.offset,
          args.overlayPath,
          args.basePath,
          args.outputPath,
        ]);

        const { stdout } = await run("identify", [
          "-format",
          "%w|%h|%m|%b",
          args.outputPath,
        ]);
        const [w, h, fmt, size] = stdout.split("|");

        context.logger.info("Composited {overlay} onto {base}: {path}", {
          overlay: args.overlayPath,
          base: args.basePath,
          path: args.outputPath,
        });

        const handle = await context.writeResource("image", "composited", {
          operation: "composite",
          inputPath: args.basePath,
          outputPath: args.outputPath,
          format: fmt,
          width: parseInt(w),
          height: parseInt(h),
          fileSize: parseInt(size),
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
