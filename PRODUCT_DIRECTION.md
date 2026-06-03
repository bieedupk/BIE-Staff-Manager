# Product Direction

## Current Context

This project started as BIE Staff Manager for the Board of Islamic Education.

Current organization/client:

- Board of Islamic Education

The long-term direction is to make this project a universal white-label staff management tool for institutes, madrassas, schools, academies, training centers, and offices.

## Product Direction

BIE should be treated as the first organization/customer, not as a permanent product constraint.

The product should not be permanently hardcoded to BIE. BIE-specific text should be used only where it is required for the current organization or as a default/fallback value.

Future product name directions include:

- Staff Manager
- Institute Staff Manager
- Office Staff Manager

The final product name can be decided later.

## White-Label Direction

Future white-label support should include:

- Configurable organization name
- Configurable short name
- Logo and branding
- Tagline
- Primary theme color
- Departments
- Roles
- Attendance settings
- Timezone
- Urdu and English language support
- Institute-friendly and office-friendly terminology
- Future multi-tenant SaaS possibility

White-label support should be added without breaking the current Board of Islamic Education setup.

## Architecture Rule

Do not hardcode BIE-specific text in new features unless it is only default/fallback text.

Use generic terms where possible:

- Organization
- Institute
- Staff
- Employee
- Supervisor
- Admin
- Department
- Attendance
- Daily Reports

New features should stay professional, institute-grade, and suitable for a future sellable product.

## Current Scope Boundary

Do not implement full multi-tenant SaaS yet.

Do not add:

- Billing
- Subscriptions
- Public signup

Do not start broad Phase 2 work before the current MVP is stable.

## MVP Stabilization Priority

First stabilize the core MVP:

- Authentication
- Employees
- Attendance
- Authorized device
- Daily reports
- Report review and rating
- PDF and print export
- Tasks
- Leave
- Admin dashboard
- Employee dashboard

## Planned Phase 1.5

After the MVP is stable, the planned Phase 1.5 should be:

- White-label Organization Settings

Phase 1.5 should focus on organization configuration before broader SaaS expansion.
