import { expect, test, type Page } from "@playwright/test";

async function mockDashboardApi(
  page: Page,
  role: string,
  includeReplenishment = false,
  includeSecondMedicinePage = false,
  failPurchaseReceive = false,
) {
  let review: {
    decision: "APPROVED" | "DISMISSED";
    notes: null;
    reviewedAt: string;
    reviewer: { id: number; name: string };
  } | null = null;
  let savedPurchase: {
    id: number;
    status: "DRAFT" | "RECEIVED";
    createdAt: string;
    receivedAt: string | null;
    supplier: { name: string };
    createdBy: { name: string };
    items: { id: number; batchNumber: string; quantity: number; medicine: { genericName: string } }[];
  } | null = null;

  await page.route("**/api/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let response: unknown = { success: true, data: [] };
    let status = 200;

    if (pathname.endsWith("/purchases/1/receive")) {
      if (failPurchaseReceive) {
        status = 409;
        response = { success: false, error: { code: "DUPLICATE_BATCH", message: "A batch with this medicine and batch number already exists" } };
      } else {
        if (savedPurchase) savedPurchase.status = "RECEIVED";
        response = { success: true, data: savedPurchase };
      }
    } else if (pathname.endsWith("/purchases")) {
      if (route.request().method() === "POST") {
        const request = route.request().postDataJSON() as {
          items: { batchNumber: string; quantity: number }[];
        };
        savedPurchase = {
          id: 1,
          status: "DRAFT",
          createdAt: "2026-10-19T10:00:00.000Z",
          receivedAt: null,
          supplier: { name: "QA supplier" },
          createdBy: { name: "QA User" },
          items: request.items.map((item, index) => ({
            id: index + 1,
            batchNumber: item.batchNumber,
            quantity: item.quantity,
            medicine: { genericName: "QA medicine" },
          })),
        };
        response = { success: true, data: { id: savedPurchase.id } };
      } else {
        response = { success: true, data: savedPurchase ? [savedPurchase] : [] };
      }
    } else if (pathname.endsWith("/reports/replenishment/decision")) {
      const request = route.request().postDataJSON() as {
        medicineId: number;
        decision: "APPROVED" | "DISMISSED";
      };
      review = {
        decision: request.decision,
        notes: null,
        reviewedAt: "2026-10-18T10:00:00.000Z",
        reviewer: { id: 1, name: "QA User" },
      };
      response = {
        success: true,
        data: { medicineId: request.medicineId, review },
      };
    } else if (pathname.endsWith("/reports/replenishment")) {
      response = {
        success: true,
        data: includeReplenishment
          ? [
              {
                medicineId: 1,
                medicineName: "QA medicine",
                currentUnits: 0,
                reorderLevel: 5,
                averageDailyDemand: 0,
                targetDays: 14,
                targetStock: 5,
                recommendedUnits: 5,
                status: "REPLENISH",
                explanation: "Test recommendation",
                review,
              },
            ]
          : [],
      };
    } else if (pathname.endsWith("/auth/login")) {
      response = {
        success: true,
        data: {
          token: "browser-test-token",
          user: { name: "QA User", role },
        },
      };
    } else if (
      pathname.endsWith("/auth/me") &&
      route.request().method() === "PATCH"
    ) {
      response = {
        success: true,
        data: {
          id: 1,
          name: "Updated QA User",
          email: "updated.qa@pharmasense.local",
          role,
        },
      };
    } else if (pathname.endsWith("/medicines")) {
      const pageNumber = Number(new URL(route.request().url()).searchParams.get("page") ?? "1");
      const medicine = (id: number, genericName: string) => ({
        id,
        genericName,
        brandName: `Brand ${id}`,
        categoryId: 1,
        manufacturer: null,
        dosageForm: null,
        barcode: null,
        active: true,
        unit: "Tablet",
        reorderLevel: 2,
        batches: [{ quantity: 10, expiryDate: "2035-01-01T00:00:00.000Z" }],
      });
      response = {
        success: true,
        data: pageNumber === 2 && includeSecondMedicinePage
          ? [medicine(2, "Second page medicine")]
          : [medicine(1, "QA medicine")],
        ...(includeSecondMedicinePage ? { meta: { totalPages: 2 } } : {}),
      };
    } else if (pathname.endsWith("/suppliers")) {
      response = {
        success: true,
        data: [{ id: 1, name: "QA supplier", contactInfo: null, _count: { batches: 1 } }],
      };
    } else if (pathname.endsWith("/categories")) {
      response = {
        success: true,
        data: [{ id: 1, name: "QA category", description: null }],
      };
    } else if (pathname.endsWith("/batches")) {
      response = {
        success: true,
        data: [
          {
            id: 1,
            medicineId: 1,
            supplierId: 1,
            batchNumber: "QA-BATCH-1",
            mfgDate: "2026-01-01",
            expiryDate: "2028-01-01",
            quantity: 10,
            purchasePrice: 1,
            sellingPrice: 2,
            medicine: { genericName: "QA medicine", brandName: "QA brand" },
            supplier: { name: "QA supplier" },
          },
        ],
      };
    } else if (pathname.endsWith("/users/roles")) {
      response = {
        success: true,
        data: [
          { id: 1, name: "Admin" },
          { id: 2, name: "Inventory Manager" },
          { id: 3, name: "Pharmacist" },
          { id: 4, name: "Staff" },
        ],
      };
    } else if (pathname.endsWith("/users")) {
      response = {
        success: true,
        data: [
          {
            id: 1,
            name: "QA Admin",
            email: "admin@pharmasense.local",
            active: true,
            role: { id: 1, name: "Admin" },
          },
        ],
      };
    } else if (pathname.endsWith("/reports/summary")) {
      response = {
        success: true,
        data: {
          medicineCount: 0,
          supplierCount: 0,
          batchCount: 0,
          totalUnits: 0,
          inventoryCost: 0,
          issuedUnits: 0,
          topIssuedMedicines: [],
        },
      };
    } else if (pathname.endsWith("/audit-logs")) {
      response = {
        success: true,
        data: [
          {
            id: 1,
            action: "MEDICINE_CREATED",
            entity: "Medicine",
            entityId: 1,
            details: null,
            createdAt: "2026-10-03T12:00:00.000Z",
            user: { name: "QA Admin", role: { name: "Admin" } },
          },
        ],
      };
    }

    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email address").fill("qa@pharmasense.local");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in to dashboard" }).click();
}

