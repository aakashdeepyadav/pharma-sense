import { type FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";
import "./App.css";

type Medicine = {
  id: number;
  genericName: string;
  brandName: string;
  categoryId: number;
  manufacturer: string | null;
  dosageForm: string | null;
  barcode: string | null;
  active: boolean;
  unit: string;
  reorderLevel: number;
  batches: { quantity: number }[];
};

type Category = { id: number; name: string; description: string | null };

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
  sellingPrice: number;
  medicine: { genericName: string; brandName: string };
  supplier: { name: string };
};

type Purchase = {
  id: number;
  status: "DRAFT" | "RECEIVED";
  createdAt: string;
  receivedAt: string | null;
  supplier: { name: string };
  createdBy: { name: string };
  items: {
    id: number;
    batchNumber: string;
    quantity: number;
    medicine: { genericName: string };
  }[];
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

type ReplenishmentRecommendation = {
  medicineId: number;
  medicineName: string;
  currentUnits: number;
  reorderLevel: number;
  averageDailyDemand: number;
  targetDays: number;
  targetStock: number;
  recommendedUnits: number;
  status: "REPLENISH" | "NO_ACTION";
  explanation: string;
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

type ManagedUser = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  role: { id: number; name: string };
};

type ManagedRole = { id: number; name: string };

type MedicineForm = {
  genericName: string;
  brandName: string;
  categoryId: string;
  manufacturer: string;
  dosageForm: string;
  barcode: string;
  active: boolean;
  unit: string;
  reorderLevel: string;
};

type SupplierForm = {
  name: string;
  contactInfo: string;
};

type CategoryForm = {
  name: string;
  description: string;
};

type UserForm = {
  name: string;
  email: string;
  password: string;
  roleId: string;
  active: boolean;
};

type PasswordChangeForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type ProfileForm = {
  name: string;
  email: string;
};

type BatchForm = {
  medicineId: string;
  supplierId: string;
  batchNumber: string;
  mfgDate: string;
  expiryDate: string;
  quantity: string;
  purchasePrice: string;
  sellingPrice: string;
};

type PurchaseForm = BatchForm & {
  notes: string;
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
  user: { id?: number; name: string; email?: string; role: string };
};

type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: unknown[];
};

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const candidate = payload as {
    error?: string | ApiErrorPayload;
  };

  if (typeof candidate.error === "string") {
    return candidate.error;
  }

  if (candidate.error && typeof candidate.error === "object") {
    const message = (candidate.error as ApiErrorPayload).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return fallback;
}

async function fetchUserAdministration(token: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const [usersResponse, rolesResponse] = await Promise.all([
    apiFetch("/api/v1/users", { headers }),
    apiFetch("/api/v1/users/roles", { headers }),
  ]);
  const usersResult = (await usersResponse.json()) as {
    success?: boolean;
    data?: ManagedUser[];
    error?: string | ApiErrorPayload;
  };
  const rolesResult = (await rolesResponse.json()) as {
    success?: boolean;
    data?: ManagedRole[];
    error?: string | ApiErrorPayload;
  };
  if (
    !usersResponse.ok ||
    !rolesResponse.ok ||
    !usersResult.success ||
    !rolesResult.success
  ) {
    throw new Error(
      extractErrorMessage(
        usersResult.error ?? rolesResult.error,
        "Unable to load user administration.",
      ),
    );
  }
  return { users: usersResult.data ?? [], roles: rolesResult.data ?? [] };
}

function readStoredSession(): Session | null {
  try {
    const storedSession = sessionStorage.getItem("pharmasense-session");
    if (!storedSession) return null;

    const parsed = JSON.parse(storedSession) as Partial<Session>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.user?.name !== "string" ||
      typeof parsed.user?.role !== "string"
    ) {
      sessionStorage.removeItem("pharmasense-session");
      return null;
    }

    return parsed as Session;
  } catch {
    sessionStorage.removeItem("pharmasense-session");
    return null;
  }
}

const roleThemeMap: Record<
  string,
  { tone: string; accent: string; description: string }
> = {
  Admin: {
    tone: "bg-emerald-100 text-emerald-800 border-emerald-200",
    accent: "text-emerald-700",
    description:
      "Full operational control across inventory, purchasing, and reporting.",
  },
  Pharmacist: {
    tone: "bg-cyan-100 text-cyan-800 border-cyan-200",
    accent: "text-cyan-700",
    description:
      "Medication and stock management with read-write dispensing controls.",
  },
  "Inventory Manager": {
    tone: "bg-violet-100 text-violet-800 border-violet-200",
    accent: "text-violet-700",
    description:
      "Vendor, batch, and stock integrity oversight for the supply chain.",
  },
  Staff: {
    tone: "bg-amber-100 text-amber-800 border-amber-200",
    accent: "text-amber-700",
    description:
      "Operational access for daily stock movement and issue monitoring.",
  },
};

