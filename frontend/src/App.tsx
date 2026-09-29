import React from 'react';

function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-blue-600 mb-4">PharmaSense MVP</h1>
        <p className="text-gray-600 mb-6">
          Agent-Based Medicine Stock Management System
        </p>
        <div className="flex gap-4 justify-center">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Login
          </button>
          <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">
            View Inventory
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