test("shows a useful error for rejected credentials", async ({ page }) => {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
      }),
    });
  });

  await signIn(page);

  await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
});

test("loads replenishment review decisions from the shared API", async ({
  page,
}) => {
  await mockDashboardApi(page, "Admin", true);
  await signIn(page);

  await expect(page.getByText("QA medicine").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Reviewed by QA User/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Reviewed by QA User/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve" }),
  ).toBeDisabled();
});

test("loads medicines beyond the first API page", async ({ page }) => {
  await mockDashboardApi(page, "Admin", false, true);
  await signIn(page);

  await expect(
    page.getByRole("cell", { name: "Second page medicine", exact: true }),
  ).toBeVisible();
});

test("saves a purchase draft and receives it from purchase history", async ({
  page,
}) => {
  await mockDashboardApi(page, "Admin");
  await signIn(page);

  await page.getByRole("button", { name: "Receive purchase" }).click();
  await page.getByRole("combobox", { name: "Medicine" }).selectOption("1");
  await page.getByRole("combobox", { name: "Supplier" }).selectOption("1");
  await page.getByLabel("Batch number", { exact: true }).fill("QA-DRAFT-BATCH");
  await page.getByLabel("Quantity received").fill("3");
  await page.getByLabel("Manufacturing date").fill("2025-01-01");
  await page.getByLabel("Expiry date").fill("2035-01-01");
  await page.getByRole("button", { name: "Add line item" }).click();
  await page.getByLabel("Batch number").nth(1).fill("QA-DRAFT-BATCH-2");
  await page.getByLabel("Quantity received").nth(1).fill("2");
  await page.getByLabel("Manufacturing date").nth(1).fill("2025-01-01");
  await page.getByLabel("Expiry date").nth(1).fill("2035-01-01");
  await page.getByRole("button", { name: "Save as draft" }).click();

  await page.getByText("Management and history", { exact: true }).click();
  const purchaseHistory = page
    .getByRole("heading", { name: "Purchase history" })
    .locator("xpath=../..");
  const purchaseRow = purchaseHistory.getByRole("row").filter({
    hasText: "QA medicine (3), QA medicine (2)",
  });
  await expect(purchaseRow).toContainText("DRAFT");
  await purchaseRow.getByRole("button", { name: "Receive" }).click();
  await expect(purchaseRow).toContainText("RECEIVED");
});

test("keeps a failed immediate receipt as a recoverable draft", async ({
  page,
}) => {
  await mockDashboardApi(page, "Admin", false, false, true);
  await signIn(page);

  await page.getByRole("button", { name: "Receive purchase" }).click();
  await page.getByRole("combobox", { name: "Medicine" }).selectOption("1");
  await page.getByRole("combobox", { name: "Supplier" }).selectOption("1");
  await page.getByLabel("Batch number").fill("QA-FAILED-RECEIPT");
  await page.getByLabel("Manufacturing date").fill("2025-01-01");
  await page.getByLabel("Expiry date").fill("2035-01-01");
  await page.getByRole("button", { name: "Create and receive" }).click();

  await expect(page.getByText(/remains a draft; receive it from purchase history/)).toBeVisible();
  await page.getByText("Management and history", { exact: true }).click();
  const purchaseHistory = page
    .getByRole("heading", { name: "Purchase history" })
    .locator("xpath=../..");
  const purchaseRow = purchaseHistory.getByRole("row").filter({
    hasText: "QA medicine (1)",
  });
  await expect(purchaseRow).toContainText("DRAFT");
  await expect(purchaseRow.getByRole("button", { name: "Receive" })).toBeVisible();
});

test("keeps the sign-in form keyboard usable without mobile overflow", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByLabel("Email address")).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Email address")).toBeFocused();
  }
});

