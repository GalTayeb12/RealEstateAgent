"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListingImage {
  id: string;
  type: "gallery" | "panorama" | "floorplan";
  label: string;
  imageData: string;
  order: number;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  location: string;
  description: string;
}

interface UnitType {
  id: string;
  unitLabel: string;
  price: number;
  quantityTotal: number;
  quantityAvailable: number;
  description: string;
  eil: number;
  ail: number;
  active: boolean;
  aomStatus: string;
  attributes: string;
  project: Project;
  images: ListingImage[];
}

// ── Dynamic import: VirtualTour (browser-only, WebGL) ─────────────────────────
// TourScene is defined locally to avoid an SSR-incompatible type-only import.

interface TourScene {
  id: string;
  label: string;
  panoramaUrl: string;
}

const VirtualTour = dynamic<{ scenes: TourScene[] }>(
  () =>
    import("../../../aom/[id]/VirtualTour").then((m) => ({
      default: m.VirtualTour as React.ComponentType<{ scenes: TourScene[] }>,
    })),
  { ssr: false }
);

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "0.5625rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid #DDD9D3",
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "var(--font-inter, sans-serif)",
  color: "#1C1B19",
  background: "#fff",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "#6B6860",
  marginBottom: "0.25rem",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.875rem",
  border: "1px solid #DDD9D3",
  overflow: "hidden",
};

const sectionHeaderStyle: React.CSSProperties = {
  borderBottom: "1px solid #F0EDE8",
  padding: "1rem 1.375rem",
  fontSize: "0.6875rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#9A958F",
};

const primaryBtnStyle: React.CSSProperties = {
  background: "linear-gradient(155deg, #2F6664, #123332)",
  color: "#fff",
  borderRadius: 999,
  padding: "0.5625rem 1.375rem",
  fontWeight: 700,
  fontSize: "0.875rem",
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-inter, sans-serif)",
};

const SIZE_WARNING_MB = 5;

