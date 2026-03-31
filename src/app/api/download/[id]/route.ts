import { NextRequest, NextResponse } from "next/server";
import { getMeta, getCompressedUrl } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  }

  const meta = await getMeta(id);
  if (!meta) {
    return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
  }

  const compressedUrl = await getCompressedUrl(id);
  if (!compressedUrl) {
    return NextResponse.json(
      { error: "Fichier compressé non disponible" },
      { status: 404 }
    );
  }

  // Fetch from Vercel Blob and serve with download headers
  const res = await fetch(compressedUrl);
  if (!res.ok) {
    return NextResponse.json(
      { error: "Erreur lors de la récupération du fichier" },
      { status: 500 }
    );
  }

  const buffer = await res.arrayBuffer();
  const downloadName = meta.originalName.replace(/\.pdf$/i, "-compressé.pdf");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Content-Length": buffer.byteLength.toString(),
    },
  });
}
