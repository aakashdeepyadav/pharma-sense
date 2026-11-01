import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import QRCode from "qrcode";
import { apiFetch, fetchAllPages, readAllPages } from "./api";
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
  batches: { quantity: number; expiryDate: string }[];
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

type AdminStatistics = {
  generatedAt: string;
  users: number;
  activeUsers: number;
  medicines: number;
  activeMedicines: number;
  suppliers: number;
  batches: number;
  transactions: number;
  alerts: number;
  openAlerts: number;
  purchases: number;
  replenishmentReviews: number;
  last30Days: {
    transactionCount: number;
    unitsReceived: number;
    unitsIssued: number;
    adjustedUnits: number;
  };
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
  review?: {
    decision: Exclude<ReplenishmentDecision, "PENDING">;
    notes: string | null;
    reviewedAt: string;
    reviewer: { id: number; name: string };
  } | null;
};

type ReplenishmentDecision = "PENDING" | "APPROVED" | "DISMISSED";

type ForecastRisk = {
  medicineId: number;
  medicineName: string;
  currentStock: number;
  reorderLevel: number;
  predictedDailyDemand: number;
  coverDays: number | null;
  projectedStockAfter7Days: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_DATA";
  monitoringStatus?: "OK" | "WATCH" | "INSUFFICIENT_DATA";
  message: string;
};

type ForecastBaseline = {
  medicineId: number;
  medicineName: string;
  model: string;
  window: number;
  horizon: number;
  forecast: {
    date: string;
    predictedQuantity: number;
  }[];
  evaluation: {
    mae: number | null;
    observations: number;
    readiness: {
      totalDays: number;
      daysWithDemand: number;
      zeroDemandDays: number;
      observationRate: number;
      status: "READY_FOR_BASELINE" | "INSUFFICIENT_HISTORY";
    };
  };
};

type ForecastMlData = {
  available: boolean;
  metrics?: {
    model: string;
    dataset: string;
    data_source: string;
    metrics: {
      mae: number;
      rmse: number;
      baseline_naive_mae: number;
      train_rows: number;
      test_rows: number;
      top_feature_importance: { feature: string; importance: number }[];
    };
    feature_names: string[];
    notes: string[];
  } | null;
  replenishmentExample?: {
    status: string;
    recommended_units: number;
    projected_need: number;
    target_cover: number;
    current_stock: number;
  } | null;
};

type LightGbmPrediction = {
  model: string;
  trainingDataSource: "synthetic" | "operational";
  trainedAt: string;
  inferenceDataSource: string;
  forecasts: {
    medicineId: number;
    medicineName: string;
    forecastDate: string;
    predictedQuantity: number | null;
    status: "READY" | "INSUFFICIENT_HISTORY";
    historyDays: number;
    demandDays: number;
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

type ManagedUser = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  mfaEnabled: boolean;
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

type PurchaseLineForm = Omit<BatchForm, "supplierId">;

type PurchaseForm = {
  supplierId: string;
  items: PurchaseLineForm[];
  notes: string;
};

function emptyPurchaseLine(medicineId = ""): PurchaseLineForm {
  return {
    medicineId,
    batchNumber: "",
    mfgDate: "",
    expiryDate: "",
    quantity: "1",
    purchasePrice: "0",
    sellingPrice: "0",
  };
}

type StockForm = {
  batchId: string;
  type: "OUT" | "ADJ";
  quantity: string;
  notes: string;
};

type Session = {
  token: string;
  user: { id?: number; name: string; email?: string; role: string };
};

type MfaFlow =
  | { stage: "verify"; challengeToken: string }
  | { stage: "setup"; challengeToken: string; secret: string; otpauthUrl: string }
  | { stage: "recovery"; session: Session; recoveryCodes: string[] };

function MfaQrCode({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let active = true;
    QRCode.toCanvas(canvas, value, {
      width: 208,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#123f3b", light: "#ffffff" },
    }).catch(() => {
      if (active) setError("The QR code could not be generated. Use the manual setup key below.");
    });

    return () => {
      active = false;
    };
  }, [value]);

  if (error) {
    return <p role="alert" className="mfa-qr-error">{error}</p>;
  }

  return (
    <div className="mfa-qr-frame">
      <canvas ref={canvasRef} aria-label="Authenticator QR code" />
    </div>
  );
}

function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const detectedRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reader = new BrowserMultiFormatReader();
    let active = true;

    reader
      .decodeFromVideoDevice(undefined, video, (result) => {
        if (active && result && !detectedRef.current) {
          const value = result.getText().trim();
          if (value) {
            detectedRef.current = true;
            onDetectedRef.current(value);
          }
        }
      })
      .then((controls) => {
        if (active) {
          controlsRef.current = controls;
        } else {
          controls.stop();
        }
      })
      .catch(() => {
        if (active) {
          setError("Camera access was unavailable. Allow camera access or enter the code manually.");
        }
      });

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  return (
    <div className="barcode-scanner-panel" role="dialog" aria-modal="true" aria-labelledby="barcode-scanner-title">
      <div className="barcode-scanner-header">
        <div>
          <p className="auth-eyebrow">Medicine identification</p>
          <h3 id="barcode-scanner-title">Scan barcode or QR code</h3>
        </div>
        <button type="button" onClick={onClose} className="barcode-scanner-close">Close</button>
      </div>
      <div className="barcode-scanner-viewport">
        <video ref={videoRef} muted playsInline autoPlay aria-label="Barcode scanner camera" />
        <span className="barcode-scanner-target" aria-hidden="true" />
      </div>
      {error ? (
        <div className="barcode-scanner-error" role="alert">
          <strong>Camera unavailable</strong>
          <span>{error}</span>
          <span>Allow camera access in your browser settings, or close this panel and enter the code manually.</span>
        </div>
      ) : (
        <div className="barcode-scanner-help">
          <strong>How to scan</strong>
          <span>Hold the barcode or QR code inside the frame. Keep it steady and well lit.</span>
          <span>After a successful scan, the value will be added automatically.</span>
        </div>
      )}
    </div>
  );
}

type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: unknown[];
};

function isExpiryDatePast(expiryDate: string, now = new Date()) {
  return expiryDate.slice(0, 10) < now.toISOString().slice(0, 10);
}

function availableMedicineUnits(medicine: Medicine, now = new Date()) {
  return medicine.batches.reduce(
    (total, batch) => total + (isExpiryDatePast(batch.expiryDate, now) ? 0 : batch.quantity),
    0,
  );
}

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
    const storedSession = localStorage.getItem("pharmasense-session");
    if (!storedSession) return null;

    const parsed = JSON.parse(storedSession) as Partial<Session>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.user?.name !== "string" ||
      typeof parsed.user?.role !== "string"
    ) {
      localStorage.removeItem("pharmasense-session");
      return null;
    }

    return parsed as Session;
  } catch {
    localStorage.removeItem("pharmasense-session");
    return null;
  }
}

const roleThemeMap: Record<
  string,
  { tone: string; accent: string; description: string; workspace: string; priorities: string[] }
> = {
  Admin: {
    tone: "bg-emerald-100 text-emerald-800 border-emerald-200",
    accent: "text-emerald-700",
    description:
      "Full operational control across inventory, purchasing, and reporting.",
    workspace: "Administration and operational oversight",
    priorities: ["Approve replenishment reviews", "Manage users and access", "Monitor inventory integrity"],
  },
  Pharmacist: {
    tone: "bg-cyan-100 text-cyan-800 border-cyan-200",
    accent: "text-cyan-700",
    description:
      "Medication and stock management with read-write dispensing controls.",
    workspace: "Medication and dispensing operations",
    priorities: ["Maintain medicine records", "Receive stock and purchases", "Review demand risk before issuing"],
  },
  "Inventory Manager": {
    tone: "bg-violet-100 text-violet-800 border-violet-200",
    accent: "text-violet-700",
    description:
      "Vendor, batch, and stock integrity oversight for the supply chain.",
    workspace: "Supply chain and stock integrity",
    priorities: ["Manage suppliers and batches", "Receive and reconcile stock", "Review audit history"],
  },
  Staff: {
    tone: "bg-amber-100 text-amber-800 border-amber-200",
    accent: "text-amber-700",
    description:
      "Operational access for daily stock movement and issue monitoring.",
    workspace: "Daily stock movement",
    priorities: ["Issue and adjust stock", "Monitor alerts and coverage", "Escalate replenishment needs"],
  },
  Management: {
    tone: "bg-slate-100 text-slate-800 border-slate-200",
    accent: "text-slate-700",
    description:
      "Read-only visibility into inventory health, demand risk, and reviewed recommendations.",
    workspace: "Management reporting and oversight",
    priorities: ["Review inventory health", "Monitor demand risk", "Track approved replenishment reviews"],
  },
};

