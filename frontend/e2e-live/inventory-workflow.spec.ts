import { expect, test } from "@playwright/test";

test("creates medicine and supplier, receives a batch, and issues stock", async ({
  page,
}) => {
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
  await page.getByLabel("Password").fill("admin12345");
  await page.getByRole("button", { name: "Sign in to dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory command center" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "+ Supplier" }).click();
  await page.getByLabel("Supplier name").fill(supplierName);
  await page.getByRole("button", { name: "Save supplier" }).click();
  await page.getByText("Management and history", { exact: true }).click();
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

  const issuedTransaction = page
    .getByRole("row")
    .filter({ hasText: batchNumber })
    .filter({ hasText: "OUT" });
  await expect(issuedTransaction).toContainText("2");
  await expect(
    page.getByText(new RegExp(`"notes":"${issueReason}"`)),
  ).toBeVisible();
});