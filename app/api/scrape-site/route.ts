import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url)
      return NextResponse.json({ error: "URL requise" }, { status: 400 });

    const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;

    const response = await fetch(normalizedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ProspectFinder/1.0)" },
      signal: AbortSignal.timeout(4000), // Timeout strict de 4s
    });

    if (!response.ok) throw new Error("Site inaccessible");

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
    const descMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/is,
    );

    // Nettoyage basique pour extraire le texte
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return NextResponse.json({
      title: titleMatch ? titleMatch[1].trim() : "",
      description: descMatch ? descMatch[1].trim() : "",
      excerpt: text.substring(0, 600), // 600 caractères de contexte
    });
  } catch (error) {
    return NextResponse.json({ error: "Scraping échoué" }, { status: 500 });
  }
}
