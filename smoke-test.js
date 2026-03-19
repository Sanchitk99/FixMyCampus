const fs = require("node:fs");
const path = require("node:path");

process.env.FIXMYCAMPUS_DB_PATH = path.join(__dirname, "data", "smoke-test.db");
fs.rmSync(process.env.FIXMYCAMPUS_DB_PATH, { force: true });

const { startServer } = require("./server");

(async () => {
  const { server, port } = await startServer(0);
  const base = `http://127.0.0.1:${port}`;
  const sampleProfileImage = "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2232%22%20fill%3D%22%232f73d8%22/%3E%3Ccircle%20cx%3D%2232%22%20cy%3D%2225%22%20r%3D%2212%22%20fill%3D%22white%22/%3E%3Cpath%20d%3D%22M14%2054c4-10%2014-15%2018-15s14%205%2018%2015%22%20fill%3D%22white%22/%3E%3C/svg%3E";
  const sampleUpdateImage = "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2096%2096%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2216%22%20fill%3D%22%23e8f3ff%22/%3E%3Cpath%20d%3D%22M22%2062l14-15%2014%2011%2016-20%208%2010v18H22Z%22%20fill%3D%22%232f73d8%22/%3E%3Ccircle%20cx%3D%2237%22%20cy%3D%2234%22%20r%3D%228%22%20fill%3D%22%235abf7d%22/%3E%3C/svg%3E";
  const sampleReportImage = "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2096%2096%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2216%22%20fill%3D%22%23fff0f0%22/%3E%3Cpath%20d%3D%22M24%2068h48l-9-15-11%209-12-18-16%2024Z%22%20fill%3D%22%23d95f5f%22/%3E%3Ccircle%20cx%3D%2268%22%20cy%3D%2232%22%20r%3D%228%22%20fill%3D%22%23f0b24e%22/%3E%3C/svg%3E";

  try {
    let response = await fetch(`${base}/`);
    console.log("root", response.status);

    response = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: "student@fixmycampus.edu",
        password: "password123"
      }),
      redirect: "manual"
    });

    const studentCookie = (response.headers.get("set-cookie") || "").split(";")[0];
    console.log("student-login", response.status, response.headers.get("location"), Boolean(studentCookie));

    response = await fetch(`${base}/tickets`, {
      headers: { cookie: studentCookie }
    });
    const ticketsHtml = await response.text();
    console.log("tickets", response.status, ticketsHtml.includes("My Tickets"), ticketsHtml.includes("Leaking vents in BLA-210"));

    const supportConversationMatch = ticketsHtml.match(/name="conversationId" value="(\d+)"/);
    console.log("support-drawer", response.status, ticketsHtml.includes("Contact Admin Support"), Boolean(supportConversationMatch));

    if (!supportConversationMatch) {
      throw new Error("Expected support conversation hidden field in support drawer.");
    }

    const supportConversationId = supportConversationMatch[1];

    response = await fetch(`${base}/support/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: studentCookie
      },
      body: new URLSearchParams({
        conversationId: supportConversationId,
        returnTo: "/tickets",
        hashTarget: "#support-chat",
        message: "I need direct help from admin support regarding this campus issue.",
        imageData: sampleReportImage
      }),
      redirect: "manual"
    });
    console.log("support-message", response.status, response.headers.get("location"));

    response = await fetch(`${base}/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: studentCookie
      },
      body: new URLSearchParams({
        fullName: "Shashwat Gupta",
        department: "Computer Science",
        email: "student@fixmycampus.edu",
        phone: "+91 9876543210",
        alternateEmail: "student.alt@fixmycampus.edu",
        campusAddress: "Hostel B, Room 204",
        bio: "Student volunteer and hostel resident.",
        profileImageData: sampleProfileImage
      })
    });
    const profileHtml = await response.text();
    console.log(
      "profile-update",
      response.status,
      profileHtml.includes("Profile updated successfully."),
      profileHtml.includes("Hostel B, Room 204"),
      profileHtml.includes("Student volunteer and hostel resident."),
      profileHtml.includes(sampleProfileImage)
    );

    response = await fetch(`${base}/tickets`, {
      headers: { cookie: studentCookie }
    });
    const ticketsAfterProfileHtml = await response.text();
    console.log(
      "profile-links",
      response.status,
      ticketsAfterProfileHtml.includes('href="/profile"'),
      ticketsAfterProfileHtml.includes(sampleProfileImage)
    );

    response = await fetch(`${base}/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: studentCookie
      },
      body: new URLSearchParams({
        title: "Broken tap in Hostel B",
        category: "Plumbing",
        priority: "high",
        location: "Hostel B, Room 204",
        description: "Water is leaking continuously from the washroom tap.",
        imageData: ""
      }),
      redirect: "manual"
    });

    const detailPath = response.headers.get("location");
    console.log("create", response.status, detailPath);

    response = await fetch(`${base}${detailPath}`, {
      headers: { cookie: studentCookie }
    });
    const detailHtml = await response.text();
    console.log("detail", response.status, detailHtml.includes("Broken tap in Hostel B"));

    response = await fetch(`${base}${detailPath}/updates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: studentCookie
      },
      body: new URLSearchParams({
        message: "Student should not be able to post progress.",
        status: "in_progress"
      }),
      redirect: "manual"
    });
    console.log("student-update-blocked", response.status === 403);

    response = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: "admin@fixmycampus.edu",
        password: "password123"
      }),
      redirect: "manual"
    });
    const adminCookie = (response.headers.get("set-cookie") || "").split(";")[0];
    console.log("admin-login", response.status, Boolean(adminCookie));

    response = await fetch(`${base}/tickets`, {
      headers: { cookie: adminCookie }
    });
    const adminTicketsHtml = await response.text();
    console.log(
      "admin-support-inbox",
      response.status,
      adminTicketsHtml.includes("Open Admin Support Inbox"),
      adminTicketsHtml.includes("I need direct help from admin support regarding this campus issue."),
      adminTicketsHtml.includes("Shashwat Gupta")
    );

    response = await fetch(`${base}/support/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: adminCookie
      },
      body: new URLSearchParams({
        conversationId: supportConversationId,
        returnTo: "/tickets",
        hashTarget: `#support-chat-${supportConversationId}`,
        message: "Admin support is reviewing your concern now.",
        imageData: ""
      }),
      redirect: "manual"
    });
    console.log("admin-support-reply", response.status, response.headers.get("location"));

    response = await fetch(`${base}/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: adminCookie
      },
      body: new URLSearchParams({
        title: "Admin should not create",
        category: "Other",
        location: "Admin Block",
        description: "This should be rejected.",
        imageData: ""
      }),
      redirect: "manual"
    });
    console.log("admin-create-blocked", response.status === 403);

    response = await fetch(`${base}${detailPath}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: adminCookie
      },
      body: new URLSearchParams({
        assignedDepartment: "Plumbing Department"
      }),
      redirect: "manual"
    });
    console.log("assign", response.status, response.headers.get("location"));

    response = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: "plumbing@fixmycampus.edu",
        password: "password123"
      }),
      redirect: "manual"
    });
    const departmentCookie = (response.headers.get("set-cookie") || "").split(";")[0];
    console.log("department-login", response.status, Boolean(departmentCookie));

    response = await fetch(`${base}${detailPath}`, {
      headers: { cookie: departmentCookie }
    });
    const departmentDetailHtml = await response.text();
    console.log(
      "department-anonymous",
      response.status,
      departmentDetailHtml.includes("Reporter: Anonymous"),
      !departmentDetailHtml.includes("Shashwat Gupta"),
      !departmentDetailHtml.includes("student@fixmycampus.edu")
    );

    response = await fetch(`${base}${detailPath}/updates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: departmentCookie
      },
      body: new URLSearchParams({
        message: "Maintenance has been notified.",
        status: "resolved",
        imageData: sampleUpdateImage
      }),
      redirect: "manual"
    });
    console.log("update", response.status, response.headers.get("location"));

    response = await fetch(`${base}/tickets`, {
      headers: { cookie: studentCookie }
    });
    const ticketsWithNotificationHtml = await response.text();
    console.log(
      "notification-badge",
      response.status,
      ticketsWithNotificationHtml.includes('href="/notifications"'),
      ticketsWithNotificationHtml.includes('class="badge">1<')
    );
    console.log("support-reply-visible", ticketsWithNotificationHtml.includes("Admin support is reviewing your concern now."));

    response = await fetch(`${base}/notifications`, {
      headers: { cookie: studentCookie }
    });
    const notificationsHtml = await response.text();
    const notificationOpenMatch = notificationsHtml.match(/href="(\/notifications\/\d+\/open)"/);
    console.log(
      "notifications-page",
      response.status,
      notificationsHtml.includes("Notifications"),
      notificationsHtml.includes("Plumbing Department updated Ticket"),
      Boolean(notificationOpenMatch)
    );

    if (!notificationOpenMatch) {
      throw new Error("Expected a notification deep link for the updated ticket.");
    }

    response = await fetch(`${base}${notificationOpenMatch[1]}`, {
      headers: { cookie: studentCookie },
      redirect: "manual"
    });
    console.log("notification-open", response.status, response.headers.get("location"));

    response = await fetch(`${base}/tickets`, {
      headers: { cookie: studentCookie }
    });
    const ticketsAfterOpenHtml = await response.text();
    console.log(
      "notification-read",
      response.status,
      ticketsAfterOpenHtml.includes('href="/notifications"'),
      !ticketsAfterOpenHtml.includes('class="badge">1<')
    );

    response = await fetch(`${base}${detailPath}/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: studentCookie
      },
      body: new URLSearchParams({
        message: "The department update is inaccurate. No one has visited the hostel block yet.",
        imageData: sampleReportImage
      }),
      redirect: "manual"
    });
    console.log("report-false-update", response.status, response.headers.get("location"));

    response = await fetch(`${base}${detailPath}`, {
      headers: { cookie: studentCookie }
    });
    const updatedHtml = await response.text();
    console.log(
      "updated-detail",
      response.status,
      updatedHtml.includes("Maintenance has been notified."),
      updatedHtml.includes("RESOLVED"),
      updatedHtml.includes("Assigned: Plumbing Department"),
      updatedHtml.includes("The department update is inaccurate. No one has visited the hostel block yet."),
      updatedHtml.includes("Priority: High"),
      updatedHtml.includes(sampleUpdateImage),
      updatedHtml.includes(sampleReportImage)
    );

    response = await fetch(`${base}${detailPath}/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: studentCookie
      },
      body: new URLSearchParams({
        rating: "2",
        comment: "The ticket was closed too early."
      }),
      redirect: "manual"
    });
    console.log("feedback", response.status, response.headers.get("location"));

    response = await fetch(`${base}${detailPath}`, {
      headers: { cookie: studentCookie }
    });
    const feedbackHtml = await response.text();
    console.log("feedback-visible", response.status, feedbackHtml.includes("Reporter Rating: 2/5"), feedbackHtml.includes("The ticket was closed too early."));

    response = await fetch(`${base}${detailPath}/reopen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: studentCookie
      },
      body: new URLSearchParams({
        reason: "The washroom tap is still leaking."
      }),
      redirect: "manual"
    });
    console.log("reopen", response.status, response.headers.get("location"));

    response = await fetch(`${base}${detailPath}`, {
      headers: { cookie: studentCookie }
    });
    const reopenedHtml = await response.text();
    console.log("reopen-visible", response.status, reopenedHtml.includes("Reporter requested reopen: The washroom tap is still leaking."), reopenedHtml.includes("OPEN"));

    response = await fetch(`${base}${detailPath}`, {
      headers: { cookie: adminCookie }
    });
    const adminDetailHtml = await response.text();
    console.log(
      "admin-sees-report",
      response.status,
      adminDetailHtml.includes("The department update is inaccurate. No one has visited the hostel block yet."),
      adminDetailHtml.includes("Reporter: Shashwat Gupta"),
      adminDetailHtml.includes("student@fixmycampus.edu")
    );
  } finally {
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