function App() {
  const [session, setSession] = useState<Session | null>(readStoredSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [mfaFlow, setMfaFlow] = useState<MfaFlow | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodesSaved, setRecoveryCodesSaved] = useState(false);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [adminStatistics, setAdminStatistics] = useState<AdminStatistics | null>(null);
  const [forecastRisk, setForecastRisk] = useState<ForecastRisk[]>([]);
  const [forecastBaseline, setForecastBaseline] =
    useState<ForecastBaseline | null>(null);
  const [selectedForecastMedicineId, setSelectedForecastMedicineId] = useState<
    number | null
  >(null);
  const [forecastMl, setForecastMl] = useState<ForecastMlData | null>(null);
  const [lightGbmPrediction, setLightGbmPrediction] =
    useState<LightGbmPrediction | null>(null);
  const [replenishment, setReplenishment] = useState<
    ReplenishmentRecommendation[]
  >([]);
  const [savingReplenishmentDecision, setSavingReplenishmentDecision] =
    useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [managedRoles, setManagedRoles] = useState<ManagedRole[]>([]);
  const [loading, setLoading] = useState(() => session !== null);
  const [error, setError] = useState("");
  const [medicineSearch, setMedicineSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
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
  const [activeNavTab, setActiveNavTab] = useState<string>("all");
  const navigateToSection = (sectionId: string, insideDisclosure = false) => {
    setActiveNavTab(sectionId);
    if (insideDisclosure || sectionId === "section-analytics") {
      const el = document.getElementById(sectionId);
      if (el) {
        const parentDisclosure = el.closest("details.workspace-disclosure") as HTMLDetailsElement | null;
        if (parentDisclosure && !parentDisclosure.open) {
          parentDisclosure.open = true;
        }
      }
      const allDisclosures = document.querySelectorAll("details.workspace-disclosure");
      allDisclosures.forEach((d) => {
        const htmlD = d as HTMLDetailsElement;
        if (el && htmlD.contains(el)) {
          htmlD.open = true;
        }
      });
    }
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
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
    supplierId: "",
    items: [emptyPurchaseLine()],
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
    workspace: "Operational workspace",
    priorities: ["Monitor inventory", "Review alerts", "Escalate issues"],
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
          forecastRiskResponse,
          replenishmentResponse,
        ] = await Promise.all([
          apiFetch("/api/v1/medicines?pageSize=100", { headers }),
          apiFetch("/api/v1/categories?pageSize=100", { headers }),
          apiFetch("/api/v1/suppliers?pageSize=100", { headers }),
          apiFetch("/api/v1/batches?pageSize=100", { headers }),
          apiFetch("/api/v1/purchases?pageSize=100", { headers }),
          apiFetch("/api/v1/inventory/transactions?pageSize=100", {
            headers,
          }),
          apiFetch("/api/v1/alerts", { headers }),
          apiFetch("/api/v1/reports/summary", { headers }),
          apiFetch("/api/v1/reports/forecast-risk", { headers }),
          apiFetch("/api/v1/reports/replenishment", { headers }),
        ]);
        const adminStatisticsResponse = session.user.role === "Admin"
          ? await apiFetch("/api/v1/reports/admin-statistics", { headers })
          : null;
        if (
          !medicineResponse.ok ||
          !categoryResponse.ok ||
          !supplierResponse.ok ||
          !batchResponse.ok ||
          !purchaseResponse.ok ||
          !transactionResponse.ok ||
          !alertResponse.ok ||
          !reportResponse.ok ||
          !forecastRiskResponse.ok ||
          !replenishmentResponse.ok
          || (adminStatisticsResponse !== null && !adminStatisticsResponse.ok)
        ) {
          throw new Error("The inventory service returned an error.");
        }

        const [allMedicines, allCategories, allSuppliers, allBatches, allPurchases, allTransactions] = await Promise.all([
          readAllPages<Medicine>(medicineResponse, "/api/v1/medicines", { headers }),
          readAllPages<Category>(categoryResponse, "/api/v1/categories", { headers }),
          readAllPages<Supplier>(supplierResponse, "/api/v1/suppliers", { headers }),
          readAllPages<Batch>(batchResponse, "/api/v1/batches", { headers }),
          readAllPages<Purchase>(purchaseResponse, "/api/v1/purchases", { headers }),
          readAllPages<StockTransaction>(transactionResponse, "/api/v1/inventory/transactions", { headers }),
        ]);
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
        const forecastRiskResult = (await forecastRiskResponse.json()) as {
          success?: boolean;
          data?: ForecastRisk[];
          error?: string | ApiErrorPayload;
        };
        const replenishmentResult = (await replenishmentResponse.json()) as {
          success?: boolean;
          data?: ReplenishmentRecommendation[];
          error?: string | ApiErrorPayload;
        };
        const adminStatisticsResult = adminStatisticsResponse
          ? (await adminStatisticsResponse.json()) as {
              success?: boolean;
              data?: AdminStatistics;
              error?: string | ApiErrorPayload;
            }
          : null;

        if (
          !alertResult.success ||
          !reportResult.success ||
          !forecastRiskResult.success ||
          !replenishmentResult.success
          || (adminStatisticsResult !== null && !adminStatisticsResult.success)
        ) {
          throw new Error(
            extractErrorMessage(
                alertResult.error ??
                reportResult.error ??
                forecastRiskResult.error ??
              replenishmentResult.error ??
                adminStatisticsResult?.error,
              "Unable to load inventory.",
            ),
          );
        }

        setMedicines(allMedicines);
        setCategories(allCategories);
        setSuppliers(allSuppliers);
        setBatches(allBatches);
        setPurchases(allPurchases);
        setTransactions(allTransactions);
        setAlerts(alertResult.data ?? []);
        setReport(reportResult.data ?? null);
        setForecastRisk(forecastRiskResult.data ?? []);
        setReplenishment(replenishmentResult.data ?? []);
        setAdminStatistics(adminStatisticsResult?.data ?? null);
        void apiFetch("/api/v1/reports/forecast-ml", { headers })
          .then(async (res) => {
            if (res.ok) {
              const mlResult = (await res.json()) as { success?: boolean; data?: ForecastMlData };
              if (mlResult.success && mlResult.data) {
                setForecastMl(mlResult.data);
              }
            }
          })
          .catch(() => {});
        if (
          session.user.role === "Admin" ||
          session.user.role === "Inventory Manager"
        ) {
          setAuditLogs(await fetchAllPages<AuditLog>("/api/v1/audit-logs", { headers }));
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
          setAdminStatistics(null);
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
        data?: Session & {
          mfaRequired?: boolean;
          mfaSetupRequired?: boolean;
          challengeToken?: string;
        };
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success || !result.data) {
        throw new Error(extractErrorMessage(result, "Unable to sign in."));
      }

      if (result.data.token) {
        startAuthenticatedSession(result.data);
        return;
      }
      if (!result.data.challengeToken) {
        throw new Error("The server returned an incomplete sign-in response.");
      }
      if (result.data.mfaSetupRequired) {
        const setupResponse = await apiFetch("/api/v1/auth/mfa/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enrollmentToken: result.data.challengeToken }),
        });
        const setup = (await setupResponse.json()) as {
          success?: boolean;
          data?: { secret: string; otpauthUrl: string };
          error?: string | ApiErrorPayload;
        };
        if (!setupResponse.ok || !setup.success || !setup.data) {
          throw new Error(extractErrorMessage(setup, "Unable to start MFA setup."));
        }
        setMfaFlow({ stage: "setup", challengeToken: result.data.challengeToken, ...setup.data });
      } else {
        setMfaFlow({ stage: "verify", challengeToken: result.data.challengeToken });
      }
      setMfaCode("");
      setLoginError("");
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

  const startAuthenticatedSession = (nextSession: Session) => {
    localStorage.setItem("pharmasense-session", JSON.stringify(nextSession));
    setLoading(true);
    setMfaFlow(null);
    setSession(nextSession);
  };

  const handleMfaSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mfaFlow || mfaFlow.stage === "recovery") return;
    setLoggingIn(true);
    setLoginError("");
    try {
      const isSetup = mfaFlow.stage === "setup";
      const response = await apiFetch(isSetup ? "/api/v1/auth/mfa/confirm" : "/api/v1/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSetup
          ? { enrollmentToken: mfaFlow.challengeToken, code: mfaCode }
          : { challengeToken: mfaFlow.challengeToken, code: mfaCode }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        data?: Session & { recoveryCodes?: string[] };
        error?: string | ApiErrorPayload;
      };
      if (!response.ok || !result.success || !result.data?.token) {
        throw new Error(extractErrorMessage(result, "Unable to verify the authenticator code."));
      }
      if (isSetup) {
        if (!result.data.recoveryCodes?.length) throw new Error("MFA was enabled, but recovery codes were not returned. Sign in again to continue.");
        setMfaFlow({ stage: "recovery", session: result.data, recoveryCodes: result.data.recoveryCodes });
      } else {
        startAuthenticatedSession(result.data);
      }
      setMfaCode("");
    } catch (requestError) {
      setLoginError(requestError instanceof Error ? requestError.message : "Unable to verify MFA.");
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
    try {
      setAuditLogs(await fetchAllPages<AuditLog>(`/api/v1/audit-logs?${query.toString()}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load audit history.");
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
    try {
      setPurchases(await fetchAllPages<Purchase>("/api/v1/purchases", {
        headers: { Authorization: `Bearer ${session.token}` },
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load purchases.");
    }
  };

  const refreshInventoryCollections = async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    const [nextMedicines, nextBatches, nextTransactions] = await Promise.all([
      fetchAllPages<Medicine>("/api/v1/medicines", { headers }),
      fetchAllPages<Batch>("/api/v1/batches", { headers }),
      fetchAllPages<StockTransaction>("/api/v1/inventory/transactions", { headers }),
    ]);
    setMedicines(nextMedicines);
    setBatches(nextBatches);
    setTransactions(nextTransactions);
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
      await refreshInventoryCollections(session.token);
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

  const handleUserMfaReset = async () => {
    if (!session || !editingUser || editingUser.id === session.user.id) return;
    if (!window.confirm(`Reset MFA for ${editingUser.name}? They will need to enroll an authenticator again, and their current sessions will end.`)) return;
    const currentPassword = window.prompt("Enter your password to confirm the MFA reset.");
    if (!currentPassword) return;
    setSaving(true);
    setFormError("");
    try {
      const response = await apiFetch(`/api/v1/users/${editingUser.id}/reset-mfa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ currentPassword }),
      });
      const result = (await response.json()) as { success?: boolean; error?: string | ApiErrorPayload };
      if (!response.ok || !result.success) throw new Error(extractErrorMessage(result, "Unable to reset user MFA."));
      await refreshUserAdministration();
      await refreshAuditLogs();
      setUserFormOpen(false);
      setEditingUser(null);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Unable to reset user MFA.");
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

  const updatePurchaseItem = (
    index: number,
    field: keyof PurchaseLineForm,
    value: string,
  ) => {
    setPurchaseForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const openCreatePurchaseForm = () => {
    setPurchaseForm({
      supplierId: suppliers[0] ? String(suppliers[0].id) : "",
      items: [emptyPurchaseLine(medicines[0] ? String(medicines[0].id) : "")],
      notes: "",
    });
    setFormError("");
    setPurchaseFormOpen(true);
  };

  const openPurchaseFormForReplenishment = (
    item: ReplenishmentRecommendation,
  ) => {
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const existingBatch = batches.find((b) => b.medicineId === item.medicineId);

    setPurchaseForm({
      supplierId: existingBatch
        ? String(existingBatch.supplierId)
        : suppliers[0]
          ? String(suppliers[0].id)
          : "",
      items: [{
        ...emptyPurchaseLine(String(item.medicineId)),
        batchNumber: `PO-${item.medicineId}-${Date.now().toString().slice(-6)}`,
        mfgDate: today,
        expiryDate: nextYear,
        quantity: String(Math.max(1, item.recommendedUnits)),
        purchasePrice: existingBatch ? String(existingBatch.purchasePrice) : "10.00",
        sellingPrice: existingBatch ? String(existingBatch.sellingPrice) : "15.00",
      }],
      notes: `Replenishment order for ${item.medicineName} (${item.recommendedUnits} units approved by ${item.review?.reviewer?.name ?? "reviewer"})`,
    });
    setFormError("");
    setPurchaseFormOpen(true);
  };

  const handlePurchaseSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const receiveImmediately = submitter?.value === "receive";
    let createdPurchaseId: number | null = null;

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
          items: purchaseForm.items.map((item) => ({
              medicineId: Number(item.medicineId),
              batchNumber: item.batchNumber,
              mfgDate: item.mfgDate,
              expiryDate: item.expiryDate,
              quantity: Number(item.quantity),
              purchasePrice: Number(item.purchasePrice),
              sellingPrice: Number(item.sellingPrice),
          })),
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
      createdPurchaseId = purchaseResult.data.id;

      if (!receiveImmediately) {
        await refreshPurchases();
        setPurchaseFormOpen(false);
        await refreshAuditLogs();
        return;
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
      const alertResponse = await apiFetch("/api/v1/alerts", { headers: authHeaders });
      await refreshInventoryCollections(session.token);
      setAlerts(
        ((await alertResponse.json()) as { data: InventoryAlert[] }).data,
      );
      await refreshPurchases();
      setPurchaseFormOpen(false);
      await refreshAuditLogs();
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : "Unable to receive purchase.";
      if (receiveImmediately && createdPurchaseId !== null) {
        setPurchaseFormOpen(false);
        await refreshPurchases();
        await refreshAuditLogs();
        setError(`${message} Purchase #${createdPurchaseId} remains a draft; receive it from purchase history.`);
      } else {
        setFormError(message);
      }
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

      await refreshInventoryCollections(session.token);
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

      await refreshInventoryCollections(session.token);
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

    const alertResponse = await apiFetch("/api/v1/alerts", { headers });
    await refreshInventoryCollections(session.token);
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
      localStorage.removeItem("pharmasense-session");
      setSession(null);
      setForecastBaseline(null);
      setForecastMl(null);
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

      localStorage.removeItem("pharmasense-session");
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
      localStorage.setItem(
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

  const effectiveForecastMedicineId =
    medicines.length > 0
      ? (medicines.some((medicine) => medicine.id === selectedForecastMedicineId)
          ? selectedForecastMedicineId
          : medicines[0].id)
      : null;
  const selectedLightGbmForecast = lightGbmPrediction?.forecasts?.find(
    (forecast) => forecast.medicineId === effectiveForecastMedicineId,
  );
  const effectiveLightGbmPrediction =
    session && effectiveForecastMedicineId !== null ? lightGbmPrediction : null;

  useEffect(() => {
    if (!session || effectiveForecastMedicineId === null) {
      return;
    }

    let isMounted = true;
    const fetchBaseline = async () => {
      try {
        const response = await apiFetch(
          `/api/v1/reports/forecast-baseline?medicineId=${effectiveForecastMedicineId}&window=7&horizon=7`,
          {
            headers: { Authorization: `Bearer ${session.token}` },
          },
        );
        if (!response.ok) {
          if (isMounted) setForecastBaseline(null);
          return;
        }
        const result = (await response.json()) as {
          success?: boolean;
          data?: ForecastBaseline;
        };
        const baseline = result.data;
        if (
          !result.success ||
          !baseline ||
          typeof baseline !== "object" ||
          !baseline.evaluation ||
          !Array.isArray(baseline.forecast)
        ) {
          if (isMounted) setForecastBaseline(null);
          return;
        }
        if (isMounted) setForecastBaseline(baseline);
      } catch {
        if (isMounted) setForecastBaseline(null);
      }
    };

    void fetchBaseline();
    return () => {
      isMounted = false;
    };
  }, [session, effectiveForecastMedicineId]);

  useEffect(() => {
    if (!session || effectiveForecastMedicineId === null) {
      return;
    }

    let isMounted = true;
    const fetchLightGbmPrediction = async () => {
      try {
        const response = await apiFetch(
          `/api/v1/reports/forecast-ml/predictions?medicineId=${effectiveForecastMedicineId}`,
          { headers: { Authorization: `Bearer ${session.token}` } },
        );
        if (!response.ok) {
          if (isMounted) setLightGbmPrediction(null);
          return;
        }
        const result = (await response.json()) as {
          success?: boolean;
          data?: LightGbmPrediction;
        };
        const prediction = result.data;
        if (isMounted) {
          setLightGbmPrediction(
            result.success && prediction && Array.isArray(prediction.forecasts)
              ? prediction
              : null,
          );
        }
      } catch {
        if (isMounted) setLightGbmPrediction(null);
      }
    };

    void fetchLightGbmPrediction();
    return () => {
      isMounted = false;
    };
  }, [session, effectiveForecastMedicineId]);

  if (!session) {
    return (
      <main className="auth-shell min-h-screen">
        <div className="auth-card">
          <section className="auth-hero">
            <div className="auth-brand-row">
              <div className="auth-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="auth-brand">PHARMASENSE</div>
            </div>
            <h1 className="auth-title mt-6">PharmaSense</h1>
            <p className="auth-description mt-3 max-w-md">
              A clearer way to manage medicine inventory, purchasing, and
              operational history.
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
            <div className="auth-hero-footer">
              <span className="auth-status-dot" aria-hidden="true" />
              Built for accountable pharmacy operations
            </div>
          </section>

          <section className="auth-form-shell">
            <div className="mb-6">
              <p className="auth-eyebrow">Sign in</p>
              <h2 className="auth-heading mt-2">Welcome back</h2>
              <p className="auth-form-description mt-1">
                Continue to your operational workspace.
              </p>
            </div>

            {loginError && (
              <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {loginError}
              </p>
            )}

            {mfaFlow?.stage === "recovery" ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Save your recovery codes</h3>
                <p className="text-sm text-slate-600">Each code works once if you lose access to your authenticator. Store these somewhere private; they will not be shown again.</p>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-4 font-mono text-sm" aria-label="One-time MFA recovery codes">
                  {mfaFlow.recoveryCodes.map((code) => <span key={code}>{code}</span>)}
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={recoveryCodesSaved} onChange={(event) => setRecoveryCodesSaved(event.target.checked)} className="mt-1" />
                  I saved these recovery codes in a secure place.
                </label>
                <button type="button" disabled={!recoveryCodesSaved} onClick={() => startAuthenticatedSession(mfaFlow.session)} className="w-full rounded-xl bg-cyan-700 px-4 py-3 font-semibold text-white disabled:opacity-50">Continue to PharmaSense</button>
              </div>
            ) : mfaFlow ? (
              <form onSubmit={handleMfaSubmit} className="space-y-4">
                {mfaFlow.stage === "setup" ? (
                  <>
                    <h3 className="text-lg font-semibold text-slate-900">Set up an authenticator</h3>
                    <p className="text-sm text-slate-600">Scan this QR code with your authenticator app, then enter its current six-digit code.</p>
                    <MfaQrCode value={mfaFlow.otpauthUrl} />
                    <p className="text-center text-xs font-medium text-slate-500">Can’t scan? Use the manual setup key below.</p>
                    <div className="break-all rounded-xl bg-slate-100 p-3 font-mono text-sm" aria-label="Authenticator setup key">{mfaFlow.secret}</div>
                    <details className="text-xs text-slate-500"><summary className="cursor-pointer">Manual setup URI</summary><p className="mt-2 break-all">{mfaFlow.otpauthUrl}</p></details>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-slate-900">Two-step verification</h3>
                    <p className="text-sm text-slate-600">Enter the current code from your authenticator app or one of your unused recovery codes.</p>
                  </>
                )}
                <label className="block text-sm font-medium text-slate-700" htmlFor="mfa-code">
                  {mfaFlow.stage === "setup" ? "Authenticator code" : "Authenticator or recovery code"}
                  <input id="mfa-code" inputMode={mfaFlow.stage === "setup" ? "numeric" : "text"} autoCapitalize="characters" autoCorrect="off" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-slate-900 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100" required />
                </label>
                <button type="submit" disabled={loggingIn} className="w-full rounded-xl bg-cyan-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{loggingIn ? "Verifying..." : mfaFlow.stage === "setup" ? "Enable MFA" : "Verify and sign in"}</button>
                <button type="button" onClick={() => { setMfaFlow(null); setMfaCode(""); setLoginError(""); }} className="w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-700">Back to sign in</button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <label className="block text-sm font-medium text-slate-700" htmlFor="email">
                  Email address
                  <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100" required />
                </label>
                <label className="block text-sm font-medium text-slate-700" htmlFor="password">
                  Password
                  <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 shadow-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100" required />
                </label>
                <button type="submit" disabled={loggingIn} className="w-full rounded-xl bg-cyan-700 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:cursor-not-allowed disabled:opacity-70">{loggingIn ? "Signing in..." : "Sign in to dashboard"}</button>
              </form>
            )}
          </section>
        </div>
      </main>
    );
  }

  const lowStockCount = medicines.filter((medicine) => {
    return availableMedicineUnits(medicine) <= medicine.reorderLevel;
  }).length;
  const queuedRiskCount = forecastRisk.filter(
    (item) => item.riskLevel === "HIGH" || item.riskLevel === "MEDIUM",
  ).length;
  const replenishmentQueue = replenishment.filter(
    (item) => item.status === "REPLENISH",
  );
  const pendingReviewCount = replenishmentQueue.filter(
    (item) => !item.review,
  ).length;
  const approvedReviewCount = replenishmentQueue.filter(
    (item) => item.review?.decision === "APPROVED",
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
  const canReviewReplenishment = [
    "Admin",
    "Pharmacist",
    "Inventory Manager",
  ].includes(session.user.role);
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

  const handleReplenishmentDecision = async (
    medicineId: number,
    decision: Exclude<ReplenishmentDecision, "PENDING">,
  ) => {
    setSavingReplenishmentDecision(true);
    try {
      const response = await apiFetch(
        "/api/v1/reports/replenishment/decision",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ medicineId, decision }),
        },
      );
      const result = (await response.json()) as {
        success?: boolean;
        data?: {
          medicineId: number;
          review: NonNullable<ReplenishmentRecommendation["review"]>;
        };
        error?: string | ApiErrorPayload;
      };
      const savedReview = result.data?.review;
      if (!response.ok || !result.success || !savedReview) {
        throw new Error(
          extractErrorMessage(
            result.error,
            "Unable to save the replenishment decision.",
          ),
        );
      }
      setReplenishment((current) =>
        current.map((item) =>
          item.medicineId === medicineId
            ? { ...item, review: savedReview }
            : item,
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save the replenishment decision.",
      );
    } finally {
      setSavingReplenishmentDecision(false);
    }
  };

  return (
    <div className="dashboard-shell min-h-screen p-3 sm:p-5 lg:p-8">
      {/* Top Clinical Telemetry Status Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1 py-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-[11px] font-medium tracking-wide text-emerald-300">
              Dispensary Active
            </span>
          </div>
          <span className="text-xs text-slate-400 hidden md:inline">
            Central Pharmacy Dispensary • Real-Time Inventory Control
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center">
            <input
              type="text"
              value={medicineSearch}
              onChange={(e) => {
                setMedicineSearch(e.target.value);
                const el = document.getElementById("section-medicines");
                if (el && e.target.value.length > 0) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              placeholder="Search catalog (Cmd+K)..."
              className="w-48 sm:w-64 pl-3 pr-10 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-900/80 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-400"
            />
            <kbd className="absolute right-2 px-1.5 py-0.5 text-[9px] font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded pointer-events-none">
              ⌘K
            </kbd>
          </div>
          <button
            type="button"
            onClick={() => setBarcodeScannerOpen(true)}
            className="scan-code-button flex items-center gap-1.5 text-xs font-medium"
            title="Scan Barcode (Cmd+B)"
          >
            <span>📷</span>
            <span className="hidden sm:inline">Scan Barcode</span>
            <span className="text-[9px] font-mono px-1 rounded bg-slate-800 border border-slate-700 text-slate-400">⌘B</span>
          </button>
        </div>
      </div>

      <header className="dashboard-header mb-6 border border-slate-700/60 bg-slate-900/90 p-5 shadow-xl md:p-6 backdrop-blur-xl">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-800/80 px-3 py-0.5 text-[11px] font-medium tracking-wide text-slate-300">
              PharmaSense Enterprise
            </div>
            <h1 className="text-2xl font-black text-white md:text-3xl tracking-tight">
              Inventory command center
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Formulary stock control, batch lot tracking, and demand replenishment forecasting
            </p>
            <p
              className={`mt-3 max-w-2xl text-sm font-medium ${roleMeta.accent}`}
            >
              {roleMeta.description}
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-800/80 px-3 py-2 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 font-bold text-white shadow-md shadow-teal-500/20">
                {session.user.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">
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
              className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700/80 hover:text-white"
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
              className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700/80 hover:text-white"
            >
              Change password
            </button>
            <button
              onClick={() => void handleLogout()}
              className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700/80 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>

        {accountSettingsOpen && (
          <section
            aria-label="Account settings"
            className="mt-5 border-t border-slate-700/60 pt-5"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Account settings
                </h2>
                <p className="mt-1 text-sm text-slate-400">
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
                  className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700/80 hover:text-white"
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
                  className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700/80 hover:text-white"
                >
                  Change password
                </button>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-4 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Name
                </dt>
                <dd className="mt-1 font-semibold text-white">
                  {session.user.name}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-4 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Email
                </dt>
                <dd className="mt-1 break-words font-semibold text-white">
                  {session.user.email ?? "Not provided by the API"}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-4 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Role and access
                </dt>
                <dd className="mt-1 font-semibold text-emerald-400">
                  {session.user.role}
                </dd>
              </div>
            </dl>
          </section>
        )}

        <div className="dashboard-actions mt-5 flex flex-wrap items-center gap-3">
          {canWriteMedicines && (
            <button
              onClick={openCreateForm}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition border border-emerald-500/50"
            >
              + Add Medicine
            </button>
          )}
          {canReceiveStock && (
            <button
              onClick={openCreatePurchaseForm}
              disabled={medicines.length === 0 || suppliers.length === 0}
              className="rounded-xl border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 hover:text-white px-4 py-2.5 text-sm font-semibold text-slate-200 transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              Receive purchase
            </button>
          )}
          {canReceiveStock && (
            <button
              onClick={openCreateBatchForm}
              disabled={medicines.length === 0 || suppliers.length === 0}
              className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Receive stock
            </button>
          )}
          {canManageSuppliers && (
            <button
              onClick={openCreateSupplierForm}
              className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700/80 hover:text-white"
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
              className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700/80 hover:text-white"
            >
              + Category
            </button>
          )}
          {canManageUsers && (
            <button
              onClick={openCreateUserForm}
              disabled={managedRoles.length === 0}
              aria-label="Add a new user"
              className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add user
            </button>
          )}
        </div>

        <section className="role-workspace-panel mt-6 border border-slate-700/60 bg-slate-950/60 rounded-xl" aria-label="Role workspace">
          <div>
            <p className="role-workspace-eyebrow">Operational scope</p>
            <h2 className="mt-1 text-lg font-bold text-white">
              {roleMeta.workspace}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Your dashboard is organized around the work available to the{" "}
              {session.user.role.toLowerCase()} role.
            </p>
          </div>
          <ul className="role-priority-list" aria-label={`${session.user.role} priorities`}>
            {roleMeta.priorities.map((priority) => (
              <li key={priority} className="flex gap-2 items-center text-xs text-slate-300 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/60">
                <span aria-hidden="true" className="text-emerald-400 font-bold">✓</span>
                {priority}
              </li>
            ))}
          </ul>
        </section>

        {/* Workspace Navigation Quick Jump Strip */}
        <nav aria-label="Workspace navigation" className="mt-5 flex items-center gap-2 overflow-x-auto pt-4 border-t border-slate-700/50">
          {[
            { id: "all", label: "Overview", icon: "•" },
            { id: "section-forecast", label: "Demand Forecast", icon: "•", badge: queuedRiskCount > 0 ? `${queuedRiskCount}` : undefined },
            { id: "section-alerts", label: "Alerts", icon: "•", badge: alerts.length > 0 ? `${alerts.length}` : undefined },
            { id: "section-replenishment", label: "Replenishment Queue", icon: "•", badge: pendingReviewCount > 0 ? `${pendingReviewCount}` : undefined },
            { id: "section-medicines", label: "Formulary Catalog", icon: "•", badge: `${medicines.length}` },
            { id: "section-analytics", label: "Inventory Analytics", icon: "•", badge: adminStatistics ? "Live" : undefined, inside: true },
            { id: "section-batches", label: "Batches & Expiry", icon: "•", inside: true },
            { id: "section-purchases", label: "Purchase Orders", icon: "•", inside: true },
            { id: "section-transactions", label: "Stock Movements", icon: "•", inside: true },
            ...(canViewAudit ? [{ id: "section-audit", label: "Audit Trail", icon: "•", inside: true }] : []),
            ...(canManageUsers ? [{ id: "section-users", label: "User Management", icon: "•", inside: true }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigateToSection(tab.id, tab.inside)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                activeNavTab === tab.id
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/60 hover:text-white"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {stockFormOpen && (
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setStockFormOpen(false);
          }}
        >
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
            <p className="text-sm text-slate-300 mb-4">
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
                className="px-4 py-2 text-slate-300 text-sm font-medium hover:text-white rounded-lg transition"
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
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPurchaseFormOpen(false);
          }}
        >
          <form
            onSubmit={handlePurchaseSave}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-xl bg-white p-6 shadow-xl"
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
            <label className="block text-sm font-medium text-gray-700">
              Supplier
              <select
                value={purchaseForm.supplierId}
                onChange={(event) =>
                  setPurchaseForm({ ...purchaseForm, supplierId: event.target.value })
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

            <div className="mt-5 space-y-4">
              {purchaseForm.items.map((item, index) => (
                <fieldset key={index} className="rounded-xl border border-gray-200 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <legend className="font-semibold text-gray-900">Line item {index + 1}</legend>
                    {purchaseForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPurchaseForm((current) => ({
                          ...current,
                          items: current.items.filter((_, itemIndex) => itemIndex !== index),
                        }))}
                        className="text-sm font-medium text-red-700 hover:text-red-900"
                      >
                        Remove item
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="text-sm font-medium text-gray-700">
                      Medicine
                      <select
                        value={item.medicineId}
                        onChange={(event) => updatePurchaseItem(index, "medicineId", event.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                        required
                      >
                        <option value="" disabled>Select medicine</option>
                        {medicines.map((medicine) => (
                          <option key={medicine.id} value={medicine.id}>
                            {medicine.genericName} ({medicine.brandName})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      Batch number
                      <input value={item.batchNumber} onChange={(event) => updatePurchaseItem(index, "batchNumber", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" required />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      Quantity received
                      <input type="number" min="1" value={item.quantity} onChange={(event) => updatePurchaseItem(index, "quantity", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" required />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      Manufacturing date
                      <input type="date" value={item.mfgDate} onChange={(event) => updatePurchaseItem(index, "mfgDate", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" required />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      Expiry date
                      <input type="date" value={item.expiryDate} onChange={(event) => updatePurchaseItem(index, "expiryDate", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" required />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      Purchase price per unit
                      <input type="number" min="0" step="0.01" value={item.purchasePrice} onChange={(event) => updatePurchaseItem(index, "purchasePrice", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" required />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      Selling price per unit
                      <input type="number" min="0" step="0.01" value={item.sellingPrice} onChange={(event) => updatePurchaseItem(index, "sellingPrice", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" required />
                    </label>
                  </div>
                </fieldset>
              ))}
              <button
                type="button"
                onClick={() => setPurchaseForm((current) => ({
                  ...current,
                  items: [...current.items, emptyPurchaseLine(medicines[0] ? String(medicines[0].id) : "")],
                }))}
                disabled={purchaseForm.items.length >= 100}
                className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                Add line item
              </button>
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
                className="px-4 py-2 text-slate-300 text-sm font-medium hover:text-white rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                value="draft"
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save as draft"}
              </button>
              <button
                type="submit"
                value="receive"
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
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBatchFormOpen(false);
          }}
        >
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
                className="px-4 py-2 text-slate-300 text-sm font-medium hover:text-white rounded-lg transition"
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
        
          onClick={(e) => {
            if (e.target === e.currentTarget) setUserFormOpen(false);
          }}
        >
          <form
            onSubmit={handleUserSave}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setUserFormOpen(false);
              }
            }}
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
              {editingUser && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <span className="text-slate-700">Authenticator MFA: {editingUser.mfaEnabled ? "enabled" : "not enrolled"}</span>
                  {editingUser.mfaEnabled && editingUser.id !== session.user.id && (
                    <button type="button" onClick={() => void handleUserMfaReset()} disabled={saving} className="rounded-lg border border-amber-300 px-3 py-2 font-semibold text-amber-800 disabled:opacity-50">Reset MFA</button>
                  )}
                </div>
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
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPasswordChangeOpen(false);
          }}
        >
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
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileEditOpen(false);
          }}
        >
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
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSupplierFormOpen(false);
          }}
        >
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
                className="px-4 py-2 text-slate-300 text-sm font-medium hover:text-white rounded-lg transition"
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
        <div className="fixed inset-0 z-10 bg-gray-900/40 flex items-center justify-center p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCategoryFormOpen(false);
          }}
        >
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
                className="px-4 py-2 text-slate-300 text-sm font-medium hover:text-white rounded-lg transition"
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
          className="fixed inset-0 z-10 overflow-y-auto bg-gray-900/40 flex items-start justify-center p-6"
          role="presentation"
        
          onClick={(e) => {
            if (e.target === e.currentTarget) setFormOpen(false);
          }}
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
            className="my-auto max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto bg-white rounded-xl shadow-xl p-6"
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
                <span className="flex items-center justify-between gap-3">
                  Barcode
                  <button
                    type="button"
                    onClick={() => setBarcodeScannerOpen(true)}
                    className="scan-code-button"
                  >
                    Scan code
                  </button>
                </span>
                <input
                  value={form.barcode}
                  onChange={(event) =>
                    setForm({ ...form, barcode: event.target.value })
                  }
                  placeholder="Scan or enter a barcode"
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
            {barcodeScannerOpen && (
              <BarcodeScanner
                onDetected={(value) => {
                  setForm((current) => ({ ...current, barcode: value }));
                  setBarcodeScannerOpen(false);
                }}
                onClose={() => setBarcodeScannerOpen(false)}
              />
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 text-slate-300 text-sm font-medium hover:text-white rounded-lg transition"
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

      {medicines.length === 0 && !loading && (
        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-xl backdrop-blur-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Formulary Setup
                </span>
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Set up your medicine inventory
              </h3>
              <p className="text-sm text-slate-300 max-w-2xl">
                Add your active pharmaceutical formulations or record an incoming purchase batch to begin tracking stock levels, automated reorder thresholds, and demand forecasts.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {canWriteMedicines && (
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition border border-emerald-500/50"
                >
                  Quick Add Formulation
                </button>
              )}
              {canReceiveStock && (
                <button
                  type="button"
                  onClick={openCreatePurchaseForm}
                  className="rounded-xl border border-slate-700 bg-slate-800/90 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                >
                  Initiate Receipt
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div id="section-metrics" className="dashboard-metric-grid grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg backdrop-blur-md transition hover:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Formulary (SKUs)
            </span>
            <span className="rounded-md border border-slate-700/70 bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-300">
              {medicines.filter((m) => m.active).length} Active
            </span>
          </div>
          <p className="metric-value mt-3 text-3xl font-bold tabular-nums tracking-tight text-white">
            {medicines.length}
          </p>
          <p className="metric-caption mt-1 text-xs text-slate-400">
            {categories.length} formulary categories configured
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-[11px] text-slate-400">
            <span>Formulary status:</span>
            <span className={medicines.length > 0 ? "font-medium text-emerald-400" : "text-slate-500"}>
              {medicines.length > 0 ? "Operational" : "Awaiting input"}
            </span>
          </div>
        </div>

        {(() => {
          const criticalAlertCount =
            alerts.filter(
              (alert) =>
                alert.type === "LOW_STOCK" || alert.type === "OUT_OF_STOCK",
            ).length || lowStockCount;
          const hasCriticalAlerts = criticalAlertCount > 0;
          return (
            <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg backdrop-blur-md transition hover:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Stock Alerts
                </span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                    hasCriticalAlerts
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  {hasCriticalAlerts ? "Attention Needed" : "Optimal"}
                </span>
              </div>
              <p
                className={`metric-value mt-3 text-3xl font-bold tabular-nums tracking-tight ${
                  hasCriticalAlerts ? "text-rose-400" : "text-white"
                }`}
              >
                {criticalAlertCount}
              </p>
              <p className="metric-caption mt-1 text-xs text-slate-400">
                {hasCriticalAlerts
                  ? "Items below minimum reorder thresholds"
                  : "All formulations within safety buffers"}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-[11px] text-slate-400">
                <span>Safety buffer:</span>
                <span
                  className={
                    hasCriticalAlerts
                      ? "font-medium text-rose-400"
                      : "font-medium text-emerald-400"
                  }
                >
                  {hasCriticalAlerts ? "Reorder recommended" : "Buffers verified"}
                </span>
              </div>
            </div>
          );
        })()}

        <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg backdrop-blur-md transition hover:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Forecast Watchlist
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                queuedRiskCount > 0
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-slate-700/70 bg-slate-800/80 text-slate-300"
              }`}
            >
              {queuedRiskCount > 0 ? "Elevated Risk" : "Low Risk"}
            </span>
          </div>
          <p className="metric-value mt-3 text-3xl font-bold tabular-nums tracking-tight text-white">
            {queuedRiskCount}
          </p>
          <p className="metric-caption mt-1 text-xs text-slate-400">
            Run-rate stockout risk (7-30 day window)
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-[11px] text-slate-400">
            <span>Demand projection:</span>
            <span
              className={
                queuedRiskCount > 0
                  ? "font-medium text-amber-400"
                  : "text-slate-400"
              }
            >
              {queuedRiskCount > 0
                ? `${queuedRiskCount} items flagged`
                : "Steady run-rate"}
            </span>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg backdrop-blur-md transition hover:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Review Queue
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                pendingReviewCount > 0
                  ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                  : "border-slate-700/70 bg-slate-800/80 text-slate-300"
              }`}
            >
              {pendingReviewCount > 0 ? "Pending Action" : "Clear"}
            </span>
          </div>
          <p className="metric-value mt-3 text-3xl font-bold tabular-nums tracking-tight text-white">
            {pendingReviewCount}
          </p>
          <p className="metric-caption mt-1 text-xs text-slate-400">
            Pending replenishment decisions
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-[11px] text-slate-400">
            <span>Decisions finalized:</span>
            <span className="font-medium text-cyan-400">
              {approvedReviewCount} approved
            </span>
          </div>
        </div>
      </div>

      <section id="section-forecast" className="dashboard-section mb-8 bg-slate-900/80 rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden backdrop-blur-md">
        <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Forecast risk</h2>
            <p className="text-sm text-slate-400 mt-1">
              Read-only demand-risk overview based on recent stock OUT history and
              stock cover.
            </p>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-center">
            <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Next 30 Days (Active)
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-400 bg-slate-800/80 border border-slate-700/60 hidden sm:inline">
              Next 7 Days
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-400 bg-slate-800/80 border border-slate-700/60 hidden sm:inline">
              Quarterly
            </span>
          </div>
        </div>
        {forecastRisk.length === 0 ? (
          <div className="dashboard-empty-state">
            <span className="dashboard-empty-icon" aria-hidden="true">◌</span>
            <div>
              <p className="dashboard-empty-title">Forecasting is ready for data</p>
              <p>Issue stock over time to build demand history and surface risk signals here.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {forecastRisk.map((item) => {
              const riskTone = {
                LOW: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/30",
                HIGH: "bg-rose-500/15 text-rose-300 border-rose-500/30",
                INSUFFICIENT_DATA:
                  "bg-slate-700/50 text-slate-300 border-slate-600",
              }[item.riskLevel];
              const monitoringTone = {
                OK: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                WATCH: "bg-amber-500/15 text-amber-300 border-amber-500/30",
                INSUFFICIENT_DATA:
                  "bg-slate-700/50 text-slate-300 border-slate-600",
              }[item.monitoringStatus ?? "OK"];
              return (
                <div
                  key={item.medicineId}
                  className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-4 hover:border-slate-600 transition-all shadow-md"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">
                        {item.medicineName}
                      </p>
                      <p className="text-xs text-slate-400">
                        Current stock: {item.currentStock}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${riskTone}`}
                      >
                        {item.riskLevel}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${monitoringTone}`}
                      >
                        {item.monitoringStatus ?? "OK"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    <p>
                      Projected daily demand:{" "}
                      {item.predictedDailyDemand.toFixed(2)}
                    </p>
                    <p>
                      Cover days:{" "}
                      {item.coverDays === null
                        ? "n/a"
                        : item.coverDays.toFixed(2)}
                    </p>
                    <p>
                      7-day projected stock:{" "}
                      {item.projectedStockAfter7Days.toFixed(2)}
                    </p>
                  </div>
                  <p className="mt-3 text-xs text-slate-400 pt-2 border-t border-slate-700/50">{item.message}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section id="section-alerts" className="dashboard-section mb-8 bg-slate-900/80 rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden backdrop-blur-md">
        <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">Inventory alerts</h2>
          {alerts.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              {alerts.length} Action Required
            </span>
          )}
        </div>
        {alerts.length === 0 ? (
          <div className="dashboard-empty-state">
            <span className="dashboard-empty-icon dashboard-empty-icon-success" aria-hidden="true">✓</span>
            <div>
              <p className="dashboard-empty-title">Inventory is clear</p>
              <p>No stock or expiry alerts need attention right now.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 flex items-center justify-between gap-4 hover:bg-slate-800/30 transition"
              >
                <div>
                  <p
                    className={
                      alert.severity === "critical"
                        ? "font-medium text-rose-400"
                        : "font-medium text-amber-400"
                    }
                  >
                    {alert.message}
                  </p>
                  <p className="text-sm text-slate-400">
                    Quantity affected: {alert.quantity} | Status:{" "}
                    {alert.status.toLowerCase()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    {alert.type.replaceAll("_", " ")}
                  </span>
                  {alert.status === "OPEN" && session.user.role !== "Management" && (
                    <button
                      onClick={() => void acknowledgeAlert(alert.id)}
                      className="px-3 py-1 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 text-xs font-semibold transition"
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

      <section id="section-replenishment" className="dashboard-section mb-8 bg-slate-900/80 rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden backdrop-blur-md">
        <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Replenishment recommendations
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Read-only estimates based on recent stock OUT activity and reorder
              levels. Each item can be approved or dismissed by the human
              reviewer.
            </p>
          </div>
          {pendingReviewCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 whitespace-nowrap self-start sm:self-center">
              {pendingReviewCount} Auto-Calculated POs
            </span>
          )}
        </div>
        {replenishmentQueue.length === 0 ? (
          <div className="dashboard-empty-state">
            <span className="dashboard-empty-icon dashboard-empty-icon-purple" aria-hidden="true">↗</span>
            <div>
              <p className="dashboard-empty-title">No review actions yet</p>
              <p>Replenishment suggestions will appear when recent demand indicates a stock risk.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {replenishmentQueue.map((item) => {
              const decision = item.review?.decision ?? "PENDING";
              const decisionTone = {
                PENDING: "text-slate-600 bg-slate-100 border-slate-200",
                APPROVED: "text-emerald-700 bg-emerald-50 border-emerald-200",
                DISMISSED: "text-amber-700 bg-amber-50 border-amber-200",
              }[decision];
              return (
                <div
                  key={item.medicineId}
                  className="p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="font-semibold text-white">
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
                  <div className="flex flex-col items-start gap-3 lg:items-end">
                    <div className="text-left lg:text-right">
                      <p className="text-lg font-bold text-blue-700">
                        {item.recommendedUnits}
                      </p>
                      <p className="text-xs text-gray-500">units to review</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canReviewReplenishment && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              handleReplenishmentDecision(
                                item.medicineId,
                                "APPROVED",
                              )
                            }
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={
                              savingReplenishmentDecision ||
                              decision === "APPROVED"
                            }
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleReplenishmentDecision(
                                item.medicineId,
                                "DISMISSED",
                              )
                            }
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={
                              savingReplenishmentDecision ||
                              decision === "DISMISSED"
                            }
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                    {decision === "APPROVED" && canReceiveStock && (
                      <button
                        type="button"
                        onClick={() => openPurchaseFormForReplenishment(item)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                      >
                        Prepare purchase
                      </button>
                    )}
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${decisionTone}`}
                    >
                      {decision === "PENDING"
                        ? "Awaiting review"
                        : decision === "APPROVED"
                          ? "Approved"
                          : "Dismissed"}
                    </span>
                    {item.review && (
                          <p className="text-xs text-gray-500">
                            Reviewed by {item.review.reviewer.name} on{" "}
                            {new Date(item.review.reviewedAt).toLocaleString()}
                          </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {report && (
        <details id="section-analytics" className="workspace-disclosure mb-8" open={true}>
          <summary className="cursor-pointer">Reports and analytics</summary>
          <div className="workspace-disclosure-content p-6 space-y-8">
          {session.user.role === "Admin" && adminStatistics && (() => {
            const received = adminStatistics.last30Days?.unitsReceived ?? 0;
            const issued = adminStatistics.last30Days?.unitsIssued ?? 0;
            const adjusted = adminStatistics.last30Days?.adjustedUnits ?? 0;
            const totalMovement = Math.max(1, received + issued + adjusted);
            const receivedPct = Math.round((received / totalMovement) * 100);
            const issuedPct = Math.round((issued / totalMovement) * 100);
            const adjustedPct = Math.max(0, 100 - receivedPct - issuedPct);

            return (
            <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-xl relative overflow-hidden">
              <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/40 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Operational Oversight
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Admin inventory statistics</h2>
                  <p className="text-sm text-slate-400">
                    Full operational totals and recent stock movement, visible only to Admin.
                  </p>
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1.5 self-start sm:self-end">
                  Updated {new Date(adminStatistics.generatedAt).toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                {[
                  ["Users", `${adminStatistics.activeUsers} active / ${adminStatistics.users} total`],
                  ["Medicines", `${adminStatistics.activeMedicines} active / ${adminStatistics.medicines} total`],
                  ["Suppliers", adminStatistics.suppliers],
                  ["Batches", adminStatistics.batches],
                  ["Open alerts", `${adminStatistics.openAlerts} / ${adminStatistics.alerts}`],
                  ["Reviews", adminStatistics.replenishmentReviews],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-4 shadow-sm hover:border-teal-500/40 transition-all">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className="mt-1 text-lg font-bold text-white tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-xl border border-slate-700/60 bg-slate-800/50 p-5 shadow-inner">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <span>Last 30 days</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-700/80 text-slate-300">Throughput Velocity</span>
                  </h3>
                  <span className="text-xs text-slate-400 hidden sm:inline">Movement Aggregates</span>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-800">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Transactions</p>
                    <p className="mt-1 text-xl font-bold text-white tabular-nums">{adminStatistics.last30Days?.transactionCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-800">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Units received</p>
                    <p className="mt-1 text-xl font-bold text-emerald-400 tabular-nums">{adminStatistics.last30Days?.unitsReceived ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-800">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Units issued</p>
                    <p className="mt-1 text-xl font-bold text-cyan-400 tabular-nums">{adminStatistics.last30Days?.unitsIssued ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-800">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Adjusted units</p>
                    <p className="mt-1 text-xl font-bold text-amber-400 tabular-nums">{adminStatistics.last30Days?.adjustedUnits ?? 0}</p>
                  </div>
                </div>

                {/* Visual Proportional Flow Bar */}
                <div className="mt-4 pt-3 border-t border-slate-700/50">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span>Stock Movement Ratio</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Received ({receivedPct}%)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400"></span> Issued ({issuedPct}%)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> Adjusted ({adjustedPct}%)</span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden flex">
                    <div style={{ width: `${receivedPct}%` }} className="bg-emerald-500 transition-all" title="Received" />
                    <div style={{ width: `${issuedPct}%` }} className="bg-cyan-500 transition-all" title="Issued" />
                    <div style={{ width: `${adjustedPct}%` }} className="bg-amber-500 transition-all" title="Adjusted" />
                  </div>
                </div>
              </div>
            </section>
          );})()}
          <section className="mb-8 rounded-2xl border border-slate-700/60 bg-slate-900/90 p-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Inventory analytics
                </h2>
                <p className="text-sm text-slate-400">
                  Operational metrics from recorded inventory activity.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-slate-800/70 p-5 rounded-xl border border-slate-700/70 hover:border-teal-500/40 transition-all shadow-sm">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Suppliers</p>
                <p className="text-2xl font-bold text-white tabular-nums mt-1">
                  {report.supplierCount}
                </p>
              </div>
              <div className="bg-slate-800/70 p-5 rounded-xl border border-slate-700/70 hover:border-teal-500/40 transition-all shadow-sm">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Batches</p>
                <p className="text-2xl font-bold text-white tabular-nums mt-1">
                  {report.batchCount}
                </p>
              </div>
              <div className="bg-slate-800/70 p-5 rounded-xl border border-slate-700/70 hover:border-teal-500/40 transition-all shadow-sm">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Units available</p>
                <p className="text-2xl font-bold text-emerald-400 tabular-nums mt-1">
                  {report.totalUnits}
                </p>
              </div>
              <div className="bg-slate-800/70 p-5 rounded-xl border border-slate-700/70 hover:border-teal-500/40 transition-all shadow-sm">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Units issued</p>
                <p className="text-2xl font-bold text-cyan-400 tabular-nums mt-1">
                  {report.issuedUnits}
                </p>
              </div>
              <div className="bg-slate-800/70 p-5 rounded-xl border border-slate-700/70 hover:border-teal-500/40 transition-all shadow-sm">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Inventory cost</p>
                <p className="text-2xl font-bold text-indigo-300 tabular-nums mt-1">
                  {report.inventoryCost.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mt-6 bg-slate-800/60 rounded-xl border border-slate-700/60 p-6 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white">
                  Most issued medicines
                </h3>
                <span className="text-xs text-teal-400">High Turnover Dispensary Queue</span>
              </div>
              {report.topIssuedMedicines.length === 0 ? (
                <p className="text-slate-400 text-sm">
                  No stock-out activity has been recorded yet.
                </p>
              ) : (() => {
                const maxIssued = Math.max(1, ...report.topIssuedMedicines.map(m => m.quantityIssued));
                return (
                <div className="space-y-3">
                  {report.topIssuedMedicines.map((medicine, idx) => {
                    const pct = Math.round((medicine.quantityIssued / maxIssued) * 100);
                    return (
                    <div
                      key={medicine.medicineId}
                      className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">
                            #{idx + 1}
                          </span>
                          <span className="font-medium text-white">
                            {medicine.medicineName}
                          </span>
                        </div>
                        <span className="text-slate-300 text-xs tabular-nums">
                          {medicine.quantityIssued} units issued
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-indigo-500 transition-all"
                        />
                      </div>
                    </div>
                  );})}
                </div>
              );})()}
            </div>

            <div className="mt-6 bg-slate-800/60 rounded-xl border border-slate-700/60 p-6 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white">Research model evaluation</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Synthetic research data only. These metrics are not production forecasts.
                  </p>
                </div>
                {forecastMl?.available && (
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 self-start sm:self-center">
                    Research Model Evaluation
                  </span>
                )}
              </div>
              {!forecastMl?.available || !forecastMl.metrics ? (
                <p className="mt-3 text-sm text-slate-400">
                  No evaluated research model is currently available.
                </p>
              ) : (() => {
                const mae = forecastMl.metrics.metrics.mae;
                const baseline = forecastMl.metrics.metrics.baseline_naive_mae;
                const improvement = baseline > 0 ? (((baseline - mae) / baseline) * 100).toFixed(1) : "0.0";

                return (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Model / dataset</p>
                      <p className="mt-1 font-semibold text-white text-sm">
                        {forecastMl.metrics.model} / {forecastMl.metrics.dataset}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">MAE (units)</p>
                      <p className="mt-1 text-2xl font-bold text-teal-400 tabular-nums">
                        {forecastMl.metrics.metrics.mae.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Naive baseline MAE</p>
                      <p className="mt-1 text-2xl font-bold text-slate-400 tabular-nums">
                        {forecastMl.metrics.metrics.baseline_naive_mae.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-3.5 flex items-center justify-between text-xs text-teal-300">
                    <span className="flex items-center gap-1.5">
                      <span className="text-emerald-400">⚡</span>
                      Research Model Error Gain: <strong>{improvement}% lower error</strong> vs naive baseline
                    </span>
                    <span className="text-slate-400 hidden sm:inline">Calibrated on synthetic series</span>
                  </div>
                </div>
              );})()}
            </div>

            <div className="mt-6 bg-slate-800/60 rounded-xl border border-slate-700/60 p-6 shadow-md">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-bold text-white">Forecast baseline</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Model evaluation and next-period demand outlook.
                  </p>
                </div>
                <label className="text-sm text-slate-300">
                  <span className="sr-only">Select forecast item</span>
                  <select
                    value={effectiveForecastMedicineId ?? ""}
                    onChange={(event) =>
                      setSelectedForecastMedicineId(Number(event.target.value))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 md:w-64 focus:border-teal-400 focus:outline-none"
                    disabled={medicines.length === 0}
                  >
                    {medicines.map((medicine) => (
                      <option key={medicine.id} value={medicine.id}>
                        {medicine.genericName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!forecastBaseline ? (
                <p className="mt-4 text-slate-400 text-sm">
                  Forecast baseline is unavailable for the selected medicine.
                </p>
              ) : (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        MAE
                      </p>
                      <p className="mt-1 text-2xl font-bold text-white tabular-nums">
                        {forecastBaseline.evaluation?.mae == null
                          ? "n/a"
                          : Number(forecastBaseline.evaluation.mae).toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        Observations
                      </p>
                      <p className="mt-1 text-2xl font-bold text-white tabular-nums">
                        {forecastBaseline.evaluation?.observations ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        Status
                      </p>
                      <p className="mt-1 text-lg font-bold text-teal-400 tabular-nums flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        {forecastBaseline.evaluation?.readiness?.status ===
                        "READY_FOR_BASELINE"
                          ? "Ready"
                          : "Insufficient history"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold text-white">
                        LightGBM next-day prediction
                      </h4>
                      <span className="rounded-full bg-indigo-500/20 border border-indigo-500/40 px-3 py-1 text-xs font-medium text-indigo-300">
                        {!effectiveLightGbmPrediction
                          ? "Model unavailable"
                          : effectiveLightGbmPrediction.trainingDataSource === "synthetic"
                            ? "Synthetic training data"
                            : "Operational training data"}
                      </span>
                    </div>
                    {!selectedLightGbmForecast ? (
                      <p className="mt-2 text-sm text-slate-300">
                        The model prediction is unavailable. Check the API model artifact and try again.
                      </p>
                    ) : selectedLightGbmForecast.status === "READY" ? (
                      <p className="mt-2 text-sm text-slate-200">
                        Predicted demand for {selectedLightGbmForecast.forecastDate}: {" "}
                        <strong className="text-teal-300">{selectedLightGbmForecast.predictedQuantity?.toFixed(2)} units</strong>
                        <span className="ml-2 text-indigo-300">
                          ({selectedLightGbmForecast.historyDays} history days)
                        </span>
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-slate-400">
                        Not enough recorded demand for this medicine. The model needs 30 days of history.
                      </p>
                    )}
                    {effectiveLightGbmPrediction?.trainingDataSource === "synthetic" && (
                      <p className="mt-2 text-xs text-indigo-300/80">
                        Demo inference uses this medicine's recent stock issues, but the model was trained on synthetic data and is not production-calibrated.
                      </p>
                    )}
                  </div>

                  <div className="mt-6">
                    <h4 className="font-semibold text-white mb-3 flex items-center justify-between">
                      <span>Next {forecastBaseline.forecast.length} day forecast</span>
                      <span className="text-xs text-slate-400">Predicted daily requirements</span>
                    </h4>
                    <div className="space-y-2">
                      {forecastBaseline.forecast.map((point) => (
                        <div
                          key={`${forecastBaseline.medicineId}-${point.date}`}
                          className="flex items-center justify-between rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-sm"
                        >
                          <span className="font-medium text-slate-200">
                            {new Date(point.date).toLocaleDateString()}
                          </span>
                          <span className="text-teal-300 font-semibold tabular-nums">
                            {Number(point.predictedQuantity ?? 0).toFixed(2)}{" "}
                            units
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
        </details>
      )}

      <div id="section-medicines" className="bg-slate-900/80 rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden mb-8 backdrop-blur-md">
        <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Inventory Overview
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Comprehensive catalog of pharmaceutical formulations and current stock levels
            </p>
          </div>
          <label className="text-sm text-slate-300">
            <span className="sr-only">Search medicines</span>
            <input
              type="search"
              value={medicineSearch}
              onChange={(event) => setMedicineSearch(event.target.value)}
              placeholder="Search by name or barcode"
              className="w-full md:w-80 border border-slate-700 bg-slate-950/80 text-slate-100 rounded-lg px-3 py-2 text-sm focus:border-teal-400 focus:outline-none"
            />
          </label>
        </div>
        {error && <p className="p-6 text-red-400 bg-red-950/40 border-b border-red-800/40">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-950/70 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
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
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="inventory-empty-cell"
                  >
                    Loading inventory data...
                  </td>
                </tr>
              ) : filteredMedicines.length === 0 && !error ? (
                <tr>
                  <td
                    colSpan={7}
                    className="inventory-empty-cell"
                  >
                    {medicines.length === 0
                      ? "No medicines have been added yet."
                      : "No medicines match this search."}
                  </td>
                </tr>
              ) : (
                filteredMedicines.map((med) => (
                  <tr key={med.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-6 py-4 font-semibold text-white">
                      {med.genericName}
                    </td>
                    <td className="px-6 py-4 text-slate-300 text-sm">{med.brandName}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {med.manufacturer || "-"}
                    </td>
                    <td className="px-6 py-4 text-slate-300 text-sm">{med.unit}</td>
                    <td className="px-6 py-4">
                      {med.active ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-300 text-sm">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className={availableMedicineUnits(med) <= med.reorderLevel ? "text-rose-400 font-bold" : availableMedicineUnits(med) <= med.reorderLevel * 2 ? "text-amber-400 font-semibold" : "text-teal-400 font-semibold"}>
                            {availableMedicineUnits(med)}
                          </span>
                          <span className="text-slate-500">/</span>
                          <span className="text-slate-400">{med.reorderLevel}</span>
                        </div>
                        <div className="w-20 h-1 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              availableMedicineUnits(med) <= med.reorderLevel
                                ? "bg-rose-500"
                                : availableMedicineUnits(med) <= med.reorderLevel * 2
                                ? "bg-amber-400"
                                : "bg-teal-400"
                            }`}
                            style={{
                              width: `${Math.min(100, (availableMedicineUnits(med) / Math.max(med.reorderLevel * 2.5, 1)) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canWriteMedicines && (
                        <button
                          onClick={() => openEditForm(med)}
                          className="text-teal-400 hover:text-teal-300 font-medium"
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
        <summary className="cursor-pointer">
          Management and history
        </summary>
        <div className="workspace-disclosure-content">
          <section id="section-categories" className="mt-8 bg-slate-900/80 rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden backdrop-blur-md">
            <div className="p-6 border-b border-slate-800 bg-slate-950/40">
              <h2 className="text-xl font-bold text-white tracking-tight">Categories</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-950/70 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
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
                        <td className="px-6 py-4 font-semibold text-white">
                          {category.name}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {category.description || "-"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {canWriteMedicines && (
                            <button
                              onClick={() => openEditCategoryForm(category)}
                              className="text-teal-400 hover:text-teal-300 font-medium"
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
            <section id="section-users" className="mt-8 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/80 shadow-xl backdrop-blur-md">
              <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/40 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    User access
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Manage account details and assigned roles.
                  </p>
                </div>
                <button
                  onClick={openCreateUserForm}
                  disabled={managedRoles.length === 0}
                  className="rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white hover:from-teal-400 hover:to-teal-500 shadow-md shadow-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add user
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-slate-800 bg-slate-950/70 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Account status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
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
                          <td className="px-6 py-4 font-semibold text-white">
                            {user.name}
                          </td>
                          <td className="px-6 py-4 text-slate-300 text-sm">
                            {user.email}
                          </td>
                          <td className="px-6 py-4 text-slate-300 text-sm">
                            {user.role.name}
                          </td>
                          <td className="px-6 py-4 text-slate-300 text-sm">
                            {user.active ? "Active" : "Deactivated"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openEditUserForm(user)}
                              className="font-medium text-teal-400 hover:text-teal-300"
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

          <section id="section-suppliers" className="mt-8 bg-slate-900/80 rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden backdrop-blur-md">
            <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h2 className="text-xl font-bold text-white tracking-tight">Suppliers</h2>
              <label>
                <span className="sr-only">Search suppliers</span>
                <input
                  type="search"
                  value={supplierSearch}
                  onChange={(event) => setSupplierSearch(event.target.value)}
                  placeholder="Search suppliers"
                  className="w-full md:w-72 border border-slate-700 bg-slate-950/80 text-slate-100 rounded-lg px-3 py-2 text-sm focus:border-teal-400 focus:outline-none"
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-950/70 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Batches</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
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
                        <td className="px-6 py-4 font-semibold text-white">
                          {supplier.name}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {supplier.contactInfo || "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {supplier._count?.batches ?? 0}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {canManageSuppliers && (
                            <button
                              onClick={() => openEditSupplierForm(supplier)}
                              className="text-teal-400 hover:text-teal-300 font-medium"
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

          <section id="section-purchases" className="mt-8 bg-slate-900/80 rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden backdrop-blur-md">
            <div className="p-6 border-b border-slate-800 bg-slate-950/40">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Purchase history
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-950/70 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Purchase</th>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Items</th>
                    <th className="px-6 py-4">Created</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
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
                        <td className="px-6 py-4 font-semibold text-white">
                          #{purchase.id}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {purchase.supplier.name}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {purchase.items
                            .map(
                              (item) =>
                                `${item.medicine.genericName} (${item.quantity})`,
                            )
                            .join(", ")}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {new Date(purchase.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {purchase.status}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {purchase.status === "DRAFT" && canReceiveStock && (
                            <button
                              onClick={() => void receivePurchase(purchase.id)}
                              className="text-teal-400 hover:text-teal-300 font-medium"
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

          <section id="section-batches" className="mt-8 bg-slate-900/80 rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden backdrop-blur-md">
            <div className="p-6 border-b border-slate-800 bg-slate-950/40">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Received batches
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-950/70 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Batch</th>
                    <th className="px-6 py-4">Medicine</th>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Expiry</th>
                    <th className="px-6 py-4 text-right">Quantity</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
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
                        <td className="px-6 py-4 font-semibold text-white">
                          {batch.batchNumber}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {batch.medicine.genericName}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {batch.supplier.name}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          <span className={isExpiryDatePast(batch.expiryDate) ? "text-red-700" : ""}>
                            {new Date(batch.expiryDate).toLocaleDateString()}
                            {isExpiryDatePast(batch.expiryDate) && " (expired)"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm text-right">
                          {batch.quantity}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          {canWriteStock && (
                            <>
                              <button
                                type="button"
                                onClick={() => openStockForm(batch, "OUT")}
                                disabled={isExpiryDatePast(batch.expiryDate)}
                                className="mr-3 font-medium text-teal-400 hover:text-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Issue
                              </button>
                              <button
                                type="button"
                                onClick={() => openStockForm(batch, "ADJ")}
                                className="text-slate-300 text-sm hover:text-gray-900 font-medium"
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

          <section id="section-transactions" className="mt-8 bg-slate-900/80 rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden backdrop-blur-md">
            <div className="p-6 border-b border-slate-800 bg-slate-950/40">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Stock transaction history
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-950/70 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Time</th>
                    <th className="px-6 py-4">Medicine</th>
                    <th className="px-6 py-4">Batch</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Quantity</th>
                    <th className="px-6 py-4">Recorded by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
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
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {new Date(transaction.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 font-semibold text-white">
                          {transaction.batch.medicine.genericName}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {transaction.batch.batchNumber}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {transaction.type}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
                          {transaction.quantity}
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-sm">
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
            <section id="section-audit" className="mt-8 bg-slate-900/80 rounded-2xl shadow-xl border border-slate-700/60 overflow-hidden backdrop-blur-md">
              <div className="p-6 border-b border-slate-800 bg-slate-950/40">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      Audit log
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">
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
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/80 text-slate-100 placeholder-slate-500 px-3 py-2 text-sm focus:border-teal-400 focus:outline-none md:w-64"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void refreshAuditLogs()}
                      className="rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-3 py-2 text-sm font-semibold text-white hover:from-teal-400 hover:to-teal-500 shadow-md shadow-teal-500/20"
                    >
                      Search
                    </button>
                    <button
                      type="button"
                      onClick={exportAuditLogs}
                      disabled={auditLogs.length === 0}
                      className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-700/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
                  <thead className="bg-gray-50 text-slate-300 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4">Time</th>
                      <th className="px-6 py-4">Action</th>
                      <th className="px-6 py-4">Entity</th>
                      <th className="px-6 py-4">User</th>
                      <th className="px-6 py-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
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
                          <td className="px-6 py-4 text-slate-300 text-sm">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 font-semibold text-white">
                            {log.action.replaceAll("_", " ")}
                          </td>
                          <td className="px-6 py-4 text-slate-300 text-sm">
                            {log.entity}
                            {log.entityId === null ? "" : ` #${log.entityId}`}
                          </td>
                          <td className="px-6 py-4 text-slate-300 text-sm">
                            {log.user.name} ({log.user.role.name})
                          </td>
                          <td className="px-6 py-4 text-slate-300 text-sm max-w-sm truncate">
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
