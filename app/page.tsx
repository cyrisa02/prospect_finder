// app/page.tsx
"use client";
import { useState, useRef } from "react";

interface Prospect {
  siren: string;
  nom: string;
  adresse: string;
  code_postal: string;
  ville: string;
  code_naf: string;
  date_creation?: string;
}

interface QueryInfo {
  ville: string;
  metier: string;
  codesNaf: string;
  communes_scanned: number;
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [queryInfo, setQueryInfo] = useState<QueryInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState<string | null>(null);
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [error, setError] = useState("");

  const emailRef = useRef<HTMLDivElement>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setGeneratedEmail("");
    setProspects([]);
    setQueryInfo(null);
    setError("");

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (res.ok && data.prospects) {
        setProspects(data.prospects);
        setQueryInfo(data.queryInfo);
      } else {
        setError(data.error || data.message || "Erreur lors de la recherche");
      }
    } catch (err) {
      console.error("Erreur réseau :", err);
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateEmail(prospect: Prospect) {
    setEmailLoading(prospect.siren);
    setGeneratedEmail("");

    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect, metier: queryInfo?.metier }),
      });
      const data = await res.json();

      // Prise en compte de data.email ou fallback sur data.result
      const mailResult = data.email || data.result || data.content;

      if (res.ok && mailResult) {
        setGeneratedEmail(mailResult);
        setTimeout(() => {
          emailRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else {
        setError(data.error || "Erreur lors de la génération");
      }
    } catch (err) {
      console.error("Erreur génération email :", err);
      setError("Erreur lors de la communication avec le serveur.");
    } finally {
      setEmailLoading(null);
    }
  }

  return (
    <main className="p-8 max-w-6xl mx-auto min-h-screen pb-24">
      <h1 className="text-3xl font-bold mb-6">Prospect Finder</h1>
      <form onSubmit={handleSearch} className="mb-8">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex: Je cherche des boulangers à Soissons"
          className="w-full p-3 border rounded-lg text-lg text-black"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="mt-4 bg-black text-white px-6 py-3 rounded-lg disabled:opacity-50 hover:bg-gray-800"
        >
          {loading ? "Recherche en cours..." : "Rechercher"}
        </button>
      </form>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {queryInfo && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg text-blue-900">
          <h2 className="font-semibold mb-2">Requête analysée :</h2>
          <p>
            <strong>Ville :</strong> {queryInfo.ville}
          </p>
          <p>
            <strong>Métier :</strong> {queryInfo.metier}
          </p>
          <p>
            <strong>Codes NAF :</strong> {queryInfo.codesNaf}
          </p>
          <p className="text-sm mt-2 text-gray-600">
            {queryInfo.communes_scanned} commune(s) scannée(s)
          </p>
        </div>
      )}

      {prospects.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">
            {prospects.length} prospect(s) trouvé(s)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {prospects.map((prospect, idx) => (
              <div
                key={prospect.siren || idx}
                className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                <h3 className="font-bold text-lg mb-2 text-gray-900">
                  {prospect.nom}
                </h3>
                <p className="text-sm text-gray-600 mb-1">{prospect.adresse}</p>
                <p className="text-sm text-gray-600 mb-1">
                  {prospect.code_postal} {prospect.ville}
                </p>
                <p className="text-xs text-gray-500 mb-1">
                  NAF : {prospect.code_naf}
                </p>
                {prospect.date_creation && (
                  <p className="text-xs text-gray-400 mb-3">
                    Créée le : {prospect.date_creation}
                  </p>
                )}
                <button
                  onClick={() => handleGenerateEmail(prospect)}
                  disabled={emailLoading === prospect.siren}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-blue-700 transition-colors"
                >
                  {emailLoading === prospect.siren
                    ? "Génération en cours..."
                    : "Générer un email"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zone d'affichage de l'email généré */}
      {generatedEmail && (
        <div
          ref={emailRef}
          className="mt-8 p-6 bg-white border-2 border-blue-500 rounded-lg shadow-lg"
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              ✉️ Email généré :
            </h2>
            <button
              onClick={() => setGeneratedEmail("")}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Fermer ✕
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans bg-gray-50 p-4 rounded border">
            {generatedEmail}
          </pre>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => navigator.clipboard.writeText(generatedEmail)}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 font-medium"
            >
              Copier dans le presse-papier
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
