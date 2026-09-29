import { useEffect, useState } from "react";

type Medicine = {
  id: number;
  genericName: string;
  brandName: string;
  unit: string;
  reorderLevel: number;
  batches: { quantity: number }[];
};

type ApiResponse = {
  success: boolean;
  data: Medicine[];
};

function App() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadMedicines = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/v1/medicines");
        if (!response.ok) {
          throw new Error("The inventory service returned an error.");
        }

        const result = (await response.json()) as ApiResponse;
        setMedicines(result.data);
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

    void loadMedicines();
  }, []);

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
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
          + Add Medicine
        </button>
      </header>

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
                      <button className="text-blue-600 hover:text-blue-800 font-medium">
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
