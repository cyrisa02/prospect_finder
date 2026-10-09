// app/page.tsx
"use client";
import { useState } from "react";

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
  const [tone, setTone] = useState("direct");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchEmails, setBatchEmails] = useState<Record<string, string>>({});
  const [saveLoading, setSaveLoading] = useState<string | null>(null);
  const [batchSaveLoading, setBatchSaveLoading] = useState(false);
  const [savedSirens, setSavedSirens] = useState<Set<string>>(new Set());

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setGeneratedEmail("");
    setProspects([]);
    setQueryInfo(null);
    setError("");
    setBatchEmails({});
    setSavedSirens(new Set());

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
        body: JSON.stringify({ prospect, metier: queryInfo?.metier, tone }),
      });
      const data = await res.json();
      if (res.ok && data.email) {
        setGeneratedEmail(data.email);
      } else {
        setError(data.error || "Erreur lors de la génération");
      }
    } catch (err) {
      console.error("Erreur génération email :", err);
      setError("Erreur lors de la communication avec l'IA.");
    } finally {
      setEmailLoading(null);
    }
  }

  async function handleBatchGenerate() {
    setBatchLoading(true);
    setBatchProgress({ current: 0, total: prospects.length });
    setBatchEmails({});
    const newEmails: Record<string, string> = {};

    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      try {
        const res = await fetch("/api/generate-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prospect, metier: queryInfo?.metier, tone }),
        });
        const data = await res.json();
        if (res.ok && data.email) {
          newEmails[prospect.siren] = data.email;
        }
      } catch (err) {
        console.error(`Erreur batch pour ${prospect.nom}`, err);
      }

      setBatchProgress({ current: i + 1, total: prospects.length });
      setBatchEmails({ ...newEmails });

      if (i < prospects.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    setBatchLoading(false);
  }

  const handleExportCSV = () => {
    if (prospects.length === 0) return;
    const headers = [
      "SIREN",
      "Nom",
      "Adresse",
      "Code Postal",
      "Ville",
      "Code NAF",
      "Date Création",
      "Email Généré",
    ];
    const rows = prospects.map((p) =>
      [
        p.siren,
        p.nom,
        p.adresse,
        p.code_postal,
        p.ville,
        p.code_naf,
        p.date_creation,
        batchEmails[p.siren] || generatedEmail,
      ]
        .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `prospects_${queryInfo?.metier || "search"}_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Sauvegarde individuelle vers Google Sheets
  async function handleSaveSingle(prospect: Prospect) {
    setSaveLoading(prospect.siren);
    try {
      const email = batchEmails[prospect.siren] || generatedEmail;
      const res = await fetch("/api/save-to-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospect,
          metier: queryInfo?.metier,
          email,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSavedSirens((prev) => new Set(prev).add(prospect.siren));
      } else {
        alert("❌ Erreur : " + (data.error || "Inconnue"));
      }
    } catch (err) {
      console.error("Erreur save :", err);
      alert("Erreur de communication avec le serveur");
    } finally {
      setSaveLoading(null);
    }
  }

  // Sauvegarde batch vers Google Sheets
  async function handleBatchSave() {
    setBatchSaveLoading(true);
    let savedCount = 0;

    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      try {
        const email = batchEmails[prospect.siren] || "";
        const res = await fetch("/api/save-to-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prospect,
            metier: queryInfo?.metier,
            email,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          savedCount++;
          setSavedSirens((prev) => new Set(prev).add(prospect.siren));
        }
      } catch (err) {
        console.error(`Erreur save pour ${prospect.nom}`, err);
      }

      // Rate limiter : 500ms entre chaque appel
      if (i < prospects.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setBatchSaveLoading(false);
    alert(`✅ ${savedCount} prospect(s) sauvegardé(s) dans Google Sheets`);
  }

  return (
    <main className="p-8 max-w-6xl mx-auto">
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
        <div className="mt-4 flex flex-wrap gap-4 items-center">
          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white px-6 py-3 rounded-lg disabled:opacity-50 hover:bg-gray-800"
          >
            {loading ? "Recherche en cours..." : "Rechercher"}
          </button>

          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="p-3 border rounded-lg text-black bg-white"
          >
            <option value="direct">Ton direct</option>
            <option value="chaleureux">Ton chaleureux</option>
            <option value="formel">Ton formel</option>
          </select>
        </div>
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
            {queryInfo.communes_scanned} communes scannées dans un rayon de 10
            km
          </p>
        </div>
      )}

      {prospects.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="text-2xl font-semibold text-gray-800">
              {prospects.length} prospect(s) trouvé(s)
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleBatchGenerate}
                disabled={batchLoading}
                className="bg-purple-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-purple-700"
              >
                {batchLoading
                  ? `Génération... (${batchProgress.current}/${batchProgress.total})`
                  : "⚡ Générer tous les emails"}
              </button>
              <button
                onClick={handleBatchSave}
                disabled={batchSaveLoading}
                className="bg-orange-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-orange-700"
              >
                {batchSaveLoading
                  ? "Sauvegarde..."
                  : "💾 Sauvegarder tous dans Sheets"}
              </button>
              <button
                onClick={handleExportCSV}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Exporter CSV
              </button>
            </div>
          </div>

          {batchLoading && (
            <div className="mb-4 w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-purple-600 h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                }}
              ></div>
            </div>
          )}

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

                {batchEmails[prospect.siren] && (
                  <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-800 max-h-24 overflow-y-auto">
                    {batchEmails[prospect.siren]}
                  </div>
                )}

                {savedSirens.has(prospect.siren) && (
                  <div className="mt-2 text-xs text-green-600 font-medium">
                    ✅ Sauvegardé dans Sheets
                  </div>
                )}

                <div className="flex flex-col gap-2 mt-2">
                  <button
                    onClick={() => handleGenerateEmail(prospect)}
                    disabled={emailLoading === prospect.siren}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-blue-700 transition-colors"
                  >
                    {emailLoading === prospect.siren
                      ? "Génération..."
                      : "Générer un email"}
                  </button>
                  <button
                    onClick={() => handleSaveSingle(prospect)}
                    disabled={saveLoading === prospect.siren}
                    className="w-full bg-orange-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-orange-700 transition-colors"
                  >
                    {saveLoading === prospect.siren
                      ? "Envoi..."
                      : "💾 Sauvegarder"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {generatedEmail && (
        <div className="mt-8 p-6 bg-gray-50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Email généré :</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
            {generatedEmail}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(generatedEmail)}
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Copier dans le presse-papier
          </button>
        </div>
      )}
    </main>
  );
}
