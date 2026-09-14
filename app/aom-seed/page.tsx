"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AomSeedPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    description: "",
    eil: "",
    ail: "",
    bedrooms: "",
    bathrooms: "",
    sqft: "",
    location: "",
  });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/aom", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          eil: Number(form.eil),
          ail: Number(form.ail),
          attributes: {
            bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
            bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
            sqft: form.sqft ? Number(form.sqft) : undefined,
            location: form.location || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create listing");
      setSuccess(`Listing "${data.listing.title}" created (id: ${data.listing.id})`);
      setForm({
        title: "",
        description: "",
        eil: "",
        ail: "",
        bedrooms: "",
        bathrooms: "",
        sqft: "",
        location: "",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Seed Listing</h1>
        <Link href="/dashboard" className="text-sm text-indigo-400 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <p className="text-gray-400 text-sm">
        Create a seller listing with eil/ail score bounds. These are the
        candidates the buyer matching engine will run against.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 bg-gray-900 rounded-xl p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Sunset Villa Unit 4B"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Short description of the listing"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none resize-none"
            />
          </div>

          {/* Score bounds */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              eil — minimum listing score *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={form.eil}
              onChange={(e) => setForm({ ...form, eil: e.target.value })}
              placeholder="e.g. 60"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              ail — acceptance/asking score *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={form.ail}
              onChange={(e) => setForm({ ...form, ail: e.target.value })}
              placeholder="e.g. 85"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none"
            />
          </div>

          {/* Optional attributes */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bedrooms</label>
            <input
              type="number"
              value={form.bedrooms}
              onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
              placeholder="3"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bathrooms</label>
            <input
              type="number"
              value={form.bathrooms}
              onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
              placeholder="2"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Sq ft</label>
            <input
              type="number"
              value={form.sqft}
              onChange={(e) => setForm({ ...form, sqft: e.target.value })}
              placeholder="1400"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Location</label>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Downtown"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-green-400 text-sm">{success}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Listing"}
          </button>
          <Link
            href="/api/aom"
            target="_blank"
            className="px-5 py-2.5 rounded-lg border border-gray-700 hover:border-gray-500 text-sm font-medium transition-colors"
          >
            View all AOMs
          </Link>
        </div>
      </form>
    </main>
  );
}