function App() {
  const [session, setSession] = useState<Session | null>(readStoredSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [replenishment, setReplenishment] = useState<
    ReplenishmentRecommendation[]
  >([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [managedRoles, setManagedRoles] = useState<ManagedRole[]>([]);
  const [loading, setLoading] = useState(() => session !== null);
  const [error, setError] = useState("");
  const [medicineSearch, setMedicineSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const medicineNameInputRef = useRef<HTMLInputElement>(null);
  const medicineReturnFocusRef = useRef<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>({
    name: "",
    contactInfo: "",
  });
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({
    name: "",
    description: "",
  });
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [userForm, setUserForm] = useState<UserForm>({
    name: "",
    email: "",
    password: "",
    roleId: "",
    active: true,
  });
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [passwordChangeForm, setPasswordChangeForm] =
    useState<PasswordChangeForm>({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    name: "",
    email: "",
  });
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [batchFormOpen, setBatchFormOpen] = useState(false);
  const [batchForm, setBatchForm] = useState<BatchForm>({
    medicineId: "",
    supplierId: "",
    batchNumber: "",
    mfgDate: "",
    expiryDate: "",
    quantity: "0",
    purchasePrice: "0",
    sellingPrice: "0",
  });
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>({
    medicineId: "",
    supplierId: "",
    batchNumber: "",
    mfgDate: "",
    expiryDate: "",
    quantity: "0",
    purchasePrice: "0",
    sellingPrice: "0",
    notes: "",
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
    manufacturer: "",
    dosageForm: "",
    barcode: "",
    active: true,
    unit: "Tablet",
    reorderLevel: "0",
  });

  useEffect(() => {
    if (formOpen) {
      medicineNameInputRef.current?.focus();
      return;
    }

    medicineReturnFocusRef.current?.focus();
  }, [formOpen]);

  const roleMeta = roleThemeMap[session?.user.role ?? "Staff"] ?? {
    tone: "bg-slate-100 text-slate-700 border-slate-200",
    accent: "text-slate-700",
    description: "Operational access across the PharmaSense workspace.",
  };

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
          purchaseResponse,
          transactionResponse,
          alertResponse,
          reportResponse,
          replenishmentResponse,
        ] = await Promise.all([
          apiFetch("/api/v1/medicines", { headers }),
          apiFetch("/api/v1/categories", { headers }),
          apiFetch("/api/v1/suppliers", { headers }),
          apiFetch("/api/v1/batches", { headers }),
          apiFetch("/api/v1/purchases", { headers }),
          apiFetch("/api/v1/inventory/transactions", {
            headers,
          }),
          apiFetch("/api/v1/alerts", { headers }),
          apiFetch("/api/v1/reports/summary", { headers }),
          apiFetch("/api/v1/reports/replenishment", { headers }),
        ]);
        if (
          !medicineResponse.ok ||
          !categoryResponse.ok ||
          !supplierResponse.ok ||
          !batchResponse.ok ||
          !purchaseResponse.ok ||
          !transactionResponse.ok ||
          !alertResponse.ok ||
          !reportResponse.ok ||
          !replenishmentResponse.ok
        ) {
          throw new Error("The inventory service returned an error.");
        }

        const medicineResult = (await medicineResponse.json()) as {
          success?: boolean;
          data?: Medicine[];
          error?: string | ApiErrorPayload;
        };
        const categoryResult = (await categoryResponse.json()) as {
          success?: boolean;
          data?: Category[];
          error?: string | ApiErrorPayload;
        };
        const supplierResult = (await supplierResponse.json()) as {
          success?: boolean;
          data?: Supplier[];
          error?: string | ApiErrorPayload;
        };
        const batchResult = (await batchResponse.json()) as {
          success?: boolean;
          data?: Batch[];
          error?: string | ApiErrorPayload;
        };
        const purchaseResult = (await purchaseResponse.json()) as {
          success?: boolean;
          data?: Purchase[];
          error?: string | ApiErrorPayload;
        };
        const transactionResult = (await transactionResponse.json()) as {
          success?: boolean;
          data?: StockTransaction[];
          error?: string | ApiErrorPayload;
        };
        const alertResult = (await alertResponse.json()) as {
          success?: boolean;
          data?: InventoryAlert[];
          error?: string | ApiErrorPayload;
        };
        const reportResult = (await reportResponse.json()) as {
          success?: boolean;
          data?: ReportSummary;
          error?: string | ApiErrorPayload;
        };
        const replenishmentResult = (await replenishmentResponse.json()) as {
          success?: boolean;
          data?: ReplenishmentRecommendation[];
          error?: string | ApiErrorPayload;
        };

        if (
          !medicineResult.success ||
          !categoryResult.success ||
          !supplierResult.success ||
          !batchResult.success ||
          !purchaseResult.success ||
          !transactionResult.success ||
          !alertResult.success ||
          !reportResult.success ||
          !replenishmentResult.success
        ) {
          throw new Error(
            extractErrorMessage(
              medicineResult.error ??
                categoryResult.error ??
                supplierResult.error ??
                batchResult.error ??
                purchaseResult.error ??
                transactionResult.error ??
                alertResult.error ??
                reportResult.error ??
                replenishmentResult.error,
              "Unable to load inventory.",
            ),
          );
        }

        setMedicines(medicineResult.data ?? []);
        setCategories(categoryResult.data ?? []);
        setSuppliers(supplierResult.data ?? []);
        setBatches(batchResult.data ?? []);
        setPurchases(purchaseResult.data ?? []);
        setTransactions(transactionResult.data ?? []);
        setAlerts(alertResult.data ?? []);
        setReport(reportResult.data ?? null);
        setReplenishment(replenishmentResult.data ?? []);
        if (
          session.user.role === "Admin" ||
          session.user.role === "Inventory Manager"
        ) {
          const auditResponse = await apiFetch(
            "/api/v1/audit-logs?page=1&pageSize=100",
            {
              headers,
            },
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
        if (session.user.role === "Admin") {
          const administration = await fetchUserAdministration(session.token);
          setManagedUsers(administration.users);
          setManagedRoles(administration.roles);
        } else {
          setManagedUsers([]);
          setManagedRoles([]);
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
      const response = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        data?: Session;
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success || !result.data) {
        throw new Error(extractErrorMessage(result, "Unable to sign in."));
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

  const refreshAuditLogs = async (search = auditSearch) => {
    if (
      !session ||
      !["Admin", "Inventory Manager"].includes(session.user.role)
    ) {
      return;
    }

    const query = new URLSearchParams({ page: "1", pageSize: "100" });
    if (search.trim()) query.set("search", search.trim());
    const response = await apiFetch(`/api/v1/audit-logs?${query.toString()}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (response.ok) {
      const result = (await response.json()) as { data: AuditLog[] };
      setAuditLogs(result.data);
    }
  };

  const exportAuditLogs = () => {
    const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ["Time", "Action", "Entity", "User", "Details"],
      ...auditLogs.map((log) => [
        new Date(log.createdAt).toISOString(),
        log.action.replaceAll("_", " "),
        `${log.entity}${log.entityId === null ? "" : ` #${log.entityId}`}`,
        `${log.user.name} (${log.user.role.name})`,
        log.details ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const downloadUrl = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `pharmasense-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  const refreshUserAdministration = async () => {
    if (!session || session.user.role !== "Admin") return;
    const administration = await fetchUserAdministration(session.token);
    setManagedUsers(administration.users);
    setManagedRoles(administration.roles);
  };

  const refreshPurchases = async () => {
    if (!session) return;
    const response = await apiFetch("/api/v1/purchases", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (response.ok) {
      const result = (await response.json()) as { data: Purchase[] };
      setPurchases(result.data);
    }
  };

  const openCreateForm = () => {
    medicineReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setEditingMedicine(null);
    setForm({
      genericName: "",
      brandName: "",
      categoryId: categories[0] ? String(categories[0].id) : "",
      manufacturer: "",
      dosageForm: "",
      barcode: "",
      active: true,
      unit: "Tablet",
      reorderLevel: "0",
    });
    setFormError("");
    setFormOpen(true);
  };

  const openEditForm = (medicine: Medicine) => {
    medicineReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setEditingMedicine(medicine);
    setForm({
      genericName: medicine.genericName,
      brandName: medicine.brandName,
      categoryId: String(medicine.categoryId),
      manufacturer: medicine.manufacturer ?? "",
      dosageForm: medicine.dosageForm ?? "",
      barcode: medicine.barcode ?? "",
      active: medicine.active,
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
        ? `/api/v1/medicines/${editingMedicine.id}`
        : "/api/v1/medicines";
      const response = await apiFetch(endpoint, {
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
        success?: boolean;
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success) {
        throw new Error(
          extractErrorMessage(result, "Unable to save medicine."),
        );
      }

      setFormOpen(false);
      setEditingMedicine(null);
      const refreshed = await apiFetch("/api/v1/medicines", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const refreshedResult = (await refreshed.json()) as ApiResponse;
      setMedicines(refreshedResult.data);
      await refreshAuditLogs();
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

  const openCreateUserForm = () => {
    setEditingUser(null);
    setUserForm({
      name: "",
      email: "",
      password: "",
      roleId: managedRoles[0] ? String(managedRoles[0].id) : "",
      active: true,
    });
    setFormError("");
    setUserFormOpen(true);
  };

  const openEditUserForm = (user: ManagedUser) => {
    setEditingUser(user);
    setUserForm({
      name: user.name,
      email: user.email,
      password: "",
      roleId: String(user.role.id),
      active: user.active,
    });
    setFormError("");
    setUserFormOpen(true);
  };

  const handleUserSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setFormError("");
    try {
      const endpoint = editingUser
        ? `/api/v1/users/${editingUser.id}`
        : "/api/v1/users";
      const response = await apiFetch(endpoint, {
        method: editingUser ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          name: userForm.name,
          email: userForm.email,
          roleId: Number(userForm.roleId),
          ...(editingUser ? { active: userForm.active } : {}),
          ...(editingUser ? {} : { password: userForm.password }),
        }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success) {
        throw new Error(extractErrorMessage(result, "Unable to save user."));
      }

      if (editingUser && userForm.password.trim().length > 0) {
        const passwordResponse = await apiFetch(
          `/api/v1/users/${editingUser.id}/reset-password`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.token}`,
            },
            body: JSON.stringify({ password: userForm.password }),
          },
        );
        const passwordResult = (await passwordResponse.json()) as {
          success?: boolean;
          error?: string | ApiErrorPayload;
        };
        if (!passwordResponse.ok || !passwordResult.success) {
          throw new Error(
            extractErrorMessage(passwordResult, "Unable to reset password."),
          );
        }
      }

      await refreshUserAdministration();
      await refreshAuditLogs();
      setUserFormOpen(false);
      setEditingUser(null);
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save user.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSupplierSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setFormError("");
    try {
      const endpoint = editingSupplier
        ? `/api/v1/suppliers/${editingSupplier.id}`
        : "/api/v1/suppliers";
      const response = await apiFetch(endpoint, {
        method: editingSupplier ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(supplierForm),
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success) {
        throw new Error(
          extractErrorMessage(result, "Unable to save supplier."),
        );
      }

      const refreshed = await apiFetch("/api/v1/suppliers", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const refreshedResult = (await refreshed.json()) as { data: Supplier[] };
      setSuppliers(refreshedResult.data);
      await refreshAuditLogs();
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

  const openEditCategoryForm = (category: Category) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description ?? "",
    });
    setFormError("");
    setCategoryFormOpen(true);
  };

  const handleCategorySave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setFormError("");
    try {
      const endpoint = editingCategory
        ? `/api/v1/categories/${editingCategory.id}`
        : "/api/v1/categories";
      const response = await apiFetch(endpoint, {
        method: editingCategory ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(categoryForm),
      });
      const result = (await response.json()) as {
        success?: boolean;
        data?: Category;
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success || !result.data) {
        throw new Error(
          extractErrorMessage(result, "Unable to save category."),
        );
      }

      const refreshed = await apiFetch("/api/v1/categories", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const refreshedResult = (await refreshed.json()) as {
        data: Category[];
      };
      setCategories(refreshedResult.data);
      setCategoryFormOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: "", description: "" });
      await refreshAuditLogs();
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save category.",
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
      sellingPrice: "0",
    });
    setFormError("");
    setBatchFormOpen(true);
  };

  const openCreatePurchaseForm = () => {
    setPurchaseForm({
      medicineId: medicines[0] ? String(medicines[0].id) : "",
      supplierId: suppliers[0] ? String(suppliers[0].id) : "",
      batchNumber: "",
      mfgDate: "",
      expiryDate: "",
      quantity: "1",
      purchasePrice: "0",
      sellingPrice: "0",
      notes: "",
    });
    setFormError("");
    setPurchaseFormOpen(true);
  };

  const handlePurchaseSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setFormError("");
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      };
      const purchaseResponse = await apiFetch("/api/v1/purchases", {
        method: "POST",
        headers,
        body: JSON.stringify({
          supplierId: Number(purchaseForm.supplierId),
          notes: purchaseForm.notes,
          items: [
            {
              medicineId: Number(purchaseForm.medicineId),
              batchNumber: purchaseForm.batchNumber,
              mfgDate: purchaseForm.mfgDate,
              expiryDate: purchaseForm.expiryDate,
              quantity: Number(purchaseForm.quantity),
              purchasePrice: Number(purchaseForm.purchasePrice),
              sellingPrice: Number(purchaseForm.sellingPrice),
            },
          ],
        }),
      });
      const purchaseResult = (await purchaseResponse.json()) as {
        success?: boolean;
        data?: { id: number };
        error?: string | ApiErrorPayload;
      };
      if (
        !purchaseResponse.ok ||
        !purchaseResult.success ||
        !purchaseResult.data
      ) {
        throw new Error(
          extractErrorMessage(purchaseResult, "Unable to create purchase."),
        );
      }

      const receiveResponse = await apiFetch(
        `/api/v1/purchases/${purchaseResult.data.id}/receive`,
        { method: "POST", headers },
      );
      const receiveResult = (await receiveResponse.json()) as {
        success?: boolean;
        error?: string | ApiErrorPayload;
      };
      if (!receiveResponse.ok || !receiveResult.success) {
        throw new Error(
          extractErrorMessage(receiveResult, "Unable to receive purchase."),
        );
      }

      const authHeaders = { Authorization: `Bearer ${session.token}` };
      const [
        batchResponse,
        medicineResponse,
        transactionResponse,
        alertResponse,
      ] = await Promise.all([
        apiFetch("/api/v1/batches", { headers: authHeaders }),
        apiFetch("/api/v1/medicines", {
          headers: authHeaders,
        }),
        apiFetch("/api/v1/inventory/transactions", {
          headers: authHeaders,
        }),
        apiFetch("/api/v1/alerts", { headers: authHeaders }),
      ]);
      setBatches(((await batchResponse.json()) as { data: Batch[] }).data);
      setMedicines(((await medicineResponse.json()) as ApiResponse).data);
      setTransactions(
        ((await transactionResponse.json()) as { data: StockTransaction[] })
          .data,
      );
      setAlerts(
        ((await alertResponse.json()) as { data: InventoryAlert[] }).data,
      );
      await refreshPurchases();
      setPurchaseFormOpen(false);
      await refreshAuditLogs();
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to receive purchase.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBatchSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setFormError("");
    try {
      const response = await apiFetch("/api/v1/batches", {
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
          sellingPrice: Number(batchForm.sellingPrice),
        }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success) {
        throw new Error(
          extractErrorMessage(result, "Unable to receive batch."),
        );
      }

      const headers = { Authorization: `Bearer ${session.token}` };
      const [batchResponse, medicineResponse] = await Promise.all([
        apiFetch("/api/v1/batches", { headers }),
        apiFetch("/api/v1/medicines", { headers }),
      ]);
      const batchResult = (await batchResponse.json()) as { data: Batch[] };
      const medicineResult = (await medicineResponse.json()) as ApiResponse;
      setBatches(batchResult.data);
      setMedicines(medicineResult.data);
      setBatchFormOpen(false);
      await refreshAuditLogs();
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
      const response = await apiFetch("/api/v1/inventory/transactions", {
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
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success) {
        throw new Error(
          extractErrorMessage(result, "Unable to record stock movement."),
        );
      }

      const headers = { Authorization: `Bearer ${session.token}` };
      const [batchResponse, medicineResponse, transactionResponse] =
        await Promise.all([
          apiFetch("/api/v1/batches", { headers }),
          apiFetch("/api/v1/medicines", { headers }),
          apiFetch("/api/v1/inventory/transactions", {
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
      await refreshAuditLogs();
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

  const receivePurchase = async (purchaseId: number) => {
    if (!session) return;
    const headers = { Authorization: `Bearer ${session.token}` };
    const response = await apiFetch(`/api/v1/purchases/${purchaseId}/receive`, {
      method: "POST",
      headers,
    });
    const result = (await response.json()) as {
      success?: boolean;
      error?: string | ApiErrorPayload;
    };
    if (!response.ok || !result.success) {
      setError(extractErrorMessage(result, "Unable to receive purchase."));
      return;
    }

    const [
      batchResponse,
      medicineResponse,
      transactionResponse,
      alertResponse,
    ] = await Promise.all([
      apiFetch("/api/v1/batches", { headers }),
      apiFetch("/api/v1/medicines", { headers }),
      apiFetch("/api/v1/inventory/transactions", { headers }),
      apiFetch("/api/v1/alerts", { headers }),
    ]);
    setBatches(((await batchResponse.json()) as { data: Batch[] }).data);
    setMedicines(((await medicineResponse.json()) as ApiResponse).data);
    setTransactions(
      ((await transactionResponse.json()) as { data: StockTransaction[] }).data,
    );
    setAlerts(
      ((await alertResponse.json()) as { data: InventoryAlert[] }).data,
    );
    await refreshPurchases();
    await refreshAuditLogs();
  };

  const acknowledgeAlert = async (alertId: number) => {
    if (!session) return;
    const response = await apiFetch(`/api/v1/alerts/${alertId}/acknowledge`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!response.ok) {
      setError("Unable to acknowledge alert.");
      return;
    }
    const refreshed = await apiFetch("/api/v1/alerts", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const result = (await refreshed.json()) as { data: InventoryAlert[] };
    setAlerts(result.data);
    await refreshAuditLogs();
  };

  const handleLogout = async () => {
    try {
      if (session) {
        const response = await apiFetch("/api/v1/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!response.ok) {
          setLoginError(
            "Signed out on this device, but server revocation could not be confirmed.",
          );
        }
      }
    } catch {
      setLoginError(
        "Signed out on this device, but server revocation could not be confirmed.",
      );
    } finally {
      sessionStorage.removeItem("pharmasense-session");
      setSession(null);
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    if (passwordChangeForm.newPassword !== passwordChangeForm.confirmPassword) {
      setFormError("New passwords do not match.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const response = await apiFetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordChangeForm.currentPassword,
          newPassword: passwordChangeForm.newPassword,
        }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success) {
        throw new Error(
          extractErrorMessage(result, "Unable to change password."),
        );
      }

      sessionStorage.removeItem("pharmasense-session");
      setPasswordChangeOpen(false);
      setPasswordChangeForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setSession(null);
      setLoginError("Password changed. Sign in again with your new password.");
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to change password.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    setSaving(true);
    setFormError("");
    try {
      const response = await apiFetch("/api/v1/auth/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(profileForm),
      });
      const result = (await response.json()) as {
        success?: boolean;
        data?: { name: string; email: string; role: string };
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success || !result.data) {
        throw new Error(
          extractErrorMessage(result, "Unable to update profile."),
        );
      }

      const updatedSession = {
        ...session,
        user: {
          ...session.user,
          name: result.data.name,
          email: result.data.email,
          role: result.data.role,
        },
      };
      sessionStorage.setItem(
        "pharmasense-session",
        JSON.stringify(updatedSession),
      );
      setSession(updatedSession);
      setProfileEditOpen(false);
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <main className="auth-shell min-h-screen">
        <div className="auth-card">
          <section className="auth-hero">
            <div className="auth-brand">PHARMASENSE</div>
            <h1 className="auth-title mt-6">PharmaSense</h1>
            <p className="auth-description mt-3 max-w-md">
              Medicine inventory, purchasing, and operational history.
            </p>

            <div className="auth-feature-list mt-8">
              {[
                "Live stock visibility",
                "Traceable movements",
                "Role-based access",
                "Reorder guidance",
              ].map((feature) => (
                <div key={feature}>{feature}</div>
              ))}
            </div>
          </section>

          <section className="auth-form-shell">
            <div className="mb-6">
              <p className="auth-eyebrow">Sign in</p>
              <h2 className="auth-heading mt-2">Welcome back</h2>
              <p className="auth-form-description mt-1">
                Use your assigned account to continue.
              </p>
            </div>

            <form onSubmit={handleLogin}>
              {loginError && (
                <p
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {loginError}
                </p>
              )}

              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="email"
              >
                Email address
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                />
              </label>

              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="password"
              >
                Password
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full rounded-xl bg-cyan-700 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loggingIn ? "Signing in..." : "Sign in to dashboard"}
              </button>
            </form>
          </section>
        </div>
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
  const canManageUsers = session.user.role === "Admin";
  const filteredMedicines = medicines.filter((medicine) => {
    const search = medicineSearch.trim().toLowerCase();
    return (
      search.length === 0 ||
      medicine.genericName.toLowerCase().includes(search) ||
      medicine.brandName.toLowerCase().includes(search) ||
      medicine.barcode?.toLowerCase().includes(search)
    );
  });
  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.name.toLowerCase().includes(supplierSearch.trim().toLowerCase()),
  );

  return (
    <div className="dashboard-shell min-h-screen bg-slate-100 p-3 sm:p-5 lg:p-8">
      <header className="dashboard-header mb-6 border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-700">
              PharmaSense
            </div>
            <h1 className="text-2xl font-black text-slate-900 md:text-3xl">
              Inventory command center
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Agent-based medicine stock and replenishment operations
            </p>
            <p
              className={`mt-3 max-w-2xl text-sm font-medium ${roleMeta.accent}`}
            >
              {roleMeta.description}
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-700 font-bold text-white">
                {session.user.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-900">
                  {session.user.name}
                </p>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${roleMeta.tone}`}
                >
                  {session.user.role}
                </span>
              </div>
            </div>

            <button
              onClick={() => setAccountSettingsOpen((isOpen) => !isOpen)}
              aria-expanded={accountSettingsOpen}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Account settings
            </button>
            <button
              onClick={() => {
                setFormError("");
                setPasswordChangeForm({
                  currentPassword: "",
                  newPassword: "",
                  confirmPassword: "",
                });
                setPasswordChangeOpen(true);
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Change password
            </button>
            <button
              onClick={() => void handleLogout()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>

        {accountSettingsOpen && (
          <section
            aria-label="Account settings"
            className="mt-5 border-t border-slate-200 pt-5"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Account settings
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Review the identity and permissions attached to this session.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setFormError("");
                    setProfileForm({
                      name: session.user.name,
                      email: session.user.email ?? "",
                    });
                    setProfileEditOpen(true);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Edit profile
                </button>
                <button
                  onClick={() => {
                    setFormError("");
                    setPasswordChangeForm({
                      currentPassword: "",
                      newPassword: "",
                      confirmPassword: "",
                    });
                    setPasswordChangeOpen(true);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Change password
                </button>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Name
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {session.user.name}
                </dd>
              </div>
              <div className="border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Email
                </dt>
                <dd className="mt-1 break-words font-semibold text-slate-900">
                  {session.user.email ?? "Not provided by the API"}
                </dd>
              </div>
              <div className="border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Role and access
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {session.user.role}
                </dd>
              </div>
            </dl>
          </section>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {canReceiveStock && (
            <button
              onClick={openCreatePurchaseForm}
              disabled={medicines.length === 0 || suppliers.length === 0}
              className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Receive purchase
            </button>
          )}
          {canReceiveStock && (
            <button
              onClick={openCreateBatchForm}
              disabled={medicines.length === 0 || suppliers.length === 0}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Receive stock
            </button>
          )}
          {canManageSuppliers && (
            <button
              onClick={openCreateSupplierForm}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              + Supplier
            </button>
          )}
          {canWriteMedicines && (
            <button
              onClick={() => {
                setEditingCategory(null);
                setCategoryForm({ name: "", description: "" });
                setFormError("");
                setCategoryFormOpen(true);
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              + Category
            </button>
          )}
          {canWriteMedicines && (
            <button
              onClick={openCreateForm}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              + Add Medicine
            </button>
          )}
          {canManageUsers && (
            <button
              onClick={openCreateUserForm}
              disabled={managedRoles.length === 0}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + User
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

      {purchaseFormOpen && (
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6">
          <form
            onSubmit={handlePurchaseSave}
            className="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                Receive purchase
              </h2>
              <button
                type="button"
                onClick={() => setPurchaseFormOpen(false)}
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
                  value={purchaseForm.medicineId}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      medicineId: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
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
                  value={purchaseForm.supplierId}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      supplierId: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
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
                  value={purchaseForm.batchNumber}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
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
                  min="1"
                  value={purchaseForm.quantity}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      quantity: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Manufacturing date
                <input
                  type="date"
                  value={purchaseForm.mfgDate}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      mfgDate: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Expiry date
                <input
                  type="date"
                  value={purchaseForm.expiryDate}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
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
                  value={purchaseForm.purchasePrice}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      purchasePrice: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Selling price per unit
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseForm.sellingPrice}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      sellingPrice: event.target.value,
                    })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-gray-700 mt-4">
              Purchase notes
              <textarea
                value={purchaseForm.notes}
                onChange={(event) =>
                  setPurchaseForm({
                    ...purchaseForm,
                    notes: event.target.value,
                  })
                }
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                rows={2}
              />
            </label>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setPurchaseFormOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Receiving..." : "Create and receive"}
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
              <label className="text-sm font-medium text-gray-700">
                Selling price per unit
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={batchForm.sellingPrice}
                  onChange={(event) =>
                    setBatchForm({
                      ...batchForm,
                      sellingPrice: event.target.value,
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

      {userFormOpen && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/40 p-4"
          role="presentation"
        >
          <form
            onSubmit={handleUserSave}
            aria-labelledby="user-form-title"
            aria-modal="true"
            role="dialog"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2
                id="user-form-title"
                className="text-xl font-bold text-slate-900"
              >
                {editingUser ? "Edit user" : "Add user"}
              </h2>
              <button
                type="button"
                onClick={() => setUserFormOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            {formError && (
              <p
                role="alert"
                className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {formError}
              </p>
            )}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Name
                <input
                  value={userForm.name}
                  onChange={(event) =>
                    setUserForm({ ...userForm, name: event.target.value })
                  }
                  autoComplete="name"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(event) =>
                    setUserForm({ ...userForm, email: event.target.value })
                  }
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Role
                <select
                  value={userForm.roleId}
                  onChange={(event) =>
                    setUserForm({ ...userForm, roleId: event.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  required
                >
                  <option value="" disabled>
                    Select a role
                  </option>
                  {managedRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              {editingUser && (
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={userForm.active}
                    disabled={
                      editingUser.id === session.user.id ||
                      (editingUser.role.name === "Admin" &&
                        editingUser.active &&
                        managedUsers.filter(
                          (user) => user.role.name === "Admin" && user.active,
                        ).length <= 1)
                    }
                    onChange={(event) =>
                      setUserForm({ ...userForm, active: event.target.checked })
                    }
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    Account active
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Deactivation blocks sign-in and invalidates existing
                      sessions.
                    </span>
                  </span>
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700">
                {editingUser
                  ? "Reset password (optional)"
                  : "Temporary password"}
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) =>
                    setUserForm({ ...userForm, password: event.target.value })
                  }
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={100}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  required={!editingUser}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  {editingUser
                    ? "Leave blank to keep the current password."
                    : "Use at least 12 characters."}
                </span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserFormOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || managedRoles.length === 0}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingUser
                    ? "Save changes"
                    : "Create user"}
              </button>
            </div>
          </form>
        </div>
      )}

      {passwordChangeOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={handlePasswordChange}
            aria-labelledby="password-change-title"
            aria-modal="true"
            role="dialog"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2
                id="password-change-title"
                className="text-xl font-bold text-slate-900"
              >
                Change password
              </h2>
              <button
                type="button"
                onClick={() => setPasswordChangeOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            {formError && (
              <p
                role="alert"
                className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {formError}
              </p>
            )}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Current password
                <input
                  type="password"
                  value={passwordChangeForm.currentPassword}
                  onChange={(event) =>
                    setPasswordChangeForm({
                      ...passwordChangeForm,
                      currentPassword: event.target.value,
                    })
                  }
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                New password
                <input
                  type="password"
                  value={passwordChangeForm.newPassword}
                  onChange={(event) =>
                    setPasswordChangeForm({
                      ...passwordChangeForm,
                      newPassword: event.target.value,
                    })
                  }
                  autoComplete="new-password"
                  minLength={12}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Confirm new password
                <input
                  type="password"
                  value={passwordChangeForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordChangeForm({
                      ...passwordChangeForm,
                      confirmPassword: event.target.value,
                    })
                  }
                  autoComplete="new-password"
                  minLength={12}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  required
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPasswordChangeOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Changing..." : "Change password"}
              </button>
            </div>
          </form>
        </div>
      )}

      {profileEditOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={handleProfileSave}
            aria-labelledby="profile-edit-title"
            aria-modal="true"
            role="dialog"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2
                id="profile-edit-title"
                className="text-xl font-bold text-slate-900"
              >
                Edit profile
              </h2>
              <button
                type="button"
                onClick={() => setProfileEditOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            {formError && (
              <p
                role="alert"
                className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {formError}
              </p>
            )}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Name
                <input
                  value={profileForm.name}
                  onChange={(event) =>
                    setProfileForm({ ...profileForm, name: event.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(event) =>
                    setProfileForm({
                      ...profileForm,
                      email: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  required
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setProfileEditOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save profile"}
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

      {categoryFormOpen && (
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6">
          <form
            onSubmit={handleCategorySave}
            className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {editingCategory ? "Edit category" : "Add category"}
              </h2>
              <button
                type="button"
                onClick={() => setCategoryFormOpen(false)}
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
              Category name
              <input
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm({ ...categoryForm, name: event.target.value })
                }
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Description
              <textarea
                value={categoryForm.description}
                onChange={(event) =>
                  setCategoryForm({
                    ...categoryForm,
                    description: event.target.value,
                  })
                }
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                rows={3}
              />
            </label>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setCategoryFormOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save category"}
              </button>
            </div>
          </form>
        </div>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6"
          role="presentation"
        >
          <form
            onSubmit={handleMedicineSave}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setFormOpen(false);
                return;
              }
              if (event.key !== "Tab") return;

              const focusableElements =
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                );
              const firstElement = focusableElements[0];
              const lastElement =
                focusableElements[focusableElements.length - 1];
              if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement?.focus();
              } else if (
                !event.shiftKey &&
                document.activeElement === lastElement
              ) {
                event.preventDefault();
                firstElement?.focus();
              }
            }}
            aria-labelledby="medicine-form-title"
            aria-modal="true"
            role="dialog"
            className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2
                id="medicine-form-title"
                className="text-xl font-bold text-gray-900"
              >
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
                  ref={medicineNameInputRef}
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
                Manufacturer
                <input
                  value={form.manufacturer}
                  onChange={(event) =>
                    setForm({ ...form, manufacturer: event.target.value })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Dosage / form
                <input
                  value={form.dosageForm}
                  onChange={(event) =>
                    setForm({ ...form, dosageForm: event.target.value })
                  }
                  placeholder="e.g. 500 mg tablet"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Barcode
                <input
                  value={form.barcode}
                  onChange={(event) =>
                    setForm({ ...form, barcode: event.target.value })
                  }
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
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
              <label className="flex items-center gap-3 text-sm font-medium text-gray-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm({ ...form, active: event.target.checked })
                  }
                  className="h-4 w-4"
                />
                Active medicine
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

      <section className="mb-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">
            Replenishment recommendations
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Read-only estimates based on recent stock OUT activity and reorder
            levels.
          </p>
        </div>
        {replenishment.filter((item) => item.status === "REPLENISH").length ===
        0 ? (
          <p className="p-6 text-gray-500">
            No replenishment review is suggested right now.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {replenishment
              .filter((item) => item.status === "REPLENISH")
              .map((item) => (
                <div
                  key={item.medicineId}
                  className="p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {item.medicineName}
                    </p>
                    <p className="text-sm text-gray-500">
                      {item.currentUnits} available,{" "}
                      {item.averageDailyDemand.toFixed(2)} units/day average
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.explanation}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-blue-700">
                      {item.recommendedUnits}
                    </p>
                    <p className="text-xs text-gray-500">units to review</p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {report && (
        <details className="workspace-disclosure mb-8">
          <summary>Reports and analytics</summary>
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
        </details>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            Inventory Overview
          </h2>
          <label className="text-sm text-gray-600">
            <span className="sr-only">Search medicines</span>
            <input
              type="search"
              value={medicineSearch}
              onChange={(event) => setMedicineSearch(event.target.value)}
              placeholder="Search by name or barcode"
              className="w-full md:w-80 border border-gray-300 rounded-lg px-3 py-2"
            />
          </label>
        </div>
        {error && <p className="p-6 text-red-700 bg-red-50">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Generic Name</th>
                <th className="px-6 py-4">Brand Name</th>
                <th className="px-6 py-4">Manufacturer</th>
                <th className="px-6 py-4">Unit</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Reorder Level</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Loading inventory data...
                  </td>
                </tr>
              ) : filteredMedicines.length === 0 && !error ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    {medicines.length === 0
                      ? "No medicines have been added yet."
                      : "No medicines match this search."}
                  </td>
                </tr>
              ) : (
                filteredMedicines.map((med) => (
                  <tr key={med.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {med.genericName}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{med.brandName}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {med.manufacturer || "-"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{med.unit}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {med.active ? "Active" : "Inactive"}
                    </td>
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

      <details className="workspace-disclosure mb-8">
        <summary>Management and history</summary>
        <div className="workspace-disclosure-content">
          <section className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">Categories</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {categories.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-6 py-8 text-center text-gray-500"
                      >
                        No categories have been added yet.
                      </td>
                    </tr>
                  ) : (
                    categories.map((category) => (
                      <tr key={category.id}>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {category.name}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {category.description || "-"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {canWriteMedicines && (
                            <button
                              onClick={() => openEditCategoryForm(category)}
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

          {canManageUsers && (
            <section className="mt-8 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    User access
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Manage account details and assigned roles.
                  </p>
                </div>
                <button
                  onClick={openCreateUserForm}
                  disabled={managedRoles.length === 0}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add user
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-gray-100 bg-gray-50 font-medium text-gray-600">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Account status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {managedUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-gray-500"
                        >
                          No user accounts found.
                        </td>
                      </tr>
                    ) : (
                      managedUsers.map((user) => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 font-medium text-gray-900">
                            {user.name}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {user.email}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {user.role.name}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {user.active ? "Active" : "Deactivated"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openEditUserForm(user)}
                              className="font-medium text-blue-700 hover:text-blue-900"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h2 className="text-xl font-bold text-gray-900">Suppliers</h2>
              <label>
                <span className="sr-only">Search suppliers</span>
                <input
                  type="search"
                  value={supplierSearch}
                  onChange={(event) => setSupplierSearch(event.target.value)}
                  placeholder="Search suppliers"
                  className="w-full md:w-72 border border-gray-300 rounded-lg px-3 py-2"
                />
              </label>
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
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-8 text-center text-gray-500"
                      >
                        {suppliers.length === 0
                          ? "No suppliers have been added yet."
                          : "No suppliers match this search."}
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((supplier) => (
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
              <h2 className="text-xl font-bold text-gray-900">
                Purchase history
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Purchase</th>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Items</th>
                    <th className="px-6 py-4">Created</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {purchases.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-8 text-center text-gray-500"
                      >
                        No purchases have been recorded yet.
                      </td>
                    </tr>
                  ) : (
                    purchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          #{purchase.id}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {purchase.supplier.name}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {purchase.items
                            .map(
                              (item) =>
                                `${item.medicine.genericName} (${item.quantity})`,
                            )
                            .join(", ")}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {new Date(purchase.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {purchase.status}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {purchase.status === "DRAFT" && canReceiveStock && (
                            <button
                              onClick={() => void receivePurchase(purchase.id)}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Receive
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
              <h2 className="text-xl font-bold text-gray-900">
                Received batches
              </h2>
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
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Audit log
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Recent operational changes recorded by the system.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <label>
                      <span className="sr-only">Search audit log</span>
                      <input
                        type="search"
                        value={auditSearch}
                        onChange={(event) => setAuditSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void refreshAuditLogs();
                        }}
                        placeholder="Search audit events"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm md:w-64"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void refreshAuditLogs()}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Search
                    </button>
                    <button
                      type="button"
                      onClick={exportAuditLogs}
                      disabled={auditLogs.length === 0}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Export CSV
                    </button>
                    {auditSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuditSearch("");
                          void refreshAuditLogs("");
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
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
      </details>
    </div>
  );
}

export default App;
