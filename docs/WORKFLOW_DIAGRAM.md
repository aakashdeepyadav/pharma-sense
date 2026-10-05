# PharmaSense Workflow Diagram

## Mermaid workflow

```mermaid
flowchart TD
    subgraph U[User Roles]
        A[Admin]
        B[Pharmacist]
        C[Inventory Manager]
        D[Staff]
    end

    subgraph F[Frontend Layer]
        F1[React + Vite Dashboard]
        F2[Medicine Management]
        F3[Supplier & Batch Management]
        F4[Purchase & Stock Workflow]
        F5[Alerts & Reports]
        F6[Replenishment Review UI]
    end

    subgraph BAK[Backend Layer]
        B1[Express API]
        B2[JWT Authentication]
        B3[Role-based Authorization]
        B4[Inventory Routes]
        B5[Reports Routes]
        B6[Audit & Decision Logs]
        B7[Health Endpoint]
    end

    subgraph DATA[Data Layer]
        D1[PostgreSQL]
        D2[Prisma ORM]
        D3[Medicine Master Data]
        D4[Batch Records]
        D5[Stock Transactions]
        D6[Audit Logs]
        D7[Revoked Tokens]
    end

    subgraph OPS[Operational Workflow]
        O1[Login]
        O2[Receive Stock]
        O3[Issue Stock]
        O4[Adjust Inventory]
        O5[Purchase Receiving]
        O6[Expiry & Low Stock Checks]
        O7[Alerts]
        O8[Operational Reports]
    end

    subgraph ML[Forecasting & Governance]
        M1[Demand Dataset Validation]
        M2[Feature Engineering]
        M3[Data Readiness Gate]
        M4[Synthetic Fallback Logic]
        M5[LightGBM Baseline]
        M6[Forecast Risk Evaluation]
        M7[Replenishment Recommendation]
        M8[Human Review Required]
        M9[Approved Action Only]
    end

    subgraph SAFE[Production Safety Controls]
        S1[JWT Secret Validation]
        S2[Rate Limiting]
        S3[Input Validation]
        S4[Role Enforcement]
        S5[Audit Trail]
        S6[Session Invalidation]
        S7[Data Quality & Reconciliation]
    end

    A --> F1
    B --> F1
    C --> F1
    D --> F1

    F1 --> F2
    F1 --> F3
    F1 --> F4
    F1 --> F5
    F1 --> F6

    F2 --> B1
    F3 --> B1
    F4 --> B1
    F5 --> B1
    F6 --> B1

    B1 --> B2
    B2 --> B3
    B3 --> B4
    B3 --> B5
    B3 --> B6
    B1 --> B7

    B4 --> D1
    B5 --> D1
    B6 --> D1
    D1 --> D2
    D2 --> D3
    D2 --> D4
    D2 --> D5
    D2 --> D6
    D2 --> D7

    O1 --> O2
    O2 --> O3
    O3 --> O4
    O4 --> O5
    O5 --> O6
    O6 --> O7
    O7 --> O8

    D5 --> M1
    M1 --> M2
    M2 --> M3
    M3 --> M4
    M4 --> M5
    M5 --> M6
    M6 --> M7
    M7 --> M8
    M8 --> M9

    B2 --> S1
    B1 --> S2
    B1 --> S3
    B3 --> S4
    B6 --> S5
    B3 --> S6
    D1 --> S7

    M7 -->|advisory only| F6
    M8 -->|human approval| O5
    S5 -->|decision trace| A
    S5 -->|decision trace| C
    S5 -->|decision trace| B

    classDef role fill:#e0f2fe,stroke:#0284c7,color:#0f172a,stroke-width:1px;
    classDef frontend fill:#dcfce7,stroke:#16a34a,color:#0f172a,stroke-width:1px;
    classDef backend fill:#fef3c7,stroke:#d97706,color:#0f172a,stroke-width:1px;
    classDef data fill:#f3e8ff,stroke:#7c3aed,color:#0f172a,stroke-width:1px;
    classDef ops fill:#fee2e2,stroke:#dc2626,color:#0f172a,stroke-width:1px;
    classDef ml fill:#e2e8f0,stroke:#475569,color:#0f172a,stroke-width:1px;
    classDef safe fill:#fce7f3,stroke:#db2777,color:#0f172a,stroke-width:1px;

    class A,B,C,D role;
    class F1,F2,F3,F4,F5,F6 frontend;
    class B1,B2,B3,B4,B5,B6,B7 backend;
    class D1,D2,D3,D4,D5,D6,D7 data;
    class O1,O2,O3,O4,O5,O6,O7,O8 ops;
    class M1,M2,M3,M4,M5,M6,M7,M8,M9 ml;
    class S1,S2,S3,S4,S5,S6,S7 safe;
```

## Ready-to-use prompt

> Create a professional Mermaid workflow diagram for PharmaSense, a medicine inventory and forecasting platform. Use hierarchical subgraphs for User Roles, Frontend, Backend, Data Layer, Operational Workflow, Forecasting & Governance, and Production Safety Controls. Show Admin, Pharmacist, Inventory Manager, and Staff with access differences. Include React dashboard, Express API, JWT auth, Prisma/PostgreSQL persistence, medicine management, batch management, supplier records, purchase receiving, stock issue/receive/adjustment, alerts, reports, audit logging, and replenishment review. Add a forecasting pipeline with dataset validation, feature engineering, data readiness checks, synthetic fallback, LightGBM baseline, forecast risk scoring, replenishment recommendations, and human review before action. Highlight that the forecast output is advisory only and does not trigger automatic purchase execution. Include rate limiting, input validation, security controls, audit trails, and session invalidation. Use clean Mermaid syntax, clear arrow labels, and a presentation-ready structure.

## Project interpretation

The high-level operating model is:

1. Users interact with the dashboard.
2. The API validates requests and enforces roles.
3. Operational data is stored in PostgreSQL through Prisma.
4. Forecasting reads the operational demand history and builds a predictive baseline.
5. Forecast output informs replenishment decisions, but human review is required.
6. All significant actions are logged for governance and auditability.