function fileSizeWarning(files: File[]): boolean {
  return files.some((f) => f.size > SIZE_WARNING_MB * 1024 * 1024);
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UnitTypeEditPage() {
  const params = useParams();
  const unitTypeId = params.unitTypeId as string;
  const router = useRouter();

  const [unitType, setUnitType] = useState<UnitType | null>(null);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  // Basic info form state
  const [form, setForm] = useState({
    unitLabel: "",
    price: "",
    quantityTotal: "",
    quantityAvailable: "",
    description: "",
    eil: "",
    ail: "",
  });
  const [basicSaving, setBasicSaving] = useState(false);
  const [basicError, setBasicError] = useState("");

  // Gallery state
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [gallerySizeWarn, setGallerySizeWarn] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Tour state
  const [tourRoomLabel, setTourRoomLabel] = useState("");
  const [tourFile, setTourFile] = useState<File | null>(null);
  const [tourSizeWarn, setTourSizeWarn] = useState(false);
  const [tourUploading, setTourUploading] = useState(false);
  const tourFileInputRef = useRef<HTMLInputElement>(null);

  // Floor plan state
  const [fpFile, setFpFile] = useState<File | null>(null);
  const [fpUploading, setFpUploading] = useState(false);
  const [fpAnnotating, setFpAnnotating] = useState(false);
  const [fpBaseDataUrl, setFpBaseDataUrl] = useState<string | null>(null);
  const fpCanvasRef = useRef<HTMLCanvasElement>(null);
  const fpIsDrawingRef = useRef(false);
  const fpHistoryRef = useRef<ImageData[]>([]);
  const fpBaseImageRef = useRef<HTMLImageElement | null>(null);
  const fpFileInputRef = useRef<HTMLInputElement>(null);

  // Derived
  const galleryImages = images
    .filter((i) => i.type === "gallery")
    .sort((a, b) => a.order - b.order);
  const panoramaImages = images
    .filter((i) => i.type === "panorama")
    .sort((a, b) => a.order - b.order);
  const floorplanImage = images.find((i) => i.type === "floorplan") ?? null;

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Auth + load
  const load = useCallback(async () => {
    const t = localStorage.getItem("token") ?? "";
    if (!t) {
      router.push("/dev/login");
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/dev/unit-types/${unitTypeId}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) {
        router.push("/dev/login");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const ut: UnitType = data.unitType;
      setUnitType(ut);
      setImages(ut.images ?? []);
      setForm({
        unitLabel: ut.unitLabel ?? "",
        price: ut.price != null ? String(ut.price) : "",
        quantityTotal: ut.quantityTotal != null ? String(ut.quantityTotal) : "",
        quantityAvailable:
          ut.quantityAvailable != null ? String(ut.quantityAvailable) : "",
        description: ut.description ?? "",
        eil: ut.eil != null ? String(ut.eil) : "",
        ail: ut.ail != null ? String(ut.ail) : "",
      });
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [unitTypeId, router]);

  useEffect(() => {
    load();
  }, [load]);

  function setField(k: keyof typeof form) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = "#1F4B4A";
  }
  function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = "#DDD9D3";
  }

  // ── Auth helper — reads token fresh from localStorage each call ──────────────

  async function authFetch(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const t = localStorage.getItem("token") ?? "";
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Authorization: `Bearer ${t}`,
      },
    });
    if (res.status === 401) {
      router.push("/dev/login");
      throw new Error("Unauthorized");
    }
    return res;
  }

  // ── Save basic info ──────────────────────────────────────────────────────────

  async function saveBasicInfo(e: React.FormEvent) {
    e.preventDefault();
    setBasicError("");
    setBasicSaving(true);
    try {
      // Note: attributes (bedrooms/bathrooms/sqft etc.) are managed separately
      // and are NOT sent here — omitting the field leaves the DB value unchanged.
      const body = {
        unitLabel: form.unitLabel.trim(),
        price: form.price !== "" ? Number(form.price) : 0,
        quantityTotal: form.quantityTotal !== "" ? Number(form.quantityTotal) : 0,
        quantityAvailable:
          form.quantityAvailable !== "" ? Number(form.quantityAvailable) : 0,
        description: form.description,
        eil: form.eil !== "" ? Number(form.eil) : 0,
        ail: form.ail !== "" ? Number(form.ail) : 0,
      };

      const res = await authFetch(`/api/dev/unit-types/${unitTypeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setToast("Changes saved");
    } catch (err) {
      setBasicError((err as Error).message);
    } finally {
      setBasicSaving(false);
    }
  }

  // ── Gallery upload ───────────────────────────────────────────────────────────

  function handleGalleryFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setGalleryFiles(files);
    setGallerySizeWarn(fileSizeWarning(files));
  }

  async function uploadGalleryImages() {
    if (galleryFiles.length === 0) return;
    setGalleryUploading(true);
    try {
      const existingOrder = galleryImages.length;
      for (let i = 0; i < galleryFiles.length; i++) {
        const file = galleryFiles[i];
        const imageData = await readFileAsDataURL(file);
        const res = await authFetch(`/api/dev/unit-types/${unitTypeId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "gallery",
            label: file.name,
            imageData,
            order: existingOrder + i,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? `Failed to upload ${file.name}`);
        }
        const d = await res.json();
        setImages((prev) => [...prev, d.image]);
      }
      setGalleryFiles([]);
      setGallerySizeWarn(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      setToast(`${galleryFiles.length} photo${galleryFiles.length === 1 ? "" : "s"} uploaded`);
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setGalleryUploading(false);
    }
  }

  async function deleteGalleryImage(imageId: string) {
    try {
      const res = await authFetch(
        `/api/dev/unit-types/${unitTypeId}/images/${imageId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed");
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      setToast("Photo removed");
    } catch (err) {
      setToast((err as Error).message);
    }
  }

  // ── Tour upload & reorder ─────────────────────────────────────────────────────

  function handleTourFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setTourFile(file);
    setTourSizeWarn(file ? file.size > SIZE_WARNING_MB * 1024 * 1024 : false);
  }

  async function addTourRoom() {
    if (!tourFile || !tourRoomLabel.trim()) return;
    setTourUploading(true);
    try {
      const imageData = await readFileAsDataURL(tourFile);
      const res = await authFetch(`/api/dev/unit-types/${unitTypeId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "panorama",
          label: tourRoomLabel.trim(),
          imageData,
          order: panoramaImages.length,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Upload failed");
      }
      const d = await res.json();
      setImages((prev) => [...prev, d.image]);
      setTourRoomLabel("");
      setTourFile(null);
      setTourSizeWarn(false);
      if (tourFileInputRef.current) tourFileInputRef.current.value = "";
      setToast("Room added to tour");
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setTourUploading(false);
    }
  }

  async function movePanorama(index: number, direction: "up" | "down") {
    const sorted = [...panoramaImages];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    const a = sorted[index];
    const b = sorted[swapIndex];
    const aNewOrder = b.order;
    const bNewOrder = a.order;

    // Optimistic update
    setImages((prev) =>
      prev.map((img) => {
        if (img.id === a.id) return { ...img, order: aNewOrder };
        if (img.id === b.id) return { ...img, order: bNewOrder };
        return img;
      })
    );

    try {
      await Promise.all([
        authFetch(`/api/dev/unit-types/${unitTypeId}/images/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: aNewOrder }),
        }),
        authFetch(`/api/dev/unit-types/${unitTypeId}/images/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: bNewOrder }),
        }),
      ]);
    } catch (err) {
      // Revert on error
      setImages((prev) =>
        prev.map((img) => {
          if (img.id === a.id) return { ...img, order: a.order };
          if (img.id === b.id) return { ...img, order: b.order };
          return img;
        })
      );
      setToast((err as Error).message);
    }
  }

  async function deletePanoramaRoom(imageId: string) {
    try {
      const res = await authFetch(
        `/api/dev/unit-types/${unitTypeId}/images/${imageId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed");
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      setToast("Room removed");
    } catch (err) {
      setToast((err as Error).message);
    }
  }

  // ── Floor plan annotation ─────────────────────────────────────────────────────

  function fpGetXY(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    // Scale from display size to actual canvas pixels
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    return { x: (clientX - r.left) * scaleX, y: (clientY - r.top) * scaleY };
  }

  function fpBeginDraw(clientX: number, clientY: number) {
    const canvas = fpCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    // Save history before each new stroke
    fpHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    fpIsDrawingRef.current = true;
    const { x, y } = fpGetXY(canvas, clientX, clientY);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function fpContinueDraw(clientX: number, clientY: number) {
    if (!fpIsDrawingRef.current) return;
    const canvas = fpCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = fpGetXY(canvas, clientX, clientY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function fpEndDraw() {
    fpIsDrawingRef.current = false;
  }

  function fpMouseDown(e: React.MouseEvent<HTMLCanvasElement>) { fpBeginDraw(e.clientX, e.clientY); }
  function fpMouseMove(e: React.MouseEvent<HTMLCanvasElement>) { fpContinueDraw(e.clientX, e.clientY); }
  function fpMouseUp()    { fpEndDraw(); }
  function fpMouseLeave() { fpEndDraw(); }

  function fpTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const t = e.touches[0];
    fpBeginDraw(t.clientX, t.clientY);
  }
  function fpTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const t = e.touches[0];
    fpContinueDraw(t.clientX, t.clientY);
  }
  function fpTouchEnd(e: React.TouchEvent<HTMLCanvasElement>) { e.preventDefault(); fpEndDraw(); }

  function fpUndo() {
    const canvas = fpCanvasRef.current;
    if (!canvas || fpHistoryRef.current.length === 0) return;
    const prev = fpHistoryRef.current.pop()!;
    canvas.getContext("2d")!.putImageData(prev, 0, 0);
  }

  function fpClear() {
    const canvas = fpCanvasRef.current;
    if (!canvas || !fpBaseImageRef.current) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(fpBaseImageRef.current, 0, 0, canvas.width, canvas.height);
    fpHistoryRef.current = [];
  }

  function fpCancelAnnotate() {
    setFpAnnotating(false);
    setFpBaseDataUrl(null);
    fpHistoryRef.current = [];
    fpBaseImageRef.current = null;
  }

  // Draw the base floor plan image onto the canvas once it's in the DOM.
  // fpAnnotating=true puts the canvas in the DOM; then this effect fires.
  useEffect(() => {
    if (!fpAnnotating || !fpBaseDataUrl) return;
    const canvas = fpCanvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#E53E3E";
      ctx.lineWidth   = 3;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      fpBaseImageRef.current = img;
      fpHistoryRef.current   = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
    };
    img.src = fpBaseDataUrl;
  }, [fpAnnotating, fpBaseDataUrl]);

  async function fpStartAnnotate(existingDataUrl?: string) {
    const dataUrl = existingDataUrl ?? (fpFile ? await readFileAsDataURL(fpFile) : null);
    if (!dataUrl) return;
    fpHistoryRef.current = [];
    fpBaseImageRef.current = null;
    setFpBaseDataUrl(dataUrl);
    setFpAnnotating(true);
  }

  async function fpSaveAnnotation() {
    const canvas = fpCanvasRef.current;
    if (!canvas) return;
    setFpUploading(true);
    try {
      const annotatedDataUrl = canvas.toDataURL("image/jpeg", 0.88);

      // Delete existing floorplan image if any
      if (floorplanImage) {
        await authFetch(`/api/dev/unit-types/${unitTypeId}/images/${floorplanImage.id}`, { method: "DELETE" });
        setImages(prev => prev.filter(img => img.id !== floorplanImage.id));
      }

      // Upload new annotated floor plan
      const res = await authFetch(`/api/dev/unit-types/${unitTypeId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "floorplan",
          label: "Floor Plan",
          imageData: annotatedDataUrl,
          order: 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Upload failed");
      }
      const d = await res.json();
      setImages(prev => [...prev.filter(img => img.type !== "floorplan"), d.image]);
      setFpAnnotating(false);
      setFpBaseDataUrl(null);
      setFpFile(null);
      if (fpFileInputRef.current) fpFileInputRef.current.value = "";
      fpHistoryRef.current   = [];
      fpBaseImageRef.current = null;
      setToast("Floor plan saved");
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setFpUploading(false);
    }
  }

  async function fpDeleteFloorplan() {
    if (!floorplanImage) return;
    try {
      const res = await authFetch(
        `/api/dev/unit-types/${unitTypeId}/images/${floorplanImage.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed");
      setImages(prev => prev.filter(img => img.id !== floorplanImage.id));
      setToast("Floor plan removed");
    } catch (err) {
      setToast((err as Error).message);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#F7F5F1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "2rem",
            height: "2rem",
            borderRadius: "50%",
            border: "2px solid rgba(28,27,25,0.08)",
            borderTopColor: "#1F4B4A",
            animation: "spin 0.9s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  if (loadError || !unitType) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#F7F5F1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-inter, sans-serif)",
        }}
      >
        <div
          style={{
            background: "#FAE8E8",
            borderRadius: "0.875rem",
            padding: "1.25rem 1.5rem",
            color: "#B04040",
            fontSize: "0.9375rem",
          }}
        >
          {loadError || "Unit type not found."}
        </div>
      </main>
    );
  }

  const tourScenes = panoramaImages.map((img) => ({
    id: img.id,
    label: img.label || "Room",
    panoramaUrl: img.imageData,
  }));

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F7F5F1",
        fontFamily: "var(--font-inter, sans-serif)",
        paddingBottom: "4rem",
      }}
    >
      <style>{`
        @media (max-width: 640px) {
          .hn-prop-3col { grid-template-columns: 1fr !important; }
          .hn-prop-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1C1B19",
            color: "#FAF8F4",
            borderRadius: "0.625rem",
            padding: "0.75rem 1.25rem",
            fontSize: "0.9rem",
            fontWeight: 500,
            boxShadow: "0 4px 24px rgba(0,0,0,0.22)",
            zIndex: 9999,
            whiteSpace: "nowrap",
          }}
        >
          {toast}
        </div>
      )}

      {/* Page header */}
      <div style={{ borderBottom: "1px solid #DDD9D3", background: "#fff" }}>
        <div
          style={{ maxWidth: "56rem", margin: "0 auto", padding: "1.5rem" }}
        >
          <div
            style={{
              fontFamily: "var(--font-fraunces, serif)",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#1F4B4A",
              marginBottom: "0.5rem",
            }}
          >
            Haveniq — Developer Portal
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-fraunces, serif)",
                  fontSize: "1.875rem",
                  fontWeight: 700,
                  color: "#1C1B19",
                  margin: 0,
                }}
              >
                {unitType.unitLabel}
              </h1>
              <p
                style={{
                  margin: "0.375rem 0 0",
                  color: "#6B6860",
                  fontSize: "0.9375rem",
                }}
              >
                {unitType.project.name}
                {unitType.project.location
                  ? ` · ${unitType.project.location}`
                  : ""}
              </p>
            </div>
            <a
              href="/dev/dashboard"
              style={{
                fontSize: "0.875rem",
                color: "#1F4B4A",
                fontWeight: 600,
                textDecoration: "none",
                alignSelf: "center",
              }}
            >
              ← Dashboard
            </a>
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth: "56rem",
          margin: "0 auto",
          padding: "2rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {/* ── Section 1: Basic info ── */}
        <div style={cardStyle}>
          <div style={sectionHeaderStyle as React.CSSProperties}>
            Basic information
          </div>
          <form
            onSubmit={saveBasicInfo}
            style={{
              padding: "1.375rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {/* Unit label */}
            <div>
              <label style={labelStyle}>Unit label</label>
              <input
                type="text"
                value={form.unitLabel}
                onChange={setField("unitLabel")}
                style={inputStyle}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>

            {/* Price + inventory */}
            <div
              className="hn-prop-3col"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0.75rem",
              }}
            >
              <div>
                <label style={labelStyle}>Price (£)</label>
                <input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={setField("price")}
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
              <div>
                <label style={labelStyle}>Total units</label>
                <input
                  type="number"
                  min={0}
                  value={form.quantityTotal}
                  onChange={setField("quantityTotal")}
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
              <div>
                <label style={labelStyle}>Available</label>
                <input
                  type="number"
                  min={0}
                  value={form.quantityAvailable}
                  onChange={setField("quantityAvailable")}
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
            </div>

            {/* EIL + AIL */}
            <div
              className="hn-prop-2col"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
              }}
            >
              <div>
                <label style={labelStyle}>Min score (eil)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.eil}
                  onChange={setField("eil")}
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
              <div>
                <label style={labelStyle}>Target score (ail)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.ail}
                  onChange={setField("ail")}
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={form.description}
                onChange={setField("description")}
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: "5rem",
                }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>

            {basicError && (
              <div
                style={{
                  padding: "0.625rem 0.875rem",
                  background: "#FAE8E8",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  color: "#B04040",
                }}
              >
                {basicError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={basicSaving}
                style={{
                  ...primaryBtnStyle,
                  opacity: basicSaving ? 0.65 : 1,
                  cursor: basicSaving ? "not-allowed" : "pointer",
                }}
              >
                {basicSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>

        {/* ── Section 2: Gallery photos ── */}
        <div style={cardStyle}>
          <div style={sectionHeaderStyle as React.CSSProperties}>
            Gallery photos
          </div>
          <div
            style={{
              padding: "1.375rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {/* Upload controls */}
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: "14rem" }}>
                <label style={labelStyle}>Add photos</label>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleGalleryFilesChange}
                  style={{ fontSize: "0.875rem", color: "#1C1B19" }}
                />
              </div>
              <button
                type="button"
                onClick={uploadGalleryImages}
                disabled={galleryUploading || galleryFiles.length === 0}
                style={{
                  ...primaryBtnStyle,
                  opacity:
                    galleryUploading || galleryFiles.length === 0 ? 0.55 : 1,
                  cursor:
                    galleryUploading || galleryFiles.length === 0
                      ? "not-allowed"
                      : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {galleryUploading
                  ? "Uploading…"
                  : `Upload${galleryFiles.length > 0 ? ` (${galleryFiles.length})` : ""}`}
              </button>
            </div>

            {/* 5MB warning */}
            {gallerySizeWarn && (
              <div
                style={{
                  padding: "0.625rem 0.875rem",
                  background: "#FBF4E4",
                  borderRadius: "0.5rem",
                  fontSize: "0.8125rem",
                  color: "#A07020",
                  border: "1px solid #F0D98A",
                }}
              >
                One or more files exceed 5 MB — large images will slow down
                page loads. Consider compressing before uploading.
              </div>
            )}

            {/* Gallery grid */}
            {galleryImages.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(10rem, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {galleryImages.map((img) => (
                  <GalleryThumb
                    key={img.id}
                    img={img}
                    onDelete={deleteGalleryImage}
                  />
                ))}
              </div>
            )}

            {galleryImages.length === 0 && (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "#9A958F",
                  fontSize: "0.9rem",
                  background: "#F7F5F1",
                  borderRadius: "0.5rem",
                  border: "1px dashed #DDD9D3",
                }}
              >
                No gallery photos yet. Upload images above.
              </div>
            )}
          </div>
        </div>

        {/* ── Section 3: 360° Virtual Tour ── */}
        <div style={cardStyle}>
          <div style={sectionHeaderStyle as React.CSSProperties}>
            360° Virtual Tour
          </div>
          <div
            style={{
              padding: "1.375rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            {/* Add room */}
            <div
              style={{
                background: "#F7F5F1",
                borderRadius: "0.625rem",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  color: "#55534C",
                }}
              >
                Add room
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: "10rem" }}>
                  <label style={labelStyle}>Room label</label>
                  <input
                    type="text"
                    placeholder="e.g. Living Room"
                    value={tourRoomLabel}
                    onChange={(e) => setTourRoomLabel(e.target.value)}
                    style={inputStyle}
                    onFocus={focusBorder}
                    onBlur={blurBorder}
                  />
                </div>
                <div style={{ flex: 1, minWidth: "10rem" }}>
                  <label style={labelStyle}>360° panorama image</label>
                  <input
                    ref={tourFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleTourFileChange}
                    style={{ fontSize: "0.875rem", color: "#1C1B19" }}
                  />
                </div>
                <button
                  type="button"
                  onClick={addTourRoom}
                  disabled={
                    tourUploading || !tourFile || !tourRoomLabel.trim()
                  }
                  style={{
                    ...primaryBtnStyle,
                    opacity:
                      tourUploading || !tourFile || !tourRoomLabel.trim()
                        ? 0.55
                        : 1,
                    cursor:
                      tourUploading || !tourFile || !tourRoomLabel.trim()
                        ? "not-allowed"
                        : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tourUploading ? "Adding…" : "Add room"}
                </button>
              </div>

              {tourSizeWarn && (
                <div
                  style={{
                    padding: "0.625rem 0.875rem",
                    background: "#FBF4E4",
                    borderRadius: "0.5rem",
                    fontSize: "0.8125rem",
                    color: "#A07020",
                    border: "1px solid #F0D98A",
                  }}
                >
                  One or more files exceed 5 MB — large images will slow down
                  page loads. Consider compressing before uploading.
                </div>
              )}
            </div>

            {/* Room list */}
            {panoramaImages.length > 0 && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#9A958F",
                    marginBottom: "0.25rem",
                  }}
                >
                  Rooms ({panoramaImages.length})
                </div>
                {panoramaImages.map((img, idx) => (
                  <div
                    key={img.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.625rem 0.875rem",
                      background: "#fff",
                      border: "1px solid #DDD9D3",
                      borderRadius: "0.625rem",
                    }}
                  >
                    {/* Thumbnail */}
                    <img
                      src={img.imageData}
                      alt={img.label}
                      style={{
                        width: 60,
                        height: 60,
                        objectFit: "cover",
                        borderRadius: 8,
                        flexShrink: 0,
                        background: "#F0EDE8",
                      }}
                    />

                    {/* Label */}
                    <div
                      style={{
                        flex: 1,
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        color: "#1C1B19",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {img.label || "Untitled room"}
                    </div>

                    {/* Reorder + delete */}
                    <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => movePanorama(idx, "up")}
                        disabled={idx === 0}
                        title="Move up"
                        style={{
                          background: "none",
                          border: "1px solid #DDD9D3",
                          borderRadius: "0.375rem",
                          padding: "0.25rem 0.5rem",
                          cursor: idx === 0 ? "not-allowed" : "pointer",
                          color: idx === 0 ? "#C9C5BF" : "#55534C",
                          fontSize: "0.875rem",
                          lineHeight: 1,
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => movePanorama(idx, "down")}
                        disabled={idx === panoramaImages.length - 1}
                        title="Move down"
                        style={{
                          background: "none",
                          border: "1px solid #DDD9D3",
                          borderRadius: "0.375rem",
                          padding: "0.25rem 0.5rem",
                          cursor:
                            idx === panoramaImages.length - 1
                              ? "not-allowed"
                              : "pointer",
                          color:
                            idx === panoramaImages.length - 1
                              ? "#C9C5BF"
                              : "#55534C",
                          fontSize: "0.875rem",
                          lineHeight: 1,
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePanoramaRoom(img.id)}
                        title="Remove room"
                        style={{
                          background: "none",
                          border: "1px solid #DDD9D3",
                          borderRadius: "0.375rem",
                          padding: "0.25rem 0.5rem",
                          cursor: "pointer",
                          color: "#B04040",
                          fontSize: "0.875rem",
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Live tour preview */}
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#9A958F",
                  marginBottom: "0.75rem",
                }}
              >
                Live preview
              </div>
              {tourScenes.length > 0 ? (
                <VirtualTour scenes={tourScenes} />
              ) : (
                <div
                  style={{
                    padding: "3rem 2rem",
                    textAlign: "center",
                    color: "#9A958F",
                    fontSize: "0.9rem",
                    background: "#F7F5F1",
                    borderRadius: "0.875rem",
                    border: "1px dashed #DDD9D3",
                  }}
                >
                  Add at least one room to preview the tour
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 4: Floor Plan ── */}
        <div style={cardStyle}>
          <div style={sectionHeaderStyle as React.CSSProperties}>
            Floor Plan
          </div>
          <div
            style={{
              padding: "1.375rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {/* Existing floor plan */}
            {floorplanImage && !fpAnnotating && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958F" }}>
                  Saved floor plan
                </div>
                <img
                  src={floorplanImage.imageData}
                  alt="Floor plan"
                  style={{ width: "100%", borderRadius: 8, border: "1px solid rgba(28,27,25,0.08)", maxHeight: 480, objectFit: "contain", background: "#F7F5F1" }}
                />
                <div style={{ display: "flex", gap: "0.625rem" }}>
                  <button
                    type="button"
                    onClick={() => fpStartAnnotate(floorplanImage.imageData)}
                    style={{ ...primaryBtnStyle, fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
                  >
                    Re-annotate
                  </button>
                  <button
                    type="button"
                    onClick={fpDeleteFloorplan}
                    style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#B04040", background: "none", border: "1px solid #B04040", borderRadius: 999, padding: "0.4rem 0.875rem", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            {/* Upload area (when no floor plan and not annotating) */}
            {!floorplanImage && !fpAnnotating && (
              <div
                style={{
                  background: "#F7F5F1",
                  borderRadius: "0.625rem",
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#55534C" }}>
                  Upload floor plan image
                </div>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: "12rem" }}>
                    <label style={labelStyle}>Floor plan image</label>
                    <input
                      ref={fpFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={e => setFpFile(e.target.files?.[0] ?? null)}
                      style={{ fontSize: "0.875rem", color: "#1C1B19" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={fpStartAnnotate}
                    disabled={!fpFile}
                    style={{
                      ...primaryBtnStyle,
                      opacity: !fpFile ? 0.55 : 1,
                      cursor: !fpFile ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      fontSize: "0.875rem",
                    }}
                  >
                    Upload &amp; annotate
                  </button>
                </div>
              </div>
            )}

            {/* Annotation canvas */}
            {fpAnnotating && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#55534C" }}>
                  Annotate — draw in red over the floor plan
                </div>
                <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
                  <canvas
                    ref={fpCanvasRef}
                    style={{ width: "100%", borderRadius: 8, touchAction: "none", cursor: "crosshair", display: "block", border: "1px solid #DDD9D3" }}
                    onMouseDown={fpMouseDown}
                    onMouseMove={fpMouseMove}
                    onMouseUp={fpMouseUp}
                    onMouseLeave={fpMouseLeave}
                    onTouchStart={fpTouchStart}
                    onTouchMove={fpTouchMove}
                    onTouchEnd={fpTouchEnd}
                  />
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={fpUndo}
                    style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#55534C", background: "none", border: "1px solid #DDD9D3", borderRadius: "0.375rem", padding: "0.35rem 0.75rem", cursor: "pointer" }}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={fpClear}
                    style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#55534C", background: "none", border: "1px solid #DDD9D3", borderRadius: "0.375rem", padding: "0.35rem 0.75rem", cursor: "pointer" }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={fpCancelAnnotate}
                    style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860", background: "none", border: "1px solid #DDD9D3", borderRadius: "0.375rem", padding: "0.35rem 0.75rem", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={fpSaveAnnotation}
                    disabled={fpUploading}
                    style={{ ...primaryBtnStyle, fontSize: "0.8125rem", padding: "0.35rem 0.875rem", opacity: fpUploading ? 0.65 : 1, cursor: fpUploading ? "not-allowed" : "pointer" }}
                  >
                    {fpUploading ? "Saving…" : "Save floor plan"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Gallery thumbnail sub-component ──────────────────────────────────────────

function GalleryThumb({
  img,
  onDelete,
}: {
  img: ListingImage;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: "relative", borderRadius: "0.5rem", overflow: "hidden" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div style={{ aspectRatio: "4/3", background: "#F0EDE8" }}>
        <img
          src={img.imageData}
          alt={img.label}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>

      {/* Label */}
      <div
        style={{
          padding: "0.3rem 0.5rem",
          fontSize: "0.75rem",
          color: "#6B6860",
          background: "#fff",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          borderTop: "1px solid #F0EDE8",
        }}
      >
        {img.label}
      </div>

      {/* Delete button (always visible for accessibility; highlighted on hover) */}
      <button
        type="button"
        onClick={() => onDelete(img.id)}
        aria-label={`Remove ${img.label}`}
        style={{
          position: "absolute",
          top: "0.375rem",
          right: "0.375rem",
          background: hovered ? "rgba(176,64,64,0.9)" : "rgba(28,27,25,0.55)",
          color: "#fff",
          border: "none",
          borderRadius: "50%",
          width: "1.5rem",
          height: "1.5rem",
          fontSize: "0.6875rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          transition: "background 0.15s",
        }}
      >
        ✕
      </button>
    </div>
  );
}
