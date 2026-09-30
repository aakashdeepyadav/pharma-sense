import { expect, test, type Page } from "@playwright/test";

async function mockDashboardApi(page: Page, role: string) {
  await page.route("**/api/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let response: unknown = { success: true, data: [] };

    if (pathname.endsWith("/auth/login")) {
      response = {
        success: true,
        data: {
          token: "browser-test-token",
          user: { name: "QA User", role },
        },
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
    }

    await route.fulfill({
      status: 200,
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

  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("shows management and receiving actions to Admin", async ({ page }) => {
  await mockDashboardApi(page, "Admin");
  await signIn(page);

  await expect(
    page.getByRole("heading", { name: "Inventory command center" }),
  ).toBeVisible();
  await expect(page.getByText("Admin", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Supplier" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Category" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Add Medicine" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Receive purchase" }),
  ).toBeVisible();
});

test("hides management and receiving actions from Staff", async ({ page }) => {
  await mockDashboardApi(page, "Staff");
  await signIn(page);

  await expect(
    page.getByRole("heading", { name: "Inventory command center" }),
  ).toBeVisible();
  await expect(page.getByText("Staff", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Supplier" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Category" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "+ Add Medicine" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Receive purchase" }),
  ).toHaveCount(0);
});