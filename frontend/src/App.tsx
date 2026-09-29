import { type FormEvent, useEffect, useState } from "react";

type Medicine = {
  id: number;
  genericName: string;
  brandName: string;
  categoryId: number;
  unit: string;
  reorderLevel: number;
  batches: { quantity: number }[];
};

type Category = { id: number; name: string };

type MedicineForm = {
  genericName: string;
  brandName: string;
  categoryId: string;
  unit: string;
  reorderLevel: string;
};

type ApiResponse = {
  success: boolean;
  data: Medicine[];
};

type Session = {
  token: string;
  user: { name: string; role: string };
};

function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const storedSession = sessionStorage.getItem("pharmasense-session");
    return storedSession ? (JSON.parse(storedSession) as Session) : null;
  });
  const [email, setEmail] = useState("admin@pharmasense.local");
  const [password, setPassword] = useState("admin12345");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<MedicineForm>({
    genericName: "",
    brandName: "",
    categoryId: "",
    unit: "Tablet",
    reorderLevel: "0",
  });

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }

    const loadInventory = async () => {
      try {
        const headers = { Authorization: `Bearer ${session.token}` };
        const [medicineResponse, categoryResponse] = await Promise.all([
          fetch("http://localhost:5000/api/v1/medicines", { headers }),
          fetch("http://localhost:5000/api/v1/categories", { headers }),
        ]);
        if (!medicineResponse.ok || !categoryResponse.ok) {
          throw new Error("The inventory service returned an error.");
        }

        const medicineResult = (await medicineResponse.json()) as ApiResponse;
        const categoryResult = (await categoryResponse.json()) as {
          success: boolean;
          data: Category[];
        };
        setMedicines(medicineResult.data);
        setCategories(categoryResult.data);
        setError("");
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load inventory.",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadInventory();
  }, [session]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");

    try {
      const response = await fetch("http://localhost:5000/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as {
        success: boolean;
        data?: Session;
        error?: string;
      };
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error ?? "Unable to sign in.");
      }

      sessionStorage.setItem(
        "pharmasense-session",
        JSON.stringify(result.data),
      );
      setSession(result.data);
    } catch (requestError) {
      setLoginError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign in.",
      );
    } finally {
      setLoggingIn(false);
    }
  };

  const openCreateForm = () => {
    setEditingMedicine(null);
    setForm({
      genericName: "",
      brandName: "",
      categoryId: categories[0] ? String(categories[0].id) : "",
      unit: "Tablet",
      reorderLevel: "0",
    });
    setFormError("");
    setFormOpen(true);
  };

  const openEditForm = (medicine: Medicine) => {
    setEditingMedicine(medicine);
    setForm({
      genericName: medicine.genericName,
      brandName: medicine.brandName,
      categoryId: String(medicine.categoryId),
      unit: medicine.unit,
      reorderLevel: String(medicine.reorderLevel),
    });
    setFormError("");
    setFormOpen(true);
  };

  const handleMedicineSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setFormError("");
    try {
      const endpoint = editingMedicine
        ? `http://localhost:5000/api/v1/medicines/${editingMedicine.id}`
        : "http://localhost:5000/api/v1/medicines";
      const response = await fetch(endpoint, {
        method: editingMedicine ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          ...form,
          categoryId: Number(form.categoryId),
          reorderLevel: Number(form.reorderLevel),
        }),
      });
      const result = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !result.success) {
        throw new Error(typeof result.error === "string" ? result.error : "Unable to save medicine.");
      }

      setFormOpen(false);
      setEditingMedicine(null);
      const refreshed = await fetch("http://localhost:5000/api/v1/medicines", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const refreshedResult = (await refreshed.json()) as ApiResponse;
      setMedicines(refreshedResult.data);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Unable to save medicine.");
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md bg-white p-8 rounded-xl shadow-sm border border-gray-200"
        >
          <p className="text-sm font-semibold text-blue-600 mb-2">
            PHARMASENSE
          </p>
          <h1 className="text-3xl font-bold text-gray-900">Sign in</h1>
          <p className="text-gray-600 mt-2 mb-6">
            Manage your pharmacy inventory securely.
          </p>
          {loginError && (
            <p className="mb-4 p-3 rounded bg-red-50 text-red-700">
              {loginError}
            </p>
          )}
          <label
            className="block text-sm font-medium text-gray-700 mb-2"
            htmlFor="email"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
            required
          />
          <label
            className="block text-sm font-medium text-gray-700 mb-2"
            htmlFor="password"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-6"
            required
          />
          <button
            type="submit"
            disabled={loggingIn}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loggingIn ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  const totalUnits = medicines.reduce(
    (total, medicine) =>
      total +
      medicine.batches.reduce(
        (batchTotal, batch) => batchTotal + batch.quantity,
        0,
      ),
    0,
  );
  const lowStockCount = medicines.filter((medicine) => {
    const quantity = medicine.batches.reduce(
      (total, batch) => total + batch.quantity,
      0,
    );
    return quantity <= medicine.reorderLevel;
  }).length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            PharmaSense Dashboard
          </h1>
          <p className="text-gray-600 mt-1">
            Agent-Based Medicine Stock Management System
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">
              {session.user.name}
            </p>
            <p className="text-xs text-gray-500">{session.user.role}</p>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem("pharmasense-session");
              setSession(null);
            }}
            className="text-gray-600 hover:text-gray-900 font-medium"
          >
            Sign out
          </button>
        </div>
        <button
          onClick={openCreateForm}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
        >
          + Add Medicine
        </button>
      </header>

      {formOpen && (
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6">
          <form
            onSubmit={handleMedicineSave}
            className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {editingMedicine ? "Edit medicine" : "Add medicine"}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="text-gray-500 hover:text-gray-900"
              >
                Close
              </button>
            </div>
            {formError && <p className="mb-4 p-3 rounded bg-red-50 text-red-700">{formError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-gray-700">
                Generic name
                <input
                  value={form.genericName}
                  onChange={(event) => setForm({ ...form, genericName: event.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Brand name
                <input
                  value={form.brandName}
                  onChange={(event) => setForm({ ...form, brandName: event.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Category
                <select
                  value={form.categoryId}
                  onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  <option value="" disabled>Select a category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Unit
                <input
                  value={form.unit}
                  onChange={(event) => setForm({ ...form, unit: event.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Reorder level
                <input
                  type="number"
                  min="0"
                  value={form.reorderLevel}
                  onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-900">Cancel</button>
              <button type="submit" disabled={saving || categories.length === 0} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving..." : "Save medicine"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 font-medium mb-2">
            Total Medicines (SKUs)
          </h3>
          <p className="text-3xl font-bold text-gray-900">{medicines.length}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 font-medium mb-2">Low Stock Alerts</h3>
          <p className="text-3xl font-bold text-red-600">{lowStockCount}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 font-medium mb-2">Expiring Soon</h3>
          <p className="text-3xl font-bold text-orange-500">{totalUnits}</p>
          <p className="text-gray-500 text-sm mt-1">Total units in stock</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">
            Inventory Overview
          </h2>
        </div>
        {error && <p className="p-6 text-red-700 bg-red-50">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Generic Name</th>
                <th className="px-6 py-4">Brand Name</th>
                <th className="px-6 py-4">Unit</th>
                <th className="px-6 py-4">Reorder Level</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Loading inventory data...
                  </td>
                </tr>
              ) : medicines.length === 0 && !error ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No medicines have been added yet.
                  </td>
                </tr>
              ) : (
                medicines.map((med) => (
                  <tr key={med.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {med.genericName}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{med.brandName}</td>
                    <td className="px-6 py-4 text-gray-600">{med.unit}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {med.batches.reduce(
                        (total, batch) => total + batch.quantity,
                        0,
                      )}{" "}
                      / {med.reorderLevel}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openEditForm(med)} className="text-blue-600 hover:text-blue-800 font-medium">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
