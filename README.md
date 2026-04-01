# ClassCloud

A centralized quarterly test reporting and school management system for Baliwag North Central School.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack, Cache Components)
- **Language:** TypeScript
- **UI:** Mantine v8, Tailwind CSS v4, Tabler Icons
- **Backend:** Supabase (PostgreSQL + RLS)
- **Auth:** Supabase SSR
- **Email:** Resend
- **PDF/Export:** jsPDF, xlsx-js-style
- **OMR:** OpenCV.js
- **Deployment:** Vercel

## Features

- **Exams** — create, copy, and manage quarterly exams with answer keys and learning objectives
- **OMR Scanning** — scan and auto-score paper answer sheets via camera using OpenCV
- **Reports** — item analysis, level of proficiency, and LAEMPL reports with export
- **Classes** — section management, student rosters, subject-teacher assignments, and transfer requests
- **Curriculum** — grade-level curriculum and subject management
- **Faculty** — teaching load assignment
- **School Year** — academic year and quarter management
- **User Roles & Permissions** — role-based access control with granular permissions
- **User Management** — signup approval workflow with email notifications
