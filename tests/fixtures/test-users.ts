export const TEST_USERS = {
  admin: {
    email: "sbims-test-admin@maildrop.cc",
    password: "TestPassword2026!",
    firstName: "Test",
    lastName: "Administrator",
    role: "administrator",
  },

  student: {
    email: "sbims-test-student@maildrop.cc",
    password: "TestPassword2026!",
    firstName: "Test",
    lastName: "Student",
    role: "student",
  },

  coordinator: {
    email: "sbims-test-coordinator@maildrop.cc",
    password: "TestPassword2026!",
    firstName: "Test",
    lastName: "Internship Coordinator",
    role: "internship_coordinator",
  },

  hteSupervisor: {
    email: "sbims-test-hte-supervisor@maildrop.cc",
    password: "TestPassword2026!",
    firstName: "Test",
    lastName: "HTE Supervisor",
    role: "hte_supervisor",
  },

  otherHteSupervisor: {
    email: "sbims-test-hte-supervisor-2@maildrop.cc",
    password: "TestPassword2026!",
    firstName: "Test",
    lastName: "Other HTE Supervisor",
    role: "hte_supervisor",
  },

  facultyAdviser: {
    email: "sbims-test-faculty-adviser@maildrop.cc",
    password: "TestPassword2026!",
    firstName: "Test",
    lastName: "Faculty Adviser",
    role: "faculty_adviser",
  },

  otherFacultyAdviser: {
    email: "sbims-test-faculty-adviser-2@maildrop.cc",
    password: "TestPassword2026!",
    firstName: "Test",
    lastName: "Other Faculty Adviser",
    role: "faculty_adviser",
  },

  firstLogin: {
    email: "sbims-test-first-login@maildrop.cc",
    password: "TestPassword2026!",
    newPassword: "NewTestPassword2026!",
    firstName: "Test",
    lastName: "FirstLogin",
    role: "student",
  },
} as const;
