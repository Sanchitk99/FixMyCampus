# FixMyCampus

<<<<<<< HEAD
=======
FixMyCampus is a campus issue reporting and resolution system for universities. It lets students and faculty report civic or maintenance issues, allows an admin to assign each ticket to the correct department, and enables departments to post progress updates while keeping the original reporter informed.

The current version is a working Node.js application with SQLite persistence, role-based access, seeded demo accounts, and a campus-focused ticket workflow.

## Highlights

- Student and faculty reporting
- Admin-based department assignment
- Department-only progress updates
- Reporter visibility into full ticket history
- Editable user profile page
- False-update escalation from reporter to admin
- Priority-based ticketing and filtering
- Resolved-ticket feedback and reopen requests

## Workflow

1. A student or faculty member creates a ticket.
2. The admin reviews the ticket and assigns it to the correct department.
3. The assigned department posts progress updates.
4. The original reporter tracks progress on the ticket page.
5. If a department update looks incorrect, the reporter can flag it to the admin.
6. After resolution, the reporter can submit satisfaction feedback or request a reopen.

## Roles

### Student / Faculty

- Can create tickets
- Can view only their own tickets
- Can see department progress
- Can report a false department update to admin
- Can rate a resolved ticket
- Can request reopening of a resolved ticket

### Admin

- Can view all tickets
- Can assign tickets to departments
- Can review reporter escalations on tickets
- Cannot create reporter tickets
- Cannot post department progress updates

### Department

- Can view tickets assigned to their department
- Can update progress and change ticket status
- Cannot create reporter tickets
- Cannot assign tickets

## Implemented Features

- Authentication with cookie-based sessions
- Signup for reporter accounts (`student` and `faculty`)
- Seeded accounts for admin and department users
- SQLite-backed persistence
- Ticket creation with:
  - title
  - category
  - priority
  - location
  - description
  - optional image upload preview
- Ticket list with:
  - search
  - category filters
  - status filters
  - priority filters
- Ticket detail page with:
  - assignment visibility
  - progress timeline
  - reporter-to-admin escalation section
  - resolved-ticket feedback
  - reopen request flow
- Profile page with:
  - name
  - department / course
  - phone number
  - alternate email
  - campus address
  - personal bio / contact note
  - profile image upload

## Ticket Categories

- Plumbing
- Electrical
- Safety
- Internet
- Cleanliness
- Other

## Department Mapping

- Plumbing -> Plumbing Department
- Electrical -> Electrical Department
- Safety -> Safety Department
- Internet -> IT Support Department
- Cleanliness -> Sanitation Department
- Other -> General Facilities Department

## Demo Accounts

### Reporter Accounts

- Student: `student@fixmycampus.edu` / `password123`
- Faculty: `faculty@fixmycampus.edu` / `password123`

### Admin Account

- Admin: `admin@fixmycampus.edu` / `password123`

### Department Accounts

- Plumbing Department: `plumbing@fixmycampus.edu` / `password123`
- Electrical Department: `electrical@fixmycampus.edu` / `password123`
- Safety Department: `safety@fixmycampus.edu` / `password123`
- IT Support Department: `internet@fixmycampus.edu` / `password123`
- Sanitation Department: `cleanliness@fixmycampus.edu` / `password123`
- General Facilities Department: `facilities@fixmycampus.edu` / `password123`

## Tech Stack

- Node.js
- Built-in `node:http` server
- Built-in `node:sqlite` database access
- Server-rendered HTML
- Shared CSS and small client-side JavaScript helpers

## Project Structure

```text
FixMyCampus/
|-- server.js
|-- package.json
|-- README.md
|-- app-extra.css
|-- css/
|   `-- style.css
|-- public/
|   `-- js/
|       `-- app.js
|-- data/
|   `-- fixmycampus.db
`-- smoke-test.js
```

## Run Locally

### Requirements

- Node.js 24+ recommended

### Start the app

```bash
npm start
```

The app runs at:

```text
http://127.0.0.1:3000
```

## Verification

Run the end-to-end smoke test:

```bash
node smoke-test.js
```

The smoke test covers:

- reporter login
- profile update
- ticket creation
- blocked unauthorized actions
- admin assignment
- department progress update
- false-update reporting
- feedback submission
- reopen request

## Notes

- The application uses `node:sqlite`, which currently shows an experimental warning in Node.js.
- The database is created automatically inside `data/`.
- Reporter signup is limited to `student` and `faculty` roles by design.

## Future Enhancements

- Admin review state for false-update reports
- Email or notification support
- File uploads stored outside the database
- Department performance analytics
- SLA tracking and overdue ticket alerts
>>>>>>> c427afe (Save before fixing branch)
