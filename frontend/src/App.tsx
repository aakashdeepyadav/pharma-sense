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

type Supplier = {
  id: number;
  name: string;
  contactInfo: string | null;
  _count?: { batches: number };
};

type Batch = {
  id: number;
  medicineId: number;
  supplierId: number;
  batchNumber: string;
  mfgDate: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  medicine: { genericName: string; brandName: string };
  supplier: { name: string };
};

type StockTransaction = {
  id: number;
  type: "IN" | "OUT" | "ADJ";
  quantity: number;
  timestamp: string;
  notes: string | null;
  batch: { batchNumber: string; medicine: { genericName: string } };
  user: { name: string };
};

type InventoryAlert = {
  id: number;
  type: "OUT_OF_STOCK" | "LOW_STOCK" | "EXPIRED" | "EXPIRING_SOON";
  severity: "critical" | "warning";
  status: "OPEN" | "ACKNOWLEDGED";
  medicineId: number;
  batchId?: number;
  message: string;
  quantity: number;
  expiryDate?: string;
};

type ReportSummary = {
  medicineCount: number;
  supplierCount: number;
  batchCount: number;
  totalUnits: number;
  inventoryCost: number;
  issuedUnits: number;
  topIssuedMedicines: {
    medicineId: number;
    medicineName: string;
    quantityIssued: number;
  }[];
};

type AuditLog = {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  details: string | null;
  createdAt: string;
  user: { name: string; role: { name: string } };
};

type MedicineForm = {
  genericName: string;
  brandName: string;
  categoryId: string;
  unit: string;
  reorderLevel: string;
};

type SupplierForm = {
  name: string;
  contactInfo: string;
};

type BatchForm = {
  medicineId: string;
  supplierId: string;
  batchNumber: string;
  mfgDate: string;
  expiryDate: string;
  quantity: string;
  purchasePrice: string;
};

