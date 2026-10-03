import { expect, test, type Page } from "@playwright/test";

async function openManagementHistory(page: Page) {
  const section = page
    .locator("details.workspace-disclosure")
    .filter({ hasText: "Management and history" });
  if ((await section.getAttribute("open")) === null) {
    await section.locator("summary").click();
  }
  await expect(section).toHaveAttribute("open", "");
}

test("creates medicine and supplier, receives a batch, and issues stock", async ({
  page,
}) => {
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("E2E_ADMIN_PASSWORD must be configured for live tests");
  }
  const suffix = Date.now().toString();
  const medicineName = `Browser test medicine ${suffix}`;
  const brandName = `Browser test brand ${suffix}`;
  const supplierName = `Browser test supplier ${suffix}`;
  const batchNumber = `E2E-${suffix}`;
  const issueReason = `Browser workflow verification ${suffix}`;
  const manufacturingDate = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const expiryDate = new Date(Date.now() + 730 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await page.goto("/");
  await page.getByLabel("Email address").fill("admin@pharmasense.local");
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in to dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory command center" }),
  ).toBeVisible();

  const managedUserEmail = `browser.user.${suffix}@pharmasense.local`;
  await page.getByRole("button", { name: "+ User" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`Browser User ${suffix}`);
  await page.getByLabel("Email", { exact: true }).fill(managedUserEmail);
  await page
    .getByRole("combobox", { name: "Role" })
    .selectOption({ label: "Staff" });
  await page
    .getByLabel("Temporary password")
    .fill(`Browser-user-${suffix}`);
  await page.getByRole("button", { name: "Create user" }).click();
  await openManagementHistory(page);
  const userAccessSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "User access" }) });
  const managedUserRow = userAccessSection
    .getByRole("row")
    .filter({ hasText: managedUserEmail });
  await expect(managedUserRow).toContainText("Staff");
  await managedUserRow.getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("combobox", { name: "Role" })
    .selectOption({ label: "Pharmacist" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await openManagementHistory(page);
  await expect(managedUserRow).toContainText("Pharmacist");

  await page.getByRole("button", { name: "+ Supplier" }).click();
  await page.getByLabel("Supplier name").fill(supplierName);
  await page.getByRole("button", { name: "Save supplier" }).click();
  await openManagementHistory(page);
  await expect(page.getByText(supplierName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "+ Add Medicine" }).click();
  await page.getByLabel("Generic name").fill(medicineName);
  await page.getByLabel("Brand name").fill(brandName);
  await page.getByRole("button", { name: "Save medicine" }).click();
  await expect(page.getByText(medicineName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Receive stock" }).click();
  await page
    .getByRole("combobox", { name: "Medicine" })
    .selectOption({ label: `${medicineName} (${brandName})` });
  await page
    .getByRole("combobox", { name: "Supplier" })
    .selectOption({ label: supplierName });
  await page.getByLabel("Batch number").fill(batchNumber);
  await page.getByLabel("Quantity received").fill("5");
  await page.getByLabel("Manufacturing date").fill(manufacturingDate);
  await page.getByLabel("Expiry date").fill(expiryDate);
  await page.getByRole("button", { name: "Receive stock" }).last().click();
  await expect(page.getByText(batchNumber, { exact: true })).toBeVisible();

  const batchRow = page.getByRole("row").filter({ hasText: batchNumber });
  await batchRow.getByRole("button", { name: "Issue" }).click();
  await page.getByLabel("Quantity issued").fill("2");
  await page.getByLabel("Reason or notes").fill(issueReason);
  await page.getByRole("button", { name: "Save movement" }).click();

  const medicineRow = page.getByRole("row").filter({ hasText: medicineName });
  await expect(medicineRow.getByText("3 / 0", { exact: true })).toBeVisible();

  await openManagementHistory(page);
  const transactionHistorySection = page
    .getByRole("heading", { name: "Stock transaction history" })
    .locator("xpath=../..");
  const issuedTransaction = transactionHistorySection
    .getByRole("row")
    .filter({ hasText: batchNumber })
    .filter({ hasText: "OUT" });
  await expect(issuedTransaction).toContainText("2");
  await expect(
    page.getByText(new RegExp(`"notes":"${issueReason}"`)),
  ).toBeVisible();

  await batchRow.getByRole("button", { name: "Issue" }).click();
  await page.getByLabel("Quantity issued").fill("4");
  await page.getByLabel("Reason or notes").fill(`Over-issue check ${suffix}`);
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(
    page.getByText("Insufficient stock for this operation", { exact: true }),
  ).toBeVisible();
  await expect(batchRow.getByRole("cell", { name: "3", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  const expiredBatchNumber = `E2E-EXPIRED-${suffix}`;
  const expiredManufacturingDate = new Date(Date.now() - 730 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const pastExpiryDate = new Date(Date.now() - 365 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await page.getByRole("button", { name: "Receive stock" }).click();
  await page
    .getByRole("combobox", { name: "Medicine" })
    .selectOption({ label: `${medicineName} (${brandName})` });
  await page.getByLabel("Batch number").fill(expiredBatchNumber);
  await page.getByLabel("Quantity received").fill("5");
  await page.getByLabel("Manufacturing date").fill(expiredManufacturingDate);
  await page.getByLabel("Expiry date").fill(pastExpiryDate);
  await page.getByRole("button", { name: "Receive stock" }).last().click();

  await openManagementHistory(page);
  const receivedBatchesSection = page
    .getByRole("heading", { name: "Received batches" })
    .locator("xpath=../..");
  const expiredBatchRow = receivedBatchesSection
    .getByRole("row")
    .filter({ hasText: expiredBatchNumber });
  await expect(expiredBatchRow).toBeVisible();
  await expiredBatchRow.getByRole("button", { name: "Issue" }).click();
  await page.getByLabel("Quantity issued").fill("1");
  await page.getByLabel("Reason or notes").fill(`Expired issue check ${suffix}`);
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(
    page.getByText("Expired batches cannot be issued", { exact: true }),
  ).toBeVisible();
  await expect(expiredBatchRow.getByRole("cell", { name: "5", exact: true })).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: expiredBatchNumber }).filter({ hasText: "OUT" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();

  const alertMedicineName = `Browser alert medicine ${suffix}`;
  const alertBrandName = `Browser alert brand ${suffix}`;
  await page.getByRole("button", { name: "+ Add Medicine" }).click();
  await page.getByLabel("Generic name").fill(alertMedicineName);
  await page.getByLabel("Brand name").fill(alertBrandName);
  await page.getByLabel("Reorder level").fill("10");
  await page.getByRole("button", { name: "Save medicine" }).click();

  const purchaseBatchNumber = `E2E-PURCHASE-${suffix}`;
  const purchaseNote = `Purchase workflow ${suffix}`;
  await page.getByRole("button", { name: "Receive purchase" }).click();
  await page
    .getByRole("combobox", { name: "Medicine" })
    .selectOption({ label: `${alertMedicineName} (${alertBrandName})` });
  await page
    .getByRole("combobox", { name: "Supplier" })
    .selectOption({ label: supplierName });
  await page.getByLabel("Batch number").fill(purchaseBatchNumber);
  await page.getByLabel("Quantity received").fill("2");
  await page.getByLabel("Manufacturing date").fill(manufacturingDate);
  await page.getByLabel("Expiry date").fill(expiryDate);
  await page.getByLabel("Purchase price per unit").fill("1.25");
  await page.getByLabel("Selling price per unit").fill("2.50");
  await page.getByLabel("Purchase notes").fill(purchaseNote);
  await page.getByRole("button", { name: "Create and receive" }).click();

  await openManagementHistory(page);
  const purchaseHistorySection = page
    .getByRole("heading", { name: "Purchase history" })
    .locator("xpath=../..");
  const receivedPurchaseRow = purchaseHistorySection
    .getByRole("row")
    .filter({ hasText: alertMedicineName });
  await expect(receivedPurchaseRow).toContainText("RECEIVED");
  const purchaseId = (await receivedPurchaseRow
    .locator("td")
    .first()
    .innerText()).replace("#", "");
  const purchaseBatchRow = receivedBatchesSection
    .getByRole("row")
    .filter({ hasText: purchaseBatchNumber });
  await expect(purchaseBatchRow).toContainText("2");
  const purchaseReceiptTransaction = transactionHistorySection
    .getByRole("row")
    .filter({ hasText: purchaseBatchNumber })
    .filter({ hasText: "IN" });
  await expect(purchaseReceiptTransaction).toContainText("2");

  const alertMessage = `${alertMedicineName} is at or below its reorder level`;
  const lowStockAlert = page.getByText(alertMessage, { exact: true });
  await expect(lowStockAlert).toBeVisible();
  const alertRow = lowStockAlert.locator("xpath=../..");
  await alertRow.getByRole("button", { name: "Acknowledge" }).click();
  await expect(alertRow).toContainText("acknowledged");
  await expect(
    page.getByRole("button", { name: "Acknowledge" }),
  ).toHaveCount(0);
  const purchaseAuditRow = page
    .getByRole("row")
    .filter({ hasText: `Purchase #${purchaseId}` })
    .filter({ hasText: "PURCHASE RECEIVED" });
  await expect(purchaseAuditRow).toBeVisible();
});