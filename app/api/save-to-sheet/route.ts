// app/api/save-to-sheet/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prospect, metier, email } = body;

    if (!prospect) {
      return NextResponse.json(
        { error: "Données du prospect manquantes" },
        { status: 400 },
      );
    }

    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!scriptUrl) {
      return NextResponse.json(
        { error: "GOOGLE_SCRIPT_URL non configurée" },
        { status: 500 },
      );
    }

    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        siren: prospect.siren,
        nom: prospect.nom,
        adresse: prospect.adresse,
        code_postal: prospect.code_postal,
        ville: prospect.ville,
        code_naf: prospect.code_naf,
        date_creation: prospect.date_creation,
        metier,
        email,
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Script error: ${response.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Erreur save-to-sheet :", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi vers Google Sheets" },
      { status: 500 },
    );
  }
}