type StockForm = {
  batchId: string;
  type: "OUT" | "ADJ";
  quantity: string;
  notes: string;
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(() => session !== null);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>({
    name: "",
    contactInfo: "",
  });
  const [batchFormOpen, setBatchFormOpen] = useState(false);
  const [batchForm, setBatchForm] = useState<BatchForm>({
    medicineId: "",
    supplierId: "",
    batchNumber: "",
    mfgDate: "",
    expiryDate: "",
    quantity: "0",
    purchasePrice: "0",
  });
  const [stockFormOpen, setStockFormOpen] = useState(false);
  const [stockForm, setStockForm] = useState<StockForm>({
    batchId: "",
    type: "OUT",
    quantity: "1",
    notes: "",
  });
  const [form, setForm] = useState<MedicineForm>({
    genericName: "",
    brandName: "",
    categoryId: "",
    unit: "Tablet",
    reorderLevel: "0",
  });

  useEffect(() => {
    if (!session) {
      return;
    }

    const loadInventory = async () => {
      try {
        const headers = { Authorization: `Bearer ${session.token}` };
        const [
          medicineResponse,
          categoryResponse,
          supplierResponse,
          batchResponse,
          transactionResponse,
          alertResponse,
          reportResponse,
        ] = await Promise.all([
          fetch("http://localhost:5000/api/v1/medicines", { headers }),
          fetch("http://localhost:5000/api/v1/categories", { headers }),
          fetch("http://localhost:5000/api/v1/suppliers", { headers }),
          fetch("http://localhost:5000/api/v1/batches", { headers }),
          fetch("http://localhost:5000/api/v1/inventory/transactions", {
            headers,
          }),
          fetch("http://localhost:5000/api/v1/alerts", { headers }),
          fetch("http://localhost:5000/api/v1/reports/summary", { headers }),
        ]);
        if (
          !medicineResponse.ok ||
          !categoryResponse.ok ||
          !supplierResponse.ok ||
          !batchResponse.ok ||
          !transactionResponse.ok ||
          !alertResponse.ok ||
          !reportResponse.ok
        ) {
          throw new Error("The inventory service returned an error.");
        }

        const medicineResult = (await medicineResponse.json()) as ApiResponse;
        const categoryResult = (await categoryResponse.json()) as {
          success: boolean;
          data: Category[];
        };
        const supplierResult = (await supplierResponse.json()) as {
          success: boolean;
          data: Supplier[];
        };
        const batchResult = (await batchResponse.json()) as {
          success: boolean;
          data: Batch[];
        };
        const transactionResult = (await transactionResponse.json()) as {
          success: boolean;
          data: StockTransaction[];
        };
        const alertResult = (await alertResponse.json()) as {
          success: boolean;
          data: InventoryAlert[];
        };
        const reportResult = (await reportResponse.json()) as {
          success: boolean;
          data: ReportSummary;
        };
        setMedicines(medicineResult.data);
        setCategories(categoryResult.data);
        setSuppliers(supplierResult.data);
        setBatches(batchResult.data);
        setTransactions(transactionResult.data);
        setAlerts(alertResult.data);
        setReport(reportResult.data);
        if (
          session.user.role === "Admin" ||
          session.user.role === "Inventory Manager"
        ) {
          const auditResponse = await fetch(
            "http://localhost:5000/api/v1/audit-logs",
            { headers },
          );
          if (auditResponse.ok) {
            const auditResult = (await auditResponse.json()) as {
              data: AuditLog[];
            };
            setAuditLogs(auditResult.data);
          }
        } else {
          setAuditLogs([]);
        }
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
      setLoading(true);
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
      const result = (await response.json()) as {
        success: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Unable to save medicine.",
        );
      }

      setFormOpen(false);
      setEditingMedicine(null);
      const refreshed = await fetch("http://localhost:5000/api/v1/medicines", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const refreshedResult = (await refreshed.json()) as ApiResponse;
      setMedicines(refreshedResult.data);
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save medicine.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openCreateSupplierForm = () => {
    setEditingSupplier(null);
    setSupplierForm({ name: "", contactInfo: "" });
    setFormError("");
    setSupplierFormOpen(true);
  };

  const openEditSupplierForm = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({
      name: supplier.name,
      contactInfo: supplier.contactInfo ?? "",
    });
    setFormError("");
    setSupplierFormOpen(true);
  };

  const handleSupplierSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setFormError("");
    try {
      const endpoint = editingSupplier
        ? `http://localhost:5000/api/v1/suppliers/${editingSupplier.id}`
        : "http://localhost:5000/api/v1/suppliers";
      const response = await fetch(endpoint, {
        method: editingSupplier ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(supplierForm),
      });
      const result = (await response.json()) as {
        success: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Unable to save supplier.",
        );
      }

      const refreshed = await fetch("http://localhost:5000/api/v1/suppliers", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const refreshedResult = (await refreshed.json()) as { data: Supplier[] };
      setSuppliers(refreshedResult.data);
      setSupplierFormOpen(false);
      setEditingSupplier(null);
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save supplier.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openCreateBatchForm = () => {
    setBatchForm({
      medicineId: medicines[0] ? String(medicines[0].id) : "",
      supplierId: suppliers[0] ? String(suppliers[0].id) : "",
      batchNumber: "",
      mfgDate: "",
      expiryDate: "",
      quantity: "0",
      purchasePrice: "0",
    });
    setFormError("");
    setBatchFormOpen(true);
  };

  const handleBatchSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("http://localhost:5000/api/v1/batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          ...batchForm,
          medicineId: Number(batchForm.medicineId),
          supplierId: Number(batchForm.supplierId),
          quantity: Number(batchForm.quantity),
          purchasePrice: Number(batchForm.purchasePrice),
        }),
      });
      const result = (await response.json()) as {
        success: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Unable to receive batch.",
        );
      }

      const headers = { Authorization: `Bearer ${session.token}` };
      const [batchResponse, medicineResponse] = await Promise.all([
        fetch("http://localhost:5000/api/v1/batches", { headers }),
        fetch("http://localhost:5000/api/v1/medicines", { headers }),
      ]);
      const batchResult = (await batchResponse.json()) as { data: Batch[] };
      const medicineResult = (await medicineResponse.json()) as ApiResponse;
      setBatches(batchResult.data);
      setMedicines(medicineResult.data);
      setBatchFormOpen(false);
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to receive batch.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openStockForm = (batch: Batch, type: "OUT" | "ADJ") => {
    setStockForm({
      batchId: String(batch.id),
      type,
      quantity: type === "OUT" ? "1" : "0",
      notes: "",
    });
    setFormError("");
    setStockFormOpen(true);
  };

  const handleStockSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(
        "http://localhost:5000/api/v1/inventory/transactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({
            ...stockForm,
            batchId: Number(stockForm.batchId),
            quantity: Number(stockForm.quantity),
          }),
        },
      );
      const result = (await response.json()) as {
        success: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Unable to record stock movement.",
        );
      }

      const headers = { Authorization: `Bearer ${session.token}` };
      const [batchResponse, medicineResponse, transactionResponse] =
        await Promise.all([
          fetch("http://localhost:5000/api/v1/batches", { headers }),
          fetch("http://localhost:5000/api/v1/medicines", { headers }),
          fetch("http://localhost:5000/api/v1/inventory/transactions", {
            headers,
          }),
        ]);
      const batchResult = (await batchResponse.json()) as { data: Batch[] };
      const medicineResult = (await medicineResponse.json()) as ApiResponse;
      const transactionResult = (await transactionResponse.json()) as {
        data: StockTransaction[];
      };
      setBatches(batchResult.data);
      setMedicines(medicineResult.data);
      setTransactions(transactionResult.data);
      setStockFormOpen(false);
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to record stock movement.",
      );
    } finally {
      setSaving(false);
    }
  };

  const acknowledgeAlert = async (alertId: number) => {
    if (!session) return;
    const response = await fetch(
      `http://localhost:5000/api/v1/alerts/${alertId}/acknowledge`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.token}` },
      },
    );
    if (!response.ok) {
      setError("Unable to acknowledge alert.");
      return;
    }
    const refreshed = await fetch("http://localhost:5000/api/v1/alerts", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const result = (await refreshed.json()) as { data: InventoryAlert[] };
    setAlerts(result.data);
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

  const lowStockCount = medicines.filter((medicine) => {
    const quantity = medicine.batches.reduce(
      (total, batch) => total + batch.quantity,
      0,
    );
    return quantity <= medicine.reorderLevel;
  }).length;
  const expiringSoonCount = alerts.filter(
    (alert) => alert.type === "EXPIRING_SOON" || alert.type === "EXPIRED",
  ).length;
  const canWriteMedicines = [
    "Admin",
    "Pharmacist",
    "Inventory Manager",
  ].includes(session.user.role);
  const canReceiveStock = ["Admin", "Pharmacist", "Inventory Manager"].includes(
    session.user.role,
  );
  const canManageSuppliers = ["Admin", "Inventory Manager"].includes(
    session.user.role,
  );
  const canWriteStock = [
    "Admin",
    "Pharmacist",
    "Inventory Manager",
    "Staff",
  ].includes(session.user.role);
  const canViewAudit = ["Admin", "Inventory Manager"].includes(
    session.user.role,
  );

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
        <div className="flex gap-3">
          {canReceiveStock && (
            <button
              onClick={openCreateBatchForm}
              disabled={medicines.length === 0 || suppliers.length === 0}
              className="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg font-medium hover:bg-blue-50 transition disabled:opacity-50"
            >
              Receive stock
            </button>
          )}
          {canManageSuppliers && (
            <button
              onClick={openCreateSupplierForm}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition"
            >
              + Supplier
            </button>
          )}
          {canWriteMedicines && (
            <button
              onClick={openCreateForm}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              + Add Medicine
            </button>
          )}
        </div>
      </header>

      {stockFormOpen && (
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6">
          <form
            onSubmit={handleStockSave}
            className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {stockForm.type === "OUT" ? "Issue stock" : "Adjust stock"}
              </h2>
              <button
                type="button"
                onClick={() => setStockFormOpen(false)}
                className="text-gray-500 hover:text-gray-900"
              >
                Close
              </button>
            </div>
            {formError && (
              <p className="mb-4 p-3 rounded bg-red-50 text-red-700">
                {formError}
              </p>
            )}
            <p className="text-sm text-gray-600 mb-4">
              {
                batches.find((batch) => String(batch.id) === stockForm.batchId)
                  ?.medicine.genericName
              }{" "}
              - batch{" "}
              {
                batches.find((batch) => String(batch.id) === stockForm.batchId)
                  ?.batchNumber
              }
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-4">
              {stockForm.type === "ADJ"
                ? "Adjustment quantity (+/-)"
                : "Quantity issued"}
              <input
                type="number"
                min={stockForm.type === "OUT" ? "1" : undefined}
                value={stockForm.quantity}
                onChange={(event) =>
                  setStockForm({ ...stockForm, quantity: event.target.value })
                }
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Reason or notes
              <textarea
                value={stockForm.notes}
                onChange={(event) =>
                  setStockForm({ ...stockForm, notes: event.target.value })
                }
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                rows={3}
                required
              />
            </label>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setStockFormOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save movement"}
              </button>
            </div>
          </form>
        </div>
      )}

      {batchFormOpen && (
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6">
          <form
            onSubmit={handleBatchSave}
            className="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                Receive stock batch
              </h2>
              <button
                type="button"
                onClick={() => setBatchFormOpen(false)}
                className="text-gray-500 hover:text-gray-900"
              >
                Close
              </button>
            </div>
            {formError && (
              <p className="mb-4 p-3 rounded bg-red-50 text-red-700">
                {formError}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-gray-700">
                Medicine
                <select
                  value={batchForm.medicineId}
                  onChange={(event) =>
                    setBatchForm({
                      ...batchForm,
                      medicineId: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  <option value="" disabled>
                    Select medicine
                  </option>
                  {medicines.map((medicine) => (
                    <option key={medicine.id} value={medicine.id}>
                      {medicine.genericName} ({medicine.brandName})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Supplier
                <select
                  value={batchForm.supplierId}
                  onChange={(event) =>
                    setBatchForm({
                      ...batchForm,
                      supplierId: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  <option value="" disabled>
                    Select supplier
                  </option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Batch number
                <input
                  value={batchForm.batchNumber}
                  onChange={(event) =>
                    setBatchForm({
                      ...batchForm,
                      batchNumber: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Quantity received
                <input
                  type="number"
                  min="0"
                  value={batchForm.quantity}
                  onChange={(event) =>
                    setBatchForm({ ...batchForm, quantity: event.target.value })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Manufacturing date
                <input
                  type="date"
                  value={batchForm.mfgDate}
                  onChange={(event) =>
                    setBatchForm({ ...batchForm, mfgDate: event.target.value })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Expiry date
                <input
                  type="date"
                  value={batchForm.expiryDate}
                  onChange={(event) =>
                    setBatchForm({
                      ...batchForm,
                      expiryDate: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Purchase price per unit
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={batchForm.purchasePrice}
                  onChange={(event) =>
                    setBatchForm({
                      ...batchForm,
                      purchasePrice: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setBatchFormOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Receiving..." : "Receive stock"}
              </button>
            </div>
          </form>
        </div>
      )}

      {supplierFormOpen && (
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6">
          <form
            onSubmit={handleSupplierSave}
            className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {editingSupplier ? "Edit supplier" : "Add supplier"}
              </h2>
              <button
                type="button"
                onClick={() => setSupplierFormOpen(false)}
                className="text-gray-500 hover:text-gray-900"
              >
                Close
              </button>
            </div>
            {formError && (
              <p className="mb-4 p-3 rounded bg-red-50 text-red-700">
                {formError}
              </p>
            )}
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Supplier name
              <input
                value={supplierForm.name}
                onChange={(event) =>
                  setSupplierForm({ ...supplierForm, name: event.target.value })
                }
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Contact details
              <textarea
                value={supplierForm.contactInfo}
                onChange={(event) =>
                  setSupplierForm({
                    ...supplierForm,
                    contactInfo: event.target.value,
                  })
                }
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                rows={3}
              />
            </label>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setSupplierFormOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save supplier"}
              </button>
            </div>
          </form>
        </div>
      )}

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
            {formError && (
              <p className="mb-4 p-3 rounded bg-red-50 text-red-700">
                {formError}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-gray-700">
                Generic name
                <input
                  value={form.genericName}
                  onChange={(event) =>
                    setForm({ ...form, genericName: event.target.value })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Brand name
                <input
                  value={form.brandName}
                  onChange={(event) =>
                    setForm({ ...form, brandName: event.target.value })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Category
                <select
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm({ ...form, categoryId: event.target.value })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  <option value="" disabled>
                    Select a category
                  </option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Unit
                <input
                  value={form.unit}
                  onChange={(event) =>
                    setForm({ ...form, unit: event.target.value })
                  }
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
                  onChange={(event) =>
                    setForm({ ...form, reorderLevel: event.target.value })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || categories.length === 0}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
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
          <p className="text-3xl font-bold text-red-600">
            {alerts.filter(
              (alert) =>
                alert.type === "LOW_STOCK" || alert.type === "OUT_OF_STOCK",
            ).length || lowStockCount}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 font-medium mb-2">Expiring Soon</h3>
          <p className="text-3xl font-bold text-orange-500">
            {expiringSoonCount}
          </p>
          <p className="text-gray-500 text-sm mt-1">Expiry alerts</p>
        </div>
      </div>

      <section className="mb-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Inventory alerts</h2>
        </div>
        {alerts.length === 0 ? (
          <p className="p-6 text-gray-500">
            No stock or expiry alerts right now.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <p
                    className={
                      alert.severity === "critical"
                        ? "font-medium text-red-700"
                        : "font-medium text-orange-700"
                    }
                  >
                    {alert.message}
                  </p>
                  <p className="text-sm text-gray-500">
                    Quantity affected: {alert.quantity} | Status:{" "}
                    {alert.status.toLowerCase()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase text-gray-500">
                    {alert.type.replaceAll("_", " ")}
                  </span>
                  {alert.status === "OPEN" && (
                    <button
                      onClick={() => void acknowledgeAlert(alert.id)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {report && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Inventory analytics
              </h2>
              <p className="text-sm text-gray-500">
                Operational metrics from recorded inventory activity.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-sm text-gray-500">Suppliers</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {report.supplierCount}
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-sm text-gray-500">Batches</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {report.batchCount}
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-sm text-gray-500">Units available</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {report.totalUnits}
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-sm text-gray-500">Units issued</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {report.issuedUnits}
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-sm text-gray-500">Inventory cost</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {report.inventoryCost.toFixed(2)}
              </p>
            </div>
          </div>
          <div className="mt-4 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4">
              Most issued medicines
            </h3>
            {report.topIssuedMedicines.length === 0 ? (
              <p className="text-gray-500">
                No stock-out activity has been recorded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {report.topIssuedMedicines.map((medicine) => (
                  <div
                    key={medicine.medicineId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-medium text-gray-700">
                      {medicine.medicineName}
                    </span>
                    <span className="text-gray-500">
                      {medicine.quantityIssued} units issued
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

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
                      {canWriteMedicines && (
                        <button
                          onClick={() => openEditForm(med)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <section className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Suppliers</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Batches</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suppliers.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No suppliers have been added yet.
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {supplier.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {supplier.contactInfo || "-"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {supplier._count?.batches ?? 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canManageSuppliers && (
                        <button
                          onClick={() => openEditSupplierForm(supplier)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Received batches</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Batch</th>
                <th className="px-6 py-4">Medicine</th>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Expiry</th>
                <th className="px-6 py-4 text-right">Quantity</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No batches have been received yet.
                  </td>
                </tr>
              ) : (
                batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {batch.batchNumber}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {batch.medicine.genericName}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {batch.supplier.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(batch.expiryDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-right">
                      {batch.quantity}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {canWriteStock && (
                        <>
                          <button
                            onClick={() => openStockForm(batch, "OUT")}
                            className="text-blue-600 hover:text-blue-800 font-medium mr-3"
                          >
                            Issue
                          </button>
                          <button
                            onClick={() => openStockForm(batch, "ADJ")}
                            className="text-gray-600 hover:text-gray-900 font-medium"
                          >
                            Adjust
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">
            Stock transaction history
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4">Medicine</th>
                <th className="px-6 py-4">Batch</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Quantity</th>
                <th className="px-6 py-4">Recorded by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No stock movements have been recorded yet.
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(transaction.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {transaction.batch.medicine.genericName}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {transaction.batch.batchNumber}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {transaction.type}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {transaction.quantity}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {transaction.user.name}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canViewAudit && (
        <section className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900">Audit log</h2>
            <p className="text-sm text-gray-500 mt-1">
              Recent operational changes recorded by the system.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Entity</th>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      No audit events have been recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 text-gray-600">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {log.action.replaceAll("_", " ")}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {log.entity}
                        {log.entityId === null ? "" : ` #${log.entityId}`}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {log.user.name} ({log.user.role.name})
                      </td>
                      <td className="px-6 py-4 text-gray-600 max-w-sm truncate">
                        {log.details ?? "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
