import * as mupdf from "mupdf";

export interface CompressResult {
  compressedBuffer: Uint8Array;
  qualityUsed: string;
}

function optimizePdf(inputData: Uint8Array): { buffer: Uint8Array; size: number } {
  const doc = mupdf.Document.openDocument(inputData, "application/pdf");
  const pdfDoc = doc.asPDF();
  if (!pdfDoc) throw new Error("Impossible d'ouvrir le PDF");

  const buf = pdfDoc.saveToBuffer({
    garbage: 4,
    compress: true,
    "compress-images": true,
    "compress-fonts": true,
    clean: true,
    sanitize: true,
    linearize: true,
  });

  const result = buf.asUint8Array();
  const size = result.length;

  pdfDoc.destroy();

  return { buffer: result, size };
}

function rasterizePdf(inputData: Uint8Array, dpi: number, jpegQuality: number): { buffer: Uint8Array; size: number } {
  const doc = mupdf.Document.openDocument(inputData, "application/pdf");
  const pageCount = doc.countPages();

  const outBuf = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(outBuf, "pdf", "");

  const scale = dpi / 72;
  const matrix = mupdf.Matrix.scale(scale, scale);

  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const bounds = page.getBounds();

    // Render page to pixmap
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);

    // Create image from pixmap
    const image = new mupdf.Image(pixmap);

    // Write rasterized page at original dimensions
    const pageWidth = bounds[2] - bounds[0];
    const pageHeight = bounds[3] - bounds[1];
    const device = writer.beginPage([0, 0, pageWidth, pageHeight]);
    const imgMatrix: mupdf.Matrix = [pageWidth, 0, 0, pageHeight, 0, 0];
    device.fillImage(image, imgMatrix, 1);
    writer.endPage();

    image.destroy();
    pixmap.destroy();
    page.destroy();
  }

  writer.close();
  doc.destroy();

  // Re-open the written PDF and save with JPEG compression
  const rasterDoc = mupdf.Document.openDocument(outBuf.asUint8Array(), "application/pdf");
  const rasterPdf = rasterDoc.asPDF();
  if (!rasterPdf) throw new Error("Erreur lors de la rasterisation");

  const finalBuf = rasterPdf.saveToBuffer({
    garbage: 4,
    compress: true,
    "compress-images": true,
    clean: true,
  });

  const result = finalBuf.asUint8Array();
  const size = result.length;

  rasterPdf.destroy();
  writer.destroy();

  return { buffer: result, size };
}

const RASTER_LEVELS = [
  { name: "haute qualité (150 DPI)", dpi: 150, jpegQuality: 85 },
  { name: "moyenne qualité (100 DPI)", dpi: 100, jpegQuality: 70 },
  { name: "basse qualité (72 DPI)", dpi: 72, jpegQuality: 50 },
] as const;

export function compressPdf(
  inputData: Uint8Array,
  targetSizeMb: number | null
): CompressResult {
  // Step 1: structural optimization (lossless)
  const optimized = optimizePdf(inputData);

  if (targetSizeMb === null) {
    return {
      compressedBuffer: optimized.buffer,
      qualityUsed: "optimisation structurelle",
    };
  }

  const targetBytes = targetSizeMb * 1024 * 1024;

  if (optimized.size <= targetBytes) {
    return {
      compressedBuffer: optimized.buffer,
      qualityUsed: "optimisation structurelle (taille cible atteinte)",
    };
  }

  // Step 2: rasterize at decreasing quality until target is met
  for (const level of RASTER_LEVELS) {
    const rasterized = rasterizePdf(inputData, level.dpi, level.jpegQuality);
    if (rasterized.size <= targetBytes) {
      return {
        compressedBuffer: rasterized.buffer,
        qualityUsed: level.name,
      };
    }
  }

  // Even lowest quality didn't meet target — return lowest
  const lowest = rasterizePdf(
    inputData,
    RASTER_LEVELS[RASTER_LEVELS.length - 1].dpi,
    RASTER_LEVELS[RASTER_LEVELS.length - 1].jpegQuality
  );
  return {
    compressedBuffer: lowest.buffer,
    qualityUsed: `${RASTER_LEVELS[RASTER_LEVELS.length - 1].name} (taille cible non atteinte)`,
  };
}