test("shows management and receiving actions to Admin", async ({ page }) => {
  await mockDashboardApi(page, "Admin");
  await signIn(page);

  await expect(
    page.getByRole("heading", { name: "Inventory command center" }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByText("Admin", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Supplier" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Category" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Add Medicine" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Receive purchase" }),
  ).toBeVisible();
  await page.getByText("Management and history", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await page.getByText("Management and history", { exact: true }).click();
  await page.getByRole("button", { name: "Account settings" }).click();
  await page
    .getByRole("region", { name: "Account settings" })
    .getByRole("button", { name: "Edit profile" })
    .click();
  const profileDialog = page.getByRole("dialog", { name: "Edit profile" });
  await profileDialog
    .getByLabel("Name", { exact: true })
    .fill("Updated QA User");
  await profileDialog
    .getByLabel("Email", { exact: true })
    .fill("updated.qa@pharmasense.local");
  await profileDialog.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("region", { name: "Account settings" }),
  ).toContainText("Updated QA User");
  await expect(
    page.getByRole("region", { name: "Account settings" }),
  ).toContainText("Admin");
  await page
    .getByRole("region", { name: "Account settings" })
    .getByRole("button", { name: "Change password" })
    .click();
  const passwordDialog = page.getByRole("dialog", { name: "Change password" });
  await expect(passwordDialog).toBeVisible();
  await passwordDialog.getByLabel("Current password").fill("old-password");
  await passwordDialog
    .getByLabel("New password", { exact: true })
    .fill("new-password-123");
  await passwordDialog
    .getByLabel("Confirm new password")
    .fill("new-password-123");
  await passwordDialog.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("lets Admin open the user form with available roles", async ({ page }) => {
  await mockDashboardApi(page, "Admin");
  await signIn(page);
  await page.getByText("Management and history", { exact: true }).click();

  await expect(page.getByRole("heading", { name: "User access" })).toBeVisible();
  await expect(page.getByText("admin@pharmasense.local")).toBeVisible();
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByRole("dialog", { name: "Add user" })).toBeVisible();
  await expect(page.getByLabel("Temporary password")).toHaveAttribute(
    "minlength",
    "12",
  );
  await expect(page.getByRole("option", { name: "Staff" })).toBeAttached();
});

test("shows medicine and receiving actions to Pharmacist", async ({ page }) => {
  await mockDashboardApi(page, "Pharmacist");
  await signIn(page);

  await expect(page.getByRole("button", { name: "+ Category" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Add Medicine" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Receive purchase" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Supplier" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ User" })).toHaveCount(0);
  await page.getByText("Management and history", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Audit log" })).toHaveCount(0);
});

test("shows supplier and audit tools to Inventory Manager", async ({ page }) => {
  await mockDashboardApi(page, "Inventory Manager");
  await signIn(page);

  await expect(page.getByRole("button", { name: "+ Supplier" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ User" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Receive purchase" }),
  ).toBeVisible();
  await page.getByText("Management and history", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
});

test("hides management and receiving actions from Staff", async ({ page }) => {
  await mockDashboardApi(page, "Staff");
  await signIn(page);

  await expect(
    page.getByRole("heading", { name: "Inventory command center" }),
  ).toBeVisible();
  await expect(page.getByText("Staff", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Supplier" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ User" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Category" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "+ Add Medicine" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Receive purchase" }),
  ).toHaveCount(0);
  await page.getByText("Management and history", { exact: true }).click();
  const batchRow = page.getByRole("row").filter({ hasText: "QA-BATCH-1" });
  await expect(batchRow.getByRole("button", { name: "Issue" })).toBeVisible();
  await expect(batchRow.getByRole("button", { name: "Adjust" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit log" })).toHaveCount(0);
});

test("keeps dashboard and audit controls usable on narrow screens", async ({
  page,
}) => {
  await mockDashboardApi(page, "Admin");
  await page.setViewportSize({ width: 320, height: 900 });
  await signIn(page);
  await page.getByText("Management and history", { exact: true }).click();

  const auditControls = [
    page.getByRole("searchbox", { name: "Search audit log" }),
    page.getByRole("button", { name: "Search", exact: true }),
    page.getByRole("button", { name: "Export CSV" }),
  ];

  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const control of auditControls) {
      await expect(control).toBeVisible();
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }

    if (width === 320) {
      await auditControls[0].focus();
      await page.keyboard.press("Tab");
      await expect(auditControls[1]).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(auditControls[2]).toBeFocused();
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  }
});

test("opens the medicine form as a named, keyboard-ready dialog", async ({
  page,
}) => {
  await mockDashboardApi(page, "Admin");
  await signIn(page);
  await page.getByRole("button", { name: "+ Add Medicine" }).click();

  const dialog = page.getByRole("dialog", { name: "Add medicine" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Generic name")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Brand name")).toBeFocused();

  const closeButton = dialog.getByRole("button", { name: "Close" });
  const saveButton = dialog.getByRole("button", { name: "Save medicine" });
  await saveButton.focus();
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(saveButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "+ Add Medicine" }),
  ).toBeFocused();
});
